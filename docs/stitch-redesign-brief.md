# 奕Studio · Stitch UI 改版说明

本文根据 `personal-studio-os` 提交 `59ac9ba` 的本地代码整理。奕Studio 是一个单人工作台，用来收集生活和工作资料、组织活动、写作、管理计划，以及查看东京时区的日程。界面以简体中文为主，保留 Workshop、Self-Board、Writing、Auto 等现有英文栏目名。Career 的「考试」会进入独立的 Quiz Notebook，可在入口上提示跳转。

## 可以直接贴给 Stitch 的提示词

> 为奕Studio 设计桌面和手机 Web 界面。用户通常先从 Self-Board 处理 Inbox，再去 Auto 管理计划和待办，或到 Calendar 安排具体时间。另有 Workshop 用于浏览活动海报、编辑活动与复用内部文档。请先做 Self-Board 总览、Inbox 列表与详情、Auto 总览与计划详情、Calendar Week 与日程详情，再用同一套组件延展到下方其他页面。桌面画布建议 1440 px，手机画布建议 390 px。采用清楚、安静的个人工作台风格，使用浅色背景、深色正文、克制的强调色；长文易读，列表易扫描，海报可保留各自风格。允许重新组织导航、工具栏和弹窗，保留本文列出的路径、交互和权限语义。请用虚构的标题、日期和附件演示实际流程，给出页面间的跳转，并提供空、加载、保存中、只读、错误及冲突状态。中文界面请用正文下方的现有名称和动作词。

## 1. 现有界面与页面结构

首页采用淡蓝多层背景、半透明入口卡和线性图标，宽屏三列，窄屏两列或一列。内页以白色顶栏、返回按钮和右侧图标操作为主，共用浅色内容底、细边框和居中容器。列表和阅读页用于处理信息，Workshop 以封面和竖版海报为主。日历来源目前用粉色标识 YiStudio（A），蓝色标识 iCloud（B）。

| 页面 / 路由 | 当前布局与关键动作 |
| --- | --- |
| 首页 `/#/` | 奕Studio 品牌、右上角 Calendar 图标；Workshop、Career、Self-Board、「一期一会 InTokyo」四个入口卡。 |
| Self-Board `/#/self-board` | Writing、Reflections、Discover、Collections 四个入口，下方是可折叠的 Inbox（最多显示 4 条）和东京本周周历。页眉有浮动搜索、快速添加和设置。进入栏目后可用标题菜单切换栏目。 |
| Inbox `/#/self-board/inbox`、`/#/self-board/inbox/:id` | 列表按内容类型筛选、翻页、勾选后批量分类；每行可发起日程、待办、提醒或分类。详情显示分类、标题、正文、来源／附件及原模块入口；顶栏可新增 Auto、移出 Inbox、保存或删除。 |
| Writing `/#/self-board/writing`、`/#/self-board/writing/new` | 文章列表、未发布／已发布筛选、新建和导入；进入阅读／编辑后支持正文、关联内容和版本差异。发布状态供私有工作台使用。 |
| Reflections `/#/self-board/reflections` | 想法卡片附标签色，可置顶、按颜色排列或随机排列；点击卡片读详情并编辑，标签在 Self-Board 设置里维护。Writing、Reflections、Wiki 共用 `/#/self-board/content/:id` 详情。 |
| Discover `/#/self-board/discover` | 两个 Tab。Workshop Wiki 按 Tools & Methods、Prompts & Facilitation、Concepts & Principles、Resources 浏览，可进文件夹或导入资料。Personal Explorations 用 `?tab=explorations` 切换，按标签筛 Topic；`/#/self-board/explorations/:id` 内管理 Question、Note、Insight、Reference 等条目，可排序和引用资料。 |
| Collections `/#/self-board/collections`、`/#/self-board/collections/:id` | 统一列表，浮动分类入口及可选一级文件夹；支持全部、待分类、分类／文件夹筛选，分类可排序、隐藏或重命名。详情保留资源、来源与相关内容，从收藏可预填 Auto 计划。 |
| Self-Board 设置 `/#/self-board/settings`、Network `/#/self-board/connections` | 设置包含 Reflections 标签、探索条目类型、Capture Devices、Storage、回收站和 Network 入口。Network 可搜索、筛选关系类型和编辑关联；内容详情中的相关内容默认折叠。 |
| Auto `/#/self-board/auto`、`/#/self-board/auto/:planId` | 总览依次为计划、独立待办、显化。页眉分别有添加显化、新建计划、新建待办。计划按单次、重复规则、周期目标分组；详情展示待办、到期提醒、完成记录、关联资源和备注，可编辑、暂停／恢复、完成计划。 |
| Calendar `/#/calendar`、日历设置 `/#/settings` | 默认 Week，可选 Day／Week／Month、前后时段和今天。Week／Month 显示日期格与摘要，Day 直接显示清单。所选日下方显示日程、Workshop 活动和可用打卡记录；另外显示待办、当天提醒、待处理提醒。页眉有日程搜索、Auto 与日历设置。设置负责连接及刷新 Apple 日历。 |
| Workshop `/#/workshop` | Project Gallery 展示封面卡，可新建 Project，另有数据迁移 `/#/workshop/import`。Project `/#/workshop/projects/:projectId` 有 Events／共通内容两个 Tab，共通内容路径以 `/common` 结尾。Event `…/events/:eventId` 展示海报、主题、日期、时间、地点、人数、费用，以及本场 Markdown 文档、附件及相关对象。Event 可按版本采用 Project 共通文档，并保留采用时的快照。 |
| Career `/#/career` 与品牌区 `/#/public/yiqiyihui` | Career 两张入口卡「考试」「简历」，前者连独立产品，简历为占位。品牌区有 Home、Activities、Stories、About 导航，当前页面显示空内容占位。生产 Worker 的现有访问控制也覆盖承载此区的站点入口。 |
| 手机采集 `/capture.html` | 独立表单，支持网址、文字、照片／PDF／文件；可快速保存到 Inbox 或指定分类，附件有进度和取消。与 Self-Board 页眉的 Quick Capture 并存，后者按内容类型直接选择内容模块。 |

