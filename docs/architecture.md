# 奕Studio 信息架构

Home 页眉显示品牌及紧凑周历，下方分为 Private Workspace 和 Public Space。内页的页眉只显示当前标题、返回入口和必要的快捷操作。公开品牌「一期一会 in Tokyo」保留自己的导航。

| 空间 | 入口 | 下一级 |
|---|---|---|
| Workshop | `/#/workshop` | Project Gallery → `/#/workshop/projects/:projectId`（Events / 共通内容）→ `/#/workshop/projects/:projectId/events/:eventId` |
| Career | `/#/career` | Exams & Practice、Resume & Experience |
| Self-Board | `/#/self-board` | Discover、Experience、Reflect & Create、Auto |
| Auto | `/#/self-board/auto` | `/#/self-board/auto/:planId`（计划、具体安排、完成记录、原始资源） |
| Calendar | `/#/calendar` | Day、Week、Month，默认 Week。日历设置位于 `/#/settings`。 |
| 一期一会 in Tokyo | `/#/public/yiqiyihui` | Home、Activities、Stories、About |

旧 Workshop 集合链接仍由原路由兼容。旧 Self-Board 的 SOP & Habits 和 To-Do 链接会替换为 Auto 地址。Calendar 可从 Home 周历、Self-Board 的 Auto Widget 和 Auto 进入；`from` 参数保留来源空间的返回路径。

Discover 用缩略卡片，Experience 用图片画廊，Reflect & Create 用标题与摘要。内容可通过 `views` 出现在多个布局中，保持原始 ID。Auto 在同一个 Widget 内切换本周／本月，显示日期安排及最近计划。完成勾选与查看或编辑分开。

## Auto 与 Calendar

Auto 负责规则，Calendar 负责日期。二者共用 `plannerRepository`：

| 模型 | 记录 | 边界 |
|---|---|---|
| Plan | 单次（One-off）、重复（Recurring）、次数目标（Quota），含周期、间隔、目标次数、暂停状态、提醒偏好和原始内容 ID | 保存规则不会自动生成日程。提醒偏好不会发出通知。 |
| Occurrence | 具体日期、状态和可选计划 ID；可选择该计划关联的一条原始资料 | 改期、编辑或跳过只影响这一次；没有计划的单次待办也可从 Calendar 创建。 |
| Completion | 完成日期、计划 ID，以及可选的单次安排 ID | 完成一次安排或手动记录都可计入周期进度。手动计数不会生成 Calendar 事件。 |

Home 默认展示东京当前周，周一至周日；可切换周并回到本周。点击日期打开当天，展开进入完整 Calendar。`/#/calendar?view=week&date=YYYY-MM-DD` 支持直接访问。视图或日期切换更新当前 URL，不增加历史记录。日期选择与比较基于东京民用日期，跨月跨年不依赖浏览器所在时区。Calendar 可从现有 Workshop 事件数据读取日期，并保留习惯打卡的读取接口。

本机 Auto 和 Calendar 演示数据存在当前标签页内存中。配置私有 Worker 后，按 Access 用户持久化计划、Review 和日程。

## Workshop 与 Discover

Project 可包含多个 Event。两层各自拥有 Markdown Session 和附件。Event 采用共通文档时记录 Project Session 和版本 ID，并保存当次快照。编辑产生新版本，Event Review 存在对应 Event 下。

Discover 沿用 Self-Board 内容 ID、视图和卡片。通用 Relation 存储一条有类型的边，两个方向都可查看和编辑。Project 的 Event 派生关联只在读取时计算。Workshop 和 Discover 当前保存到浏览器 IndexedDB。导入使用本地预览及事务，见 [Workshop 数据迁移](workshop-migration.md)。

## 接入真实数据

1. 在受控 API 中分别保存计划、日期安排和完成记录；分配稳定 ID，完成写入支持幂等，为单次编辑校验版本。
2. Auto 按内容 ID 关联原始资料。Workshop 的资料关联与文档版本分别保存。
3. 私人接口在服务端鉴权。公开网站只读取批准后的发布投影。内容类型、标签、关联、可见性及创作状态各自独立。
4. Apple Calendar 使用服务端 ICS 读取及设备 Shortcut 写入。私有部署、确认状态及操作步骤见 [Apple Calendar 集成](apple-calendar-integration.md)。
