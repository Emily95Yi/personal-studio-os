# 奕Studio 信息架构

Home 页眉显示品牌及紧凑周历，下方分为 Private Workspace 和 Public Space。内页的页眉只显示当前标题、返回入口和必要的快捷操作。公开品牌「一期一会 in Tokyo」保留自己的导航。

| 空间 | 入口 | 下一级 |
|---|---|---|
| Workshop | `/#/workshop` | Project Gallery → `/#/workshop/projects/:projectId`（Events / 共通内容）→ `/#/workshop/projects/:projectId/events/:eventId` |
| Career | `/#/career` | Exams & Practice、Resume & Experience |
| Self-Board | `/#/self-board` | Writing、Reflections、Discover、Collections；页眉提供栏目切换、全局搜索、快速添加、Network 和设置 |
| Auto | `/#/self-board/auto` | `/#/self-board/auto/:planId`（计划、具体安排、完成记录、原始资源） |
| Calendar | `/#/calendar` | Day、Week、Month，默认 Week。日历设置位于 `/#/settings`。 |
| 一期一会 in Tokyo | `/#/public/yiqiyihui` | Home、Activities、Stories、About |

旧 Workshop 集合链接仍由原路由兼容。旧 Self-Board 的 SOP & Habits 和 To-Do 链接会替换为 Auto 地址。Calendar 可从 Home 周历、Self-Board 的 Auto Widget 和 Auto 进入；`from` 参数保留来源空间的返回路径。

总览提供 Auto 和 Calendar 的入口。Auto 的摘要仍可切换本周／本月，完成勾选与查看或编辑分开。

## Auto 与 Calendar

Auto 负责规则，Calendar 负责日期。二者共用 `plannerRepository`：

| 模型 | 记录 | 边界 |
|---|---|---|
| Plan | 单次（One-off）、重复（Recurring）、次数目标（Quota），含首次提醒日期、周期、间隔、目标次数、暂停状态、备注和原始内容 ID | Calendar 仅显示已到期的提醒，不随所选日期切换，不发送系统通知。 |
| Reminder | 每个计划一条待处理提醒，支持按天延后或删除本次 | 可从提醒打开预填的日程表单；保存后的日程独立存在，走现有 YiStudio 同步流程。 |
| Occurrence | 具体日期、状态和可选计划 ID；可选择该计划关联的一条原始资料 | 改期、编辑或跳过只影响这一次；没有计划的单次待办也可从 Calendar 创建。 |
| Completion | 完成日期、计划 ID，以及可选的单次安排 ID | 完成一次安排或手动记录都可计入周期进度。手动计数不会生成 Calendar 事件。 |

Home 默认展示东京当前周，周一至周日；可切换周并回到本周。点击日期打开当天，展开进入完整 Calendar。`/#/calendar?view=week&date=YYYY-MM-DD` 支持直接访问。视图或日期切换更新当前 URL，不增加历史记录。日期选择与比较基于东京民用日期，跨月跨年不依赖浏览器所在时区。Calendar 可从现有 Workshop 事件数据读取日期，并保留习惯打卡的读取接口。

本机 Auto 和 Calendar 演示数据存在当前标签页内存中。配置私有 Worker 后，按 Access 用户持久化计划、Review 和日程。

## Self-Board 与 Workshop

| 入口 | 地址（相对于 `/#/self-board`） | 浏览与操作 |
|---|---|---|
| Writing | `/writing` | 用状态图标筛选未发布或已发布。新建和编辑均在页面内，可在正文位置审阅两个版本的文字差异。 |
| Reflections | `/reflections` | 卡片直接打开详情。可置顶、按颜色排列或随机排列。通过页眉设置维护标签和卡片上缘颜色。 |
| Discover · Workshop Wiki | `/discover` | 保留 Tools & Methods、Prompts & Facilitation、Concepts & Principles、Resources 及已有分类和文件夹。条目可搜索、导入、编辑、移动；未保存的新建表单切换标签后可在当前页面会话恢复。 |
| Discover · Personal Explorations | `/discover?tab=explorations`、`/explorations/:id` | 按最近更新浏览，可按标签筛选或通过页眉搜索。详情内添加、编辑、排序或删除 Question、Note、Insight、Reference；支持外部链接与站内引用。 |
| Collections | `/collections`、`/collections/:id` | 分类从浮动菜单打开，收藏统一以列表显示。分类可重命名、排序、隐藏或删除，可选一级文件夹。使用页眉的快速添加输入标题或链接。 |
| Network | `/connections` | 仅从页眉图标进入。关系列表可编辑，内容详情默认折叠相关内容。 |

Writing 的筛选使用 `?view=`，新文章使用 `/writing/new`，Discover 分类和文件夹使用 `?category=` 与 `folder=`，内容详情使用 `/content/:id`，页眉搜索在当前页展开浮层，旧搜索地址 `/search?q=…` 仍可打开。旧详情链接仍可打开原 ID。Writing 的 In Progress 旧入口显示未发布文章，Unused Fragments 旧入口转到 Reflections。旧归档仍可通过原地址访问。

