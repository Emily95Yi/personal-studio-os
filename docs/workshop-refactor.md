# Workshop / Self-Board 改版与数据验收

基线为本地 `main` 的 `59ac9ba`。未找到附件提到的 `product.md` 和「观系线上操作版」现行地址，产品意图参考了同目录的《Yi Studio Persona / Product Concept Baseline》。

## 改版前的结构

| 区域 | 现有实现 | 本次增量 |
| --- | --- | --- |
| Workshop | Project Gallery、Event 海报、Project 与 Event 文档、版本采用和快照 | 独立 Common Resources 和 Interactive Tools 目录，Project 与 Event 使用分栏详情 |
| Wiki | Self-Board Discover 下四个默认分类；内容在 `content`，文件夹在 `boardFolders`，分类储存为字符串键 | 前三类读至 Workshop；Resources 与其他旧自定义资料分类留在 Self-Board；同一记录兼容旧链接 |
| 引用与记录 | `relations` 保存两端 ID，`sessions.versions` 保存活动文档版本 | 引用支持 Tool 端点及 Wiki 历史版本 ID；利用原 `content.revisions` 保存 Wiki 历史；保留原 Event 采用记录 |
| 标签与卡组 | Project／Event 可存旧自由文字标签 | 扩展 `workshopTags`、`cardSets`、`tagIds`、Event 的 `cardUses` 与 `formats`，保留旧标签和自由文字 |
| Capture、Auto、Calendar | 手机／Web 采集、Inbox、计划与全局东京日历已有完整数据路径 | Capture 分类列表按新归属呈现且继续接受旧目标编码；日历图例和详情标注权限与最后缓存 |
| 公开空间 | 品牌占位，整个站点由 Access 保护 | Tool／Event 允许确认版权与隐私后保存经过字段筛选的私有预览 |

`pages.js` → Workshop 和 Self-Board 视图／动作 → `studioStore` → IndexedDB `yistudio-content` 的 `studio/data` 或 `/api/studio`。云端沿用 D1 `studio_cloud` 的 revision／lease 和私有 R2 的快照。Capture 沿用 `capture_items` 的分类投影、设备和私有附件接口。Planner、CalDAV、ICS 沿用已有 D1 表与接口。本次没有新增 SQL 迁移。

## 归属切换和迁移报告

1. **扩展** · 快照中只添加可选字段和集合。旧导出缺少这些集合时按空集合读取。写入依旧由同一个 lease、revision 与增量校验保护。
2. **预览** · 进入 Workshop → 数据迁移，下载「导出 Studio」。对导出运行以下命令。报告用当前代码的分类键和旧记录的分类推断逻辑生成，记录按 ID 列出其分类、文件夹、附件、版本和引用。JSON 可能有私有 ID，留在本机。
3. **核对** · 比较 `before`／`after` 各集合数量和完整性检查。D1 Capture 附件标为 `captureAttachment`，实际文件仍须从原私有附件链接核对。自定义分类只报告，保留原归属。
4. **切换读取** · Tools & Methods、Prompts & Facilitation、Concepts & Principles 在 Workshop 下显示。没有批量改写，也无须执行 backfill。旧分类和文件夹地址自动映射，原详情地址读取同一个 ID。Project 和 Event 路由以及原 Project 文档的版本参数继续可用。
5. **以后清理** · 旧字段与入口仍为兼容路径。若将来需要移除，应基于另一次备份、独立验证和授权。

```sh
npm test
npm run dev
node scripts/preview-workshop-migration.mjs --fixture
node scripts/preview-workshop-migration.mjs "/path/to/studio-export.json"
```

仓库夹具的只读报告显示 Project **1 → 1**、Event **1 → 1**、内容 **1 → 1**、文档 **3 → 3**、附件 **2 → 2**、关联 **1 → 1**。一条 Wiki 读取至 Concepts & Principles，持久数据修改 **0**。额外测试覆盖了三类 Wiki、带两层文件夹及附件的资源、Self-Board 的旧 Resources、活动的直接引用及历史版本。以上统计来自隔离样本。

## 数据和权限决策