## 2. 前端交互与业务规则

### 采集 → 整理 → 处理

- 首页和内页入口应当能区分。Self-Board 的 Inbox 代表待处理的采集记录；Collections 的「待分类」代表收藏尚无类别。分类或创建计划／日程后，采集条目仍可留在 Inbox，用户可显式移出。已处理条目移出后结束处理，尚未处理的条目进入回收站；永久删除另有确认。原模块里的收藏或内容仍可从相应入口访问。
- Inbox 可按类型连续处理。详情要同时看得到原文／附件、分类选择和已关联内容；已归入原模块的条目提供原模块编辑入口。全局工具采用短标签，图标单独出现时要有可读名称。
- Self-Board 浮动搜索查询板内内容。Calendar 浮动搜索查询日程标题、地点、备注、日期或来源，可直接打开日程详情。保留当前页、返回目标与列表筛选，尤其是 `view`、`date`、`from`、`tab`、`category`、`folder` 等已有地址参数。

### Auto → Calendar

- **计划**是行动规则。新建表单按单次、重复规则、周期目标显示不同字段，包括首次提醒日期、按日间隔、周期长度、目标次数和备注。现有周／月规则在编辑同类计划时按原周期回显。周期目标可显示 `2 / 3 次`，允许手动记录或撤销最近的手动记录。
- **待办**可独立存在或归属于计划，可没有日期。标题打开详情，勾选完成和转为日程是独立操作。成功转为日程后，该待办退出列表。**提醒**来自计划规则，可延后若干天、删除当次，或打开预填的 YiStudio 日程表单。新建的日程独立保存。完成计划将计划放入回收站，已建日程继续保留。提醒在站内出现。
- **显化**用来记录暂无固定日期的想法。类型为自由文字，或链接到现有的 Auto 计划、Self-Board 内容／探索／收藏或 Inbox 条目。关联表单包含路径关键词筛选、分组条目选择和可选的 Inbox 查找。丢失的原关联需要可识别，显化仍可编辑。显化没有日程时间与完成进度。
- Calendar 按 `Asia/Tokyo` 解释日期，一周从周一开始。日期格区分今天、当前选中日、月外日期。选中日影响日程和当天提醒；待办与其他待处理提醒有独立列表。现在 Day 有显式「新建日程或待办」，Week／Month 可再次点击已选日期打开新建。改版可提供一个更明确的创建入口。
- 日程表单区分全天与定时，提供标题、起止时间、地点、备注。以「YiStudio · 读写」和「iCloud · 只读」标明来源及权限，编辑能力取决于实际日程及同步状态。同步需要处理待同步、已同步、失败、Apple 与 Studio 内容冲突，以及读取失败时显示最后成功缓存。选择私人只读 iCloud 日历后，设置隐藏公开 ICS 备用方式。

