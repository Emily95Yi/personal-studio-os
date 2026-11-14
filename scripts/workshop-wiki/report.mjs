import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from './archive.mjs';

const toJson = value => JSON.stringify(value, null, 2) + '\n';
const csv = (header, rows) => [header, ...rows].map(row => row.map(value => {
  const cell = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Keep source fields literal in JSON and prevent spreadsheet formula execution in CSV.
  return '"' + (/^[\s]*[=+@-]/.test(cell) ? "'" : '') + cell.replaceAll('"', '""') + '"';
}).join(',')).join('\r\n') + '\r\n';
const md = value => String(value ?? '').replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ');
const table = (head, rows) => [head, head.map(() => '---'), ...rows]
  .map(row => '| ' + row.map(md).join(' | ') + ' |').join('\n');
const tally = (rows, key) => Object.entries(Object.groupBy(rows, row => row[key])).map(([name, group]) => [name, group.length]);
const extensions = { text: 'txt', markdown: 'md', html: 'html', json: 'json', richtext: 'json', unknown: 'txt' };
function clientTime(value) {
  if (!value || Number.isNaN(Date.parse(value))) return '未知';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'medium' })
    .format(new Date(value)) + '（日本时间）';
}
const dispositions = ['tools_methods', 'prompts_facilitation', 'concepts_principles', 'selfboard_resources', 'needs_review'];