- 共通资源和外部资料继续使用同一份内容记录。固定采用通过 `relations.versionId` 引用资源已有或刚保存的历史版本。Project 直接引用、Event 直接引用和经由活动得到的汇总可以分别浏览。
- 归档后仍可读取原正文、历史及引用，新建引用候选默认排除归档记录。Capture 对已有 Wiki 资源提供原模块编辑入口，显式移出 Inbox 和在 Workshop 归档是不同操作。
- 标签字典和卡组使用稳定 ID。Event 下的标签只参与 Event 筛选与 Project 的派生汇总。旧形式文字仍显示，只对和已知选项完全一致的旧值支持兼容筛选。
- 发布确认只保存私有预览。Tool 预览字段为标题、简介、类型和版本。Event 为标题、日期和主题。启动地址、参加者信息、附件、内部关联、设备数据和授权凭证均不进入预览。外部工具本身的访问权限由其托管方管理。Public 和 Unlisted 目前仅是预期可见性设置。

## 验收

- **自动化** · 48 个测试覆盖保留原数据、深链接、多个 Project 使用同一 Wiki、Event-only 引用、固定版本、归档后回读、卡组角色、活动组合筛选及 Workshop 增量经 D1／R2 保存。原有 Apple 日历、权限、草稿、版本冲突和重试用例继续通过。
- **浏览器** · 隔离 Chrome 新建 Project、Event 和 Wiki；固定引用后修改 Wiki；按 OH 主卡与编织筛选；登记互动工具并准备发布预览；检查 390 px 宽度下的 Project、Wiki、Event 和 Discover。
- **本地 Worker** · 使用隔离 Wrangler 的 D1／R2 跑 `node scripts/capture-acceptance.mjs`。核对设备授权及撤销、旧分类目标、独立 Inbox、文件／图片／PDF、分片失败后重试和附件授权。测试 Worker 仅绑定回环地址，用测试用户和独立数据。
- **上线前手动核对** · 按 [移动采集](mobile-capture.md) 在两台 iPhone 验证分享菜单与授权撤销。按 [Apple 日历](icloud-caldav.md) 在独立的测试日历验证两端编辑、冲突以及 B 只读。还需在授权的环境读取真实导出并比对报告，登记「观系线上操作版」现行 URL。匿名发布需单独设计受限入口和经过验证的发布流程。

## 备份与回退

1. 备份 Studio JSON，以及现有 D1、R2 对象和必要的恢复点，放在仓库外。Studio 导出只有内容快照，Capture 原始附件、Planner 和云端配置各走其对应的备份路径。先在隔离环境确认备份可读。
2. 回退展示时保留快照验证、引用和扩展集合，只回退页面归属与导航，即可从原内容记录恢复旧 Discover 入口。已写入新字段时保留新版本后端和快照代码；旧 Worker 或旧前端保存时可能遗漏互动工具、字典或新引用字段。
3. 若确需回退整个 Worker，先备份当前快照及 D1／R2，暂停相关编辑，再回退至原版本验证读取。涉及真实数据恢复时，选好时间点并核对 D1 版本和 R2 对象指针，保留回退前的最新备份用于恢复新记录。

## 主要变更文件

- [Workshop 模型](../site/workshop-library.js)、[视图](../site/workshop-library-view.js)、[原画廊与详情](../site/workshop-view.js)、[表单与关联动作](../site/workshop-actions.js)
- [路由](../site/pages.js)、[单页入口](../site/app.js)、[样式](../site/style.css)、[Discover 阅读与目录](../site/self-board-view.js)、[编辑动作](../site/self-board-actions.js)
- [快照与引用](../site/studio-data.js)、[导入与校验](../site/studio-migration.js)、[只读迁移报告](../scripts/preview-workshop-migration.mjs)、[Studio 导出入口](../site/studio-import-view.js)
- [Capture 分类与投影](../worker/capture-state.js)、[Capture 写入](../worker/capture.js)、[日历](../site/planner-view.js)、[日程详情](../site/apple-view.js)
- [Workshop 回归](../tests/workshop-library.test.js)、[同步回归](../tests/studio-cloud.test.js)、[Capture 验收](../scripts/capture-acceptance.mjs)
