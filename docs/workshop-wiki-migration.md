# 旧 Workshop Dashboard Wiki 迁移

本流程依据 2026-11-14 的迁移 brief。它从本地读取旧站备份和 Studio 导出，写出审阅包，在隔离内存中调用 Studio 的现有预览与导入校验。源码、原站 IndexedDB、生产 D1/R2 和部署均无需改动即可执行预演。

## 模型核对

- 旧站本地源码 `EventDashboard`（`b692e22133be`）及随备份保存的 v35 源码包都使用 `workshop-planning-workspace`。旧视图使用 `KnowledgeDocumentService.knowledgeDocumentsFromEntities` 汇集 `tools`、`resources`、`knowledgeEntries`，单独展示术语，过滤旧 `feedback`。原生备份格式标签 17 与 Workspace meta schema 18 是独立字段。
- 旧分类为 `core`、`raw_sources`、`resource_links`，旧视图通过 `wikiSection` 显示二级目录。兼容字段 `category`（例如 `guides`）同时保留。迁移对可证实的旧二级目录使用显式映射，旧 `resources` store 或 `resource_links` 归到 Self-Board。含糊的分类保留待审。
- 当前 Studio 已用共享 `content` 和 `boardFolders` 存储 Wiki 和 Discover。分类键决定是否出现在 Workshop / Common Resources。Project / Event 使用 `relations`；Event 通过 `versionId` 引用 `revisions` 中的固定版本。候选条目复用该结构，绑定来源系统、库、表和序列化主键。原 ID、旧分类和导出字段保存在审阅包中。
- 本地 Studio 使用 `yistudio-content` IndexedDB。私有 Worker 通过 `studio_cloud` D1 行保存 revision、R2 对象指针和编辑租约，内容快照存于私有 R2。生产导入沿用浏览器迁移页和现有 revision / lease 校验。此次新增的媒体字段是元数据；未上传媒体按锚点显示待补提示。补传需经私有资产流程及独立的插槽确认。

## 生成审阅包

运行 Node.js 22 或更新版本。

```sh
node scripts/preview-legacy-workshop-wiki.mjs \
  --source /path/to/legacy-workshop-idb-text.json \
  --studio /path/to/studio-export.json \
  --output migration-output/review-YYYY-MM-DD
```

`--source` 支持 brief 附带导出器生成的 `workshop-idb-text-export-v1`，以及旧站原生 `database/tables` 备份。原生备份可传入 `--manifest` 核对来源、版本、文件 SHA-256、字节数和各表计数。最新 Studio 导出从 **Workshop → 数据迁移 → 导出 Studio** 获取。省略 `--studio` 时以隔离的空库验证。每次使用新目录。输出保存在 Git 忽略目录，包含私有资料及来源链接，应只在私有环境审阅。原始备份请保留，规范化 JSON 通过文件哈希和 JSON Pointer 定位完整旧记录。

逐篇检查 `inventory.csv`、原文及变体、`category-id-map.json`、`relations.json` 和 `unmatched.json`。新版导出遇到无法识别的正文或分类、导出错误、Media 缺项及关系端点不明时，预演中保留核对信息。正文文件字节未经渲染或改写；Studio 候选正文使用已有 `originalRawContent`、`originalContent` 或旧视图正文的可用优先项。不同的文本版本另存供审阅。旧站没有独立 Wiki 版本表，Project Section 历史按原先归属审计。

复核后可用 `--decisions /path/to/reviewed-decisions.json`。其中 `categories` 的键是 `wiki-records.json` 的 `targetId`，值是复核后的分类 ID。 `owners` 的键由 `JSON.stringify([legacyStore, legacyId])` 生成，值是核实的 Studio Project 或 Event ID。

```json
{
  "categories": {},
  "owners": {}
}
```

关系校验需要源和目标端点。旧版 Project 中是否存在对应 Event、旧活动和 Studio Event 是否为同一场，应按实际 ID 和来源核实。候选包只包含可验证的新增。已匹配旧身份但内容有差异时逐条审阅，重新导出后再讨论更新。资源来源 URL 可能与既有 Resources 或 Collections 重复，可用于提示核对。最终保留或关联选择需要核实身份，标题不参加匹配。

## 隔离导入、上线审批和回退

1. 在本地隔离 Studio 中使用现有 **数据迁移 → 预览**，选择 `studio-transfer.preview.json`。复核新增内容、文件夹及关联后，可在隔离环境确认导入。
2. 分别测试旧链接、两 Project 引用、仅 Event 引用、无引用、已归档和固定版本。重跑应显示已相同、零新增。确有媒体时按 `legacyParentId + mediaSlotId` 核对顺序、锚点和说明。项目现有 `npm test` 包含 live/pinned、归档、关系和旧路径的回归验证。
3. 实际导入前，导出当时的 Studio，保存当前 D1 恢复点和对应私有 R2 快照，重跑并提交差异及任何悬而未决的关系给用户审核。明确授权后才能在生产导入。导入后重新导出核对正文哈希、引用类型和新增 ID。
4. 有回滚需要时，先保存当前快照并核查新增条目的后续编辑、固定引用或外部依赖；以新增 ID 为范围拟定回退方案，用现有 revision / lease 路径操作。恢复整库前需评估同一 revision 间其他工作。本轮只执行了本地加法预演和可重跑验证。
