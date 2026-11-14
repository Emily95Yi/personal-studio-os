import { mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { emptyStudio } from '../site/studio-data.js';
import { importMigration } from '../site/studio-migration.js';
import { object, sha256, sourceArchive, origin } from './workshop-wiki/archive.mjs';
import { normalizeWiki } from './workshop-wiki/normalize.mjs';
import { planWiki, studioBaseline } from './workshop-wiki/plan.mjs';
import { writeReport } from './workshop-wiki/report.mjs';

async function load(path) {
  const bytes = await readFile(path);
  return { doc: JSON.parse(bytes), sha256: sha256(bytes), bytes: bytes.length, name: basename(path) };
}

function checkManifest(manifest, source, archive) {
  const stores = archive.counts[0].stores;
  const { doc } = manifest;
  if (!archive.backup || doc.source_origin !== origin || doc.database !== archive.counts[0].db ||
      doc.sha256 !== source.sha256 || doc.file_bytes !== source.bytes ||
      doc.export_format_label !== archive.exportVersion || doc.database_meta_version !== archive.metaVersion ||
      doc.record_count !== stores.reduce((count, row) => count + row.count, 0) ||
      Object.keys(doc.tables ?? {}).length !== stores.length || !stores.every(row => doc.tables[row.store] === row.count)) {
    throw new Error('源备份与配套清单不一致。请检查文件来源和完整性。');
  }
}

const usage = '用法：node scripts/preview-legacy-workshop-wiki.mjs --source <旧导出.json> --output <新目录> ' +
  '[--manifest <旧备份清单.json>] [--studio <Studio 导出.json>] [--decisions <已复核映射.json>]';

try {
  const { values } = parseArgs({ options: { source: { type: 'string' }, output: { type: 'string' }, manifest: { type: 'string' },
    studio: { type: 'string' }, decisions: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) console.log(usage);
  else {
    if (!values.source || !values.output) throw new Error(usage);
    const [source, manifest, baseline, decisions] = await Promise.all(
      ['source', 'manifest', 'studio', 'decisions'].map(key => values[key] && load(values[key])));
    const archive = sourceArchive(source.doc);
    if (manifest) checkManifest(manifest, source, archive);
    const state = baseline ? studioBaseline(baseline.doc) : emptyStudio();
    const { categories = {}, owners = {} } = decisions?.doc ?? {};
    if (!object(categories) || !object(owners)) throw new Error('人工映射须包含 categories / owners 对象。');
    const normalized = normalizeWiki(archive, source.sha256, categories);
    const options = { sourceIssues: archive.issues };
    const plan = planWiki(normalized.records, state, owners, options);
    const isolated = structuredClone(state);
    if (plan.appPlan.additions.length) importMigration(isolated, plan.transfer, isolated.revision);
    const rerun = planWiki(normalized.records, isolated, owners, options);
    if (rerun.appPlan.additions.length) throw new Error('幂等校验失败：再次运行产生额外记录。');
    const { doc: _archive, ...sourceMeta } = source;
    const baselineMeta = baseline && { name: baseline.name, sha256: baseline.sha256, bytes: baseline.bytes };
    const path = resolve(values.output);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeReport(path, { source: sourceMeta, baseline: baselineMeta, archive, ...normalized, plan, rerun,
      manifest: manifest && { name: manifest.name, sha256: manifest.sha256 } });
    console.log('已生成 ' + normalized.records.length + ' 条真实 Wiki 清单及本地预演：' + path);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