## 3. 前端与后端的接入边界

| 层 / 接口 | 当前实现与设计含义 |
| --- | --- |
| 前端 `site/` | 原生 HTML、CSS、JavaScript ES Modules。`index.html` / `app.js` 挂载单页应用，`pages.js` 解析 Hash Router，各 `*-view.js` 生成页面与对话框，`*-actions.js` 和事件委托负责写入与焦点恢复。`style.css` 维护共享色彩、间距、响应式和动效。视觉稿可用 Stitch 的原型数据，落地时映射至现有视图及动作。 |
| Workshop 和 Self-Board 内容 `/api/studio`、`/api/studio/lease` | 记录、版本、关联等在本地可使用 IndexedDB。云模式下由 D1 保存版本、编辑租约及 R2 对象指针，R2 保存私有快照。日常保存提交记录增量，用版本、租约、保存请求 ID 校验及安全重试。界面要覆盖首次上传本机内容、编辑被占用／租约到期、保存中、冲突及失败后保留草稿。 |
| Auto & Calendar `/api/planner` | `GET` 读取当前用户快照和 revision，`PUT` 按 revision 保存到 D1，版本不一致返回 `409`。快照包含计划、待办、完成记录、Review、日程、显化和历史打卡。单独区分「Studio 保存成功」与「Apple 已同步」；保存失败或冲突要保留当前修改，并提供适合的重试或重载操作。静态预览中 Planner 修改只在当前页面内存。 |
| Apple `/api/calendar/caldav`、`/api/calendar/feed`、`/api/calendar/refresh`、`/api/calendar/settings` | CalDAV 管理可读写的 YiStudio 日历 A 与可选的只读 iCloud 日历 B；公开 ICS 可作为 B 的备用连接方式。Worker 负责读取缓存、异步同步、冲突处理与受限写入。采用 Apple 版本和应用 Studio 修改是两个明确动作。 |
| Capture `/api/capture`、`/api/capture/mobile`、`/api/storage` | D1 存采集数据、分类、设备授权及上传元数据，R2 存附件。浏览器可分页、批量分类、编辑与读取授权附件；详情编辑带 `version`。设备快捷指令走受限接口；手机网页支持分片上传、取消和重试。Storage 展示容量与手动刷新。 |
| 鉴权与发布 `worker/` | Cloudflare Worker 提供静态页面和同源 API，使用 Cloudflare Access 验证用户，网页写入校验来源。未登录、私有服务不可用、日历只读、设备授权失效等都有独立展示。品牌公开内容需有独立的发布边界，目前用占位数据。Stitch 只使用虚构的样例资料及账号。 |

## 4. 设计稿交付与核对

1. **第一组画板** · Self-Board 总览、Inbox 列表／详情、Auto 总览／计划详情、Calendar Week／日程详情。标出两条原型路径：「Inbox → 归类 → 回原模块」和「Auto 到期提醒 → 新建 YiStudio 日程 → 查看同步状态」。
2. **第二组画板** · 首页、Workshop 画廊／Project／Event、Writing／Reflections／Discover／Collections，以及设置、回收站和手机采集页。优先复用列表、阅读器、表单、导航和状态组件。
3. **响应式与组件** · 桌面可并排展示列表和详情，手机优先保留主操作与返回入口。提供导航、筛选、选择器、列表行、日期格、编辑表单、确认弹窗、状态提示的默认／交互状态。窄屏考虑长中文、英文标题和混排，键盘焦点可见，颜色辅以文字或图标。
4. **状态画板** · 用同一套虚构数据展示空列表、加载、无结果、保存中、失败可重试、编辑冲突、只读 iCloud、失效关联及附件上传。区分「没有事项」「暂时取不到」和「没有编辑权限」。

核对源码可从 [`site/pages.js`](../site/pages.js)、[`site/app.js`](../site/app.js)、[`site/style.css`](../site/style.css)、[`site/repository.js`](../site/repository.js)、[`worker/index.js`](../worker/index.js) 开始。专题文档见 [移动采集](mobile-capture.md) 和 [Apple Calendar 集成](icloud-caldav.md)。
