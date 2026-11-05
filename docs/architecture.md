# 奕Studio 信息架构

Home 页眉显示品牌及紧凑周历，下方分为 Private Workspace 和 Public Space。内页的页眉只显示当前标题、返回入口和必要的快捷操作。公开品牌「一期一会 in Tokyo」保留自己的导航。

| 空间 | 入口 | 下一级 |
|---|---|---|
| Workshop | `/#/workshop` | Project Gallery → `/#/workshop/projects/:projectId`（Events Poster Gallery 和 Related Resources）→ `/#/workshop/projects/:projectId/events/:eventId` |
| Career | `/#/career` | Exams & Practice、Resume & Experience |
| Self-Board | `/#/self-board` | Discover、Experience、Reflect & Create、Auto |
| Auto | `/#/self-board/auto` | `/#/self-board/auto/:planId`（计划、具体安排、完成记录、原始资源） |
| Calendar | `/#/calendar` | Day、Week、Month；默认 Week |
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

演示数据只存在当前标签页内存中：路由跳转后保留，刷新后清除。项目、活动和原始内容集合仍为空。Workshop 的预览卡只展示页面结构。

## 接入真实数据

1. 在受控 API 中分别保存计划、日期安排和完成记录；分配稳定 ID，完成写入支持幂等，为单次编辑校验版本。
2. Auto 和 Workshop 都按内容 ID 关联原始资料。项目资源模块保存稳定 ID、名称和顺序；活动引用可保存不可变版本或快照。
3. 私人接口在服务端鉴权。公开网站只读取批准后的发布投影。内容类型、标签、关联、可见性及创作状态各自独立。
4. iCloud 先评估只读接入，双向写入需要单独确认授权、安全存储及冲突策略。见 [iCloud Calendar 同步评估](icloud-calendar.md)。