Quick Capture 的 Text 可保存到 Reflections 或 Collections。Link 可保存到 Workshop Wiki 的 Resources、Personal Explorations 的主题（作为 Reference）或 Collections。File 接受 `.md`，可导入 Writing、Reflections、Collections，或通过 Discover 选择 Wiki 分类或 Personal Explorations 主题。文件夹使用下拉菜单，其他选择使用横向选项。Collections 的未分类条目会和其他条目一起显示在默认列表中。Writing 支持将本地 Markdown 和纯文本导入为未发布文章，Discover 支持导入链接和本地文件。内容默认标记为 Private，Writing 的发布标记仅在私有工作区内使用。

- Writing、Reflections 和 Workshop Wiki 继续使用 `yistudio-content` IndexedDB 快照的 `content` 集合。记录新增类型、可选状态、主题、来源及可见性。旧数据按需读取并显示在相应视图，编辑时才写入统一字段，同时保留旧 ID、封面、附件及其他旧字段。
- 保留旧记录的 `parentContentId`、`revisionGroupId`，文章详情通过显式关联展示相关内容。正文、标题、摘要、来源和附件变化时保留修订快照。回收站以时间戳标记删除，恢复后沿用原 ID 和原关系。
- 链接保存在对应 Resource 内，新记录按规范 URL 去重。文件复用 Studio 的附件集合，每个文件上限 12 MB，浏览器可用空间取决于当前存储配额。
- Discover 文件夹和 Reflections 标签分别保存在 `boardFolders` 与 `reflectionLabels`，内容按稳定 ID 引用。卡片排列方式保存在当前浏览器的视图偏好中。
- 有类型的关系保存在现有 `relations` 集合。端点沿用类型和 ID 的组合，其中旧的 `discover` 端点继续代表原有 Self-Board 内容，新端点为 `topic` 与 `collection-item`。两端都可以查看和编辑；Project 可从其 Event 读取派生关系。
- Project 和 Event 继续各自保存 Markdown Session 和附件，Event 采用共通文档时保留 Project Session 版本和当次快照。

探索和收藏沿用同一个 IndexedDB 快照和事务。读取旧快照时，仅补齐下列缺省集合，不改变数据库版本、旧记录、ID、文件夹或关系。用户已有的 Wiki 资料保留原位。

| 集合 | 记录与兼容 |
|---|---|
| `explorationTopics`、`explorationEntries` | Topic 保存名称、简介、标签、封面／图标与时间。Entry 使用 `topicId`、类型和顺序，可保存正文、外链或由类型和 ID 组成的引用。 |
| `collectionCategories`、`collectionFolders`、`collectionItems` | 默认分类有稳定 ID；分类配置、顺序、隐藏和默认分类删除标记以覆盖记录保存。Inbox 由空分类 ID 表示。文件夹单独引用分类。收藏的资源类型独立于分类；分类删除会把收藏移到选择的目标，移除文件夹只解除归属。超出当前配置的原状态继续可见且可筛选。 |
| `relations` | 沿用一条边供两端读取，Project 也能查看 Event 的派生关联。收藏被关联或被 Reference 引用时不能删除。Topic 和收藏移入回收站后可恢复。 |

已保存的链接在 Wiki 与 Collections 之间按规范化 HTTP(S) 地址去重；同一个对象可以被多个主题引用。未绑定云端存储的环境继续使用浏览器存储。绑定后，由现有 Cloudflare Access 身份决定可读取的云端内容。

现有迁移包支持统一内容、版本、附件及关系的预览、冲突检查、验证和原子导入。既有 Notion 来源字段随记录保留。后续批量迁移应先导出当前快照并在隔离环境预览，记录本批新增 ID，再制定批次撤销方案。

## 接入真实数据

1. 在受控 API 中分别保存计划、日期安排和完成记录；分配稳定 ID，完成写入支持幂等，为单次编辑校验版本。
2. Auto 按内容 ID 关联原始资料。Workshop 的资料关联与文档版本分别保存。
3. 私人接口在服务端鉴权。公开网站只读取批准后的发布投影。内容类型、标签、关联、可见性及创作状态各自独立。
4. Apple Calendar 使用服务端 ICS 读取及设备 Shortcut 写入。私有部署、确认状态及操作步骤见 [Apple Calendar 集成](apple-calendar-integration.md)。

## Studio 内容同步

- 在现有 D1 应用 `0004_studio_cloud.sql`，并为现有 Worker 绑定专用私有 R2 bucket `STUDIO_CONTENT`。在隔离环境先验证，生产使用已忽略的 `wrangler.production.toml`。没有 R2 绑定时仍可使用原有本地模式。
- D1 保存每位 Access 用户的内容版本、R2 对象指针和编辑锁。R2 存储包含附件的完整快照，保留当前版及上一版。只有完整对象写入且版本和锁均有效时才提交指针。第一版每次上传最多 24 MiB（含附件编码）。
- 首次同步时，在已有内容的浏览器上点「上传此浏览器的 Studio 内容」。上传只允许初始化空的云端工作台，保留原 ID 和原浏览器数据。已有云端内容时，通过现有 Studio 导入流程合并其他备份。
- 编辑锁覆盖整个内容工作台，关闭编辑器释放。每 25 秒续期，失联约两分钟后可由另一端接手。已有页面可重新打开或刷新读取最新版本，前台空闲时也会检查更新。Auto、待办与 Calendar 继续使用原有存储路径。