export async function writeReport(dir, { source, baseline, archive, records, excluded, mapping, plan, rerun, manifest }) {
  // A new private output directory per run prevents stale corpus files and overwrites.
  await mkdir(dir, { mode: 0o700 });
  const corpus = join(dir, 'wiki-text-corpus');
  await mkdir(corpus, { mode: 0o700 });
  const write = (path, contents) => writeFile(path, contents, { flag: 'wx', mode: 0o600 });
  const json = (filename, contents) => write(join(dir, filename), toJson(contents));
  const fulltext = [];
  for (const [index, record] of records.entries()) {
    record.content.corpusFiles = {};
    for (const variant of record.content.variants) {
      const name = record.targetId + '.' + variant.field.replaceAll('/', '-') + '.' + extensions[variant.format];
      const path = join(corpus, name);
      await write(path, variant.raw);
      if (sha256(await readFile(path)) !== variant.sha256) throw new Error('正文写回校验失败：' + name);
      record.content.corpusFiles[variant.field] = 'wiki-text-corpus/' + name;
      fulltext.push({ targetId: plan.rows[index].id, legacyId: record.legacyRef.id, title: record.title, field: variant.field,
        bytes: variant.bytes, characters: variant.characters, sha256: variant.sha256, file: record.content.corpusFiles[variant.field] });
    }
  }
  const media = records.flatMap(record => record.mediaSlots.map(slot => ({ targetId: record.targetId, ...slot })));
  const issues = [...plan.reasons, ...records.flatMap(record => record.mediaSlots
    .filter(slot => slot.anchor == null || (slot.legacyMediaId && !slot.assetPointer) ||
      (slot.placement === 'inline' && !slot.legacyMediaId && !slot.sourceUrl && !slot.mime))
    .map(slot => ({ id: record.targetId, mediaSlotId: slot.mediaSlotId, reason: 'media_anchor_or_source_needs_review' })))];
  const verification = { source, baseline, databases: archive.counts, excluded, exportVersion: archive.exportVersion, metaVersion: archive.metaVersion,
    manifest, records: fulltext, counts: { byDestination: Object.fromEntries(dispositions.map(target =>
      [target, records.filter(record => record.category.target === target).length])),
    byArchiveStore: Object.fromEntries(tally(records.map(row => ({ store: row.legacyRef.store })), 'store')),
    excluded: excluded.length, media: media.length, legacyRelations: plan.relationRows.length,
    invalidSourceMarkers: archive.issues.length, before: plan.beforeCounts, after: plan.afterCounts, retainedResources: plan.retainedResources,
    firstRun: Object.fromEntries(tally(plan.rows, 'action')), secondRun: Object.fromEntries(tally(rerun.rows, 'action')) } };
  const corpusRows = records.map(record => {
    const path = record.content.corpusFiles[record.content.sourceRawField];
    return '- ' + (path ? '[' + record.title.replace(/[\[\]]/g, '\\$&') + '](' + path + ')' : record.title) +
      ' · `' + record.legacyRef.id + '` · ' + record.category.target;
  });
  await write(join(dir, 'wiki-text-index.md'), '# Wiki 逐篇原文\n\n' + corpusRows.join('\n') + '\n');
  await json('wiki-records.json', records);
  await json('category-id-map.json', { groups: mapping, needsReview: plan.rows.filter(row => row.target === 'needs_review') });
  await json('relations.json', { legacyIdToTarget: plan.rows, relations: plan.relationRows });
  await json('unmatched.json', { excluded, issues });
  await json('verification.json', verification);
  await json('studio-transfer.preview.json', plan.transfer);
  await write(join(dir, 'inventory.csv'), csv([
    'legacy_db', 'legacy_store', 'legacy_key', 'legacy_id', 'title', 'legacy_category_id', 'legacy_category_name',
    'stored_category', 'legacy_section', 'folder_id', 'folder_path', 'old_wiki_directory', 'legacy_url', 'target_id',
    'target_category', 'action', 'format', 'raw_field', 'bytes', 'characters', 'sha256', 'corpus_file',
    'media_slot_count', 'relations', 'version_count', 'created_at', 'updated_at', 'status', 'tags', 'source_url',
  ], records.map((r, i) => [r.legacyRef.db, r.legacyRef.store, r.legacyRef.key, r.legacyRef.id, r.title, r.category.legacyId,
    r.category.legacyName, r.category.storedCategory, r.category.legacySectionId, r.metadata.folderId, r.metadata.folderPath,
    r.metadata.legacyDirectory, r.legacyRef.legacyUrl, plan.rows[i].id, r.category.target, plan.rows[i].action, r.content.format,
    r.content.sourceRawField, r.content.bytes, r.content.characters, r.content.sha256, r.content.corpusFiles[r.content.sourceRawField],
    r.mediaSlots.length, r.relations.length, r.metadata.revisions.length, r.metadata.createdAt, r.metadata.updatedAt,
    r.metadata.status, r.metadata.tags, r.metadata.sourceUrl])));
  const mediaFields = ['targetId', 'legacyParentId', 'mediaSlotId', 'legacyMediaId', 'placement', 'anchor', 'bodyField', 'offset',
    'length', 'order', 'mime', 'name', 'caption', 'alt', 'sourceUrl', 'assetPointer', 'status'];
  await write(join(dir, 'media-manifest.csv'), csv(mediaFields, media.map(slot => mediaFields.map(key => slot[key]))));

  await write(join(dir, 'migration-dry-run.md'), `# Workshop Wiki 迁移预演

源文件 \`${source.name}\`，导出时间 ${clientTime(archive.exportedAt)}，SHA-256 \`${source.sha256}\`。
目标基线 ${baseline ? '\`' + baseline.name + '\`，本地历史快照或用户导出，SHA-256 \`' + baseline.sha256 + '\`' : '隔离的空 Studio'}。
生产状态需以最新 Studio 导出核对。

## 分类与动作

${table(['目标分类', '提取', '待新增', '已相同', '待复核或冲突'], dispositions.map(target => {
    const list = plan.rows.filter(row => row.target === target);
    const count = action => list.filter(row => row.action === action).length;
    return [target, list.length, count('create'), count('skip-identical'), list.length - count('create') - count('skip-identical')];
  }))}

${table(['旧 ID', '原标题', '目标分类', '动作', '原因'], plan.rows.map(row =>
    [row.legacyRef.id, row.title, row.target, row.action, row.reason]))}

关系映射、缺失端点及固定版本检查见 [relations.json](relations.json)。
预演增加 ${plan.transfer.content.length} 条内容、${plan.transfer.boardFolders.length} 个分类目录和 ${plan.transfer.relations.length} 条关系，基线既有记录及其中 ${plan.retainedResources} 条 Discover Resources 逐条保持相同。
已验证身份但内容有差异的记录列为 \`update-by-verified-source-id\`，留待审阅。来源 URL 匹配只提示人工核对。标题从未用于合并。同类不同记录保留各自 ID。
[Studio 候选包](studio-transfer.preview.json) 供离线和隔离环境预览，包含可验证的新增子集。完成分类和关系复核后使用最新 Studio 导出重跑，以核对生产导入差异。

## 复核清单

- [分类键与待审文章](category-id-map.json)
- [未匹配和保留项目](unmatched.json)
- [逐篇清单](inventory.csv)
- [逐篇原文索引](wiki-text-index.md)
- [完整原文字段及源文件指针](wiki-records.json)
- [媒体占位](media-manifest.csv)
- [迁移验证](migration-verification.md)
`);

  const linkedAssetPointers = new Set(media.map(slot => slot.assetPointer).filter(Boolean));
  const sourceAssets = archive.stores.get('assets') ?? [];
  const outsideAssets = sourceAssets.filter(row => !linkedAssetPointers.has(row.pointer));
  const sourceVersions = records.reduce((sum, row) => sum + row.metadata.revisions.length, 0);
  const relationReview = plan.relationRows.filter(row => row.action === 'manual-review').length;
  const countsBefore = plan.beforeCounts;
  const countsAfter = plan.afterCounts;
  const samples = [
    ['最长原文', records.reduce((longest, row) => row.content.bytes > (longest?.content.bytes ?? 0) ? row : longest, null)],
    ['列表与引用', records.find(row => /^\s*[-*+] /m.test(row.content.raw) && /^> /m.test(row.content.raw))],
    ['Markdown 内链', records.find(row => row.relations.some(edge => edge.kind === 'markdown_source_filename'))],
    ['中日混写', records.find(row => /[\p{Script=Han}]/u.test(row.content.raw) && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(row.content.raw))],
    ['代码块', records.find(row => /^\s*(?:```|~~~)/m.test(row.content.raw))],
    ['多图锚点', records.find(row => row.mediaSlots.filter(slot => slot.bodyField === row.content.sourceRawField).length > 1)],
  ];
  await write(join(dir, 'migration-verification.md'), `# Workshop Wiki 迁移验证

## 已核验

- 解析 ${archive.counts.length} 个数据库、${archive.counts.reduce((sum, db) => sum + db.stores.length, 0)} 张表和 ${archive.counts.reduce((sum, db) => sum + db.stores.reduce((n, row) => n + (row.count ?? 0), 0), 0)} 条记录。导出标签 ${archive.exportVersion ?? '无'}，旧 Workspace meta schema ${archive.metaVersion ?? '无'}。清单核验${manifest ? '通过（源文件、字节总量与每表记录数）' : '无配套清单'}。
- Wiki 提取 ${records.length} 条。独立输出 ${fulltext.length} 份正文或源文字段。逐文件读回 SHA-256，与源字段计算值一致。每篇正文、变体字节数、Unicode 字符数和散列见 [verification.json](verification.json)。
- Wiki 记录包含 ${sourceVersions} 条显式历史版本。识别 ${media.length} 个待补媒体位置、${plan.relationRows.length} 条旧引用线索，其中 ${relationReview} 条关系待审。
- 源资产表共 ${sourceAssets.length} 条，其中 ${outsideAssets.length} 条未匹配 Wiki 媒体，${outsideAssets.filter(row => row.value.projectId).length} 条带旧 Project ID。资产可在原始导出按 ID 核查。媒体位置可按原文章 ID 和插槽 ID 复核。
- 用现有 Studio \`previewMigration\` 核验候选内容、目录、关系，使用 \`importMigration\` 在隔离内存副本执行一次后再重跑。第二次新增 ${rerun.appPlan.additions.length} 条，已相同内容 ${rerun.rows.filter(row => row.action === 'skip-identical').length} 条。
- 预演只作增量合并。未改动仓库外的源文件、浏览器 IndexedDB、生产 D1/R2 或发布配置。

## Studio 计数对账

${table(['集合', '基线', '隔离导入后', '增量'], Object.entries(countsBefore).map(([key, before]) =>
    [key, before, countsAfter[key], countsAfter[key] - before]))}

## 正文抽查样本

${table(['样本', '旧 ID', '核对结果'], samples.map(([label, row]) =>
    [label, row?.legacyRef.id, row ? '逐字节校验通过' : '此快照未找到样本']))}

## 源库逐表核对

${table(['数据库', 'Store', '记录数', '导出声明数'], archive.counts.flatMap(db =>
    db.stores.map(row => [db.db, row.store, row.count, row.reportedCount])))}

## 需人工核对

- 旧备份只证明导出时间点上的内容。该时间后的新增或编辑需以原浏览器的更新导出复核。
- 未确定的分类、旧关系、版本形状或锚点见 [未匹配清单](unmatched.json)。旧库的 Project Section 历史仅在引用核对中使用。
- 生产写入前导出最新 Studio，并在隔离环境导入、读回和抽查完整正文、关联和已采用版本。若撤回预演，保留源导出即可重新生成候选包。若日后批准上线，先保留最新 Studio 导出、D1 恢复点及对应 R2 快照；用新增 ID 清单设计回退并检查后续编辑/引用，验证后再执行。线上恢复未演练。
`);
}
