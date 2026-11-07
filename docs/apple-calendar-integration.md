# Apple Calendar 集成

## 先启用私有工作台

仓库提供了 Worker、D1 迁移和 Cloudflare Access 校验。GitHub 分支和本机静态预览不会连接任何日历。私有环境需要独立 HTTPS 域名、D1 实例和 Access 策略。

1. 在 Cloudflare Zero Trust 建立仅允许工作台成员登录的自托管 Access 应用，覆盖私有工作台整个域名。记录团队域名与应用 AUD。使用独立域名和部署为公开站提供静态页面。
2. 创建专用 D1 数据库。在部署配置中把 `wrangler.toml` 的占位数据库 ID 换成实际 ID，将 `DB` 绑定到该数据库。先用隔离的数据库验证迁移。生产配置中保持 `workers_dev = false` 和 `preview_urls = false`。
3. 配置 Worker 环境变量 `STUDIO_ORIGIN`（完整 HTTPS origin，无尾斜线）、`ACCESS_TEAM`（例如 `example.cloudflareaccess.com`，无协议）和 `ACCESS_AUD`。用 `openssl rand -base64 32` 在本机生成密钥，通过 Cloudflare secret 设置 `ICAL_ENCRYPTION_KEY`。备份密钥到私有密钥管理系统，轮换前需安排重新加密或重新配置订阅。
4. 对隔离 D1 应用迁移，为私有 Worker 配置同一自定义域名。部署后先检查未登录访问被拒、登录后读取 Settings 正常、公开站和非私有域名无法请求私有 API。确认后才配置订阅。

Worker 验证 Access JWT 的签名、签发方、受众和有效期，按 `sub` 隔离日历与计划。订阅地址由 Worker 加密后存入 D1。D1 同时保存该用户的计划和最小日程投影，具有数据库读取权限的管理员仍需按私人数据管理。生产日志应保持关闭或只记录不带请求内容的摘要，不能记录设置请求正文、订阅地址、事件或回调结果。参见 [Cloudflare Access JWT 校验](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) 和 [Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。

## 配置 iCloud 订阅

1. 在 iPhone 的日历应用中打开「日历」，点目标 iCloud 日历旁的详情，打开「公共日历」并复制链接。也可从 iCloud.com 的日历共享面板复制。建议先创建专用测试日历，仅加入可公开给链接持有者的测试记录。可在 [Apple 的共享说明](https://support.apple.com/guide/iphone/-iph7613c4fb/ios) 查看设备步骤。
2. 用 Access 登录私有奕Studio，打开 **Calendar → 日历设置**。粘贴 iCloud 给出的 `webcal://` 或 `https://` 链接，点 **保存订阅**。Settings 不回显已保存地址。持有链接即可在奕Studio之外直接查看该日历。如果曾在不想共享的地方贴过链接，请在 Apple 侧关闭公共共享并核对旧链接是否失效，再复制新链接。
3. 返回 **Calendar → 刷新订阅**。Home 周历和 Calendar 共享缓存。缓存有效期约 15 分钟，访问时后台更新。手动刷新最短间隔 30 秒，失败退避约两分钟，保留最近一次成功的快照。Apple 发布的 ICS 可能有自己的延迟。每次成功读取替换旧快照，所以从源中移除的事件也会从投影消失。
4. **断开订阅**会清除工作台的订阅设置和缓存。Apple 侧公开共享由日历所有者另外关闭。

Worker 只请求匹配 Apple 主机和 `/published/2/` 路径的 HTTPS 订阅，拒绝 URL 参数、凭据、端口及全部跳转，最多读取 1 MiB、超时 9 秒。默认显示东京时间，解析窗口是过去 90 天至未来 366 天。全天日期和排他结束日期原样保留，定时事件先换算为绝对时间再按东京日期展示。浮动时间按东京解释。过密规则或超出解析预算的订阅会显示读取失败或沿用缓存。

## 在 iPhone / Mac 创建 YiStudioAddEvent

先在两个设备确认系统日历已启用 iCloud，并有一个可写的 iCloud 日历。用作读取核对时，快捷指令的写入日历必须与 Settings 中订阅的原日历相同。不要选择系统里的只读订阅副本。

1. 打开「快捷指令」，新建一个快捷指令并命名为 **YiStudioAddEvent**。运行时读取系统提供的「快捷指令输入」。若编辑器要求选择接收类型，选「文本」。
2. 加入「从输入获取词典」（Get Dictionary from Input）。把输入选为「快捷指令输入」。再用「获取词典值」逐一读取下表各键。每个动作的输入都选同一个词典，通过「设定变量」保留输出。

   | 键 | 设置和用途 |
   |---|---|
   | `eventId` | 稳定 UUID，用于查重 |
   | `title` | 事件标题 |
   | `start`、`end` | 定时事件为 UTC ISO 8601。全天为 `YYYY-MM-DD`，结束日期排他 |
   | `allDay` | JSON 布尔值。若条件动作收到文本，先查看其在本机的值再建立分支 |
   | `timeZone` | 此阶段为 `Asia/Tokyo` |
   | `location` | 地点，可能为空 |
   | `notes` | 备注，已包含 `YiStudio-Event-ID: <eventId>` 独立一行 |
   | `targetCalendar` | 可缺省。按第 5 步选择目标 |

3. 加入「如果」。当 `eventId`、`title`、`start` 或 `end` 缺失时显示提示并用「停止此快捷指令」结束。定时分支用「从输入获取日期」分别解析开始和结束，取各自第一项。ISO 字符串包含 `Z`，直接解析，避免按设备时区重新拼装。全天分支分别解析两个日期字符串为**本地日历日期**，打开新增动作的「全天」。如果该版本动作使用包含末日的日期选择器，先用「调整日期」对结束日期减一天；若动作接受排他结束日期，原样传入。用单日和跨日各测试一次。日期转换失败或结束早于开始时停止。
4. 加入「查找日历事件」，按第 5 步确定的日历和开始日附近的日期范围查找。为开始日加减至少一天，减小跨时区漏检。用「重复每一项」取「日历事件详细信息 → 备注」，检查是否包含完整的 `YiStudio-Event-ID: <eventId>`。有匹配时提示已存在或需核对，并停止执行。若版本或权限使备注不可可靠读取，使用「从菜单中选取」让用户先在 Apple 日历核对，再选「确认新增」或「取消」。日期附近查找可能漏掉已经被手工移到其他日期的事件，重试前也要检查。
5. 给「添加新事件」（Add New Event）配置一个预先选定、可写的 iCloud 日历。为了跨设备兼容，优先在动作的「日历」字段固定选择，避免同名日历选错。若需要支持多个目标，用「如果 `targetCalendar` 等于指定名称」分支到另一条预先选好的「添加新事件」动作。缺省用默认 iCloud 日历，未知值用菜单提示或停止。若该设备的日历字段支持日历变量，仍需确认变量对应 iCloud 帐户下的可写日历。
6. 将「添加新事件」的标题、开始、结束映射到第 2、3 步的变量。展开「显示更多」，把地点和备注映射到对应变量。全天与定时用不同分支，或将全天字段绑定到布尔变量。首次测试保持「显示编写表单」开启，检查标题、日期、地点、备注、日历和时区再保存。如果本机版本无法映射全天、备注或目标日历，先用编写表单核对，必要时使用 .ics 回退。
7. 最后用「文本」输出固定短语 `finished`，避免将日程内容作为结果返回浏览器。首次运行时，在系统提示中授予所需的日历读写权限。若两台设备同步了快捷指令，仍分别检查动作中的目标日历和权限。

网站选用 `shortcuts://x-callback-url/run-shortcut`，因为 iPhone 和 Mac 的 Apple 文档都描述了成功、取消和错误回调。普通 `shortcuts://run-shortcut` 可启动并接收相同输入，但没有对应回调。回调可能打开系统默认浏览器，且无论成功与否都不能证明 iCloud 已同步。网站收到回调后只显示对应提示。若浏览器拦截、快捷指令未安装或系统没有回调，请回到日程详情核对，必要时用 Safari 打开私有工作台或下载 .ics。Apple 文档 [iPhone 回调](https://support.apple.com/guide/shortcuts/apdcd7f20a6f/ios)、[Mac 回调](https://support.apple.com/guide/shortcuts-mac/use-x-callback-url-apdcd7f20a6f/mac)、[日期格式](https://support.apple.com/guide/shortcuts/technical-standards-apdfd459e13d/ios)、[查找与筛选动作](https://support.apple.com/guide/shortcuts-mac/intro-to-find-and-filter-actions-apd3c845e881/mac)。

## 使用和核对

- **Auto → 计划 → 安排日期 → 打开该安排 → Review**。也可以在 **Calendar → 新建待办 → 打开该待办 → Review**。核对 Link 和 Time，选 Action，再确认。只有 Add to Calendar 产生独立的待写入日程。Add To-Do 确认已有待办，Remind Only 只记录意向。
- **Calendar → 当天日程 → 加入 Apple 日历**。设备兼容时启动快捷指令。其他设备可以 **下载 .ics** 并手动导入。周期规则和候选留在工作台，Apple 接收用户选中的单次安排。
- **Calendar → 刷新订阅**。用备注中的 Event ID 或导出文件的 UID 配对，并检查开始、结束和全天类型。一条准确匹配才显示「已匹配 iCloud」并合为一行。相同来源 ID 对应多项或时段不一致时保留记录以供核对，暂停再次导出。在 Apple 日历更正后刷新。已请求打开但没有匹配的事件可手动「标记需核对」。
- 草稿属于单次待办，确认属于 Review。Calendar Event 使用独立 ID，从待写入到已请求打开、需核对或由订阅计算出的已匹配。浏览器回调和下载都不会产生同步成功状态。已经确认的日程保留独立快照，改动原待办不会改写它。现阶段不提供改写 Apple 事件或手动绑定任意 UID 的功能。

## iPhone 与 Mac 验收

在两个系统上分别使用 Safari 和日常浏览器，以一个专用可写 iCloud 日历进行：

- [ ] 点网页按钮后打开正确的快捷指令，测试中文、符号、换行、备注、地点和目标日历。
- [ ] 验证定时、全天、跨日和跨月记录。把设备切到另一个时区，确认定时仍表示同一时刻，全天日期没有挪动。
- [ ] 同一个事件再点一次，设备检查备注中的 ID，验证阻止重复或给出明确的人工确认。
- [ ] 测试取消、拒绝权限、未安装、未回调和浏览器拦截。确认网页不会显示「已匹配 iCloud」。
- [ ] 在另一设备或 iCloud.com 核对事件。回到工作台刷新同一个订阅，验证只显示一条已匹配记录。
- [ ] 在测试日历改期或删除，然后刷新验证工作台不会保留旧的订阅记录。测试关闭共享后旧缓存和状态。
- [ ] 用 .ics 回退导入一项，核对 UID、全天语义及是否在重新读取后配对。

自动化已覆盖本地 Worker 逻辑、模拟签名 Access JWT、数据库隔离和冲突、订阅失败及缓存、时区和重复例外、.ics 和快捷指令参数、精确匹配及冲突。生产 Cloudflare、真实 iCloud 读取、设备快捷指令和跨设备写入属于待验收项。当前使用单订阅、访问时刷新和按用户版本控制的计划快照。需要在无人访问时同步、多订阅或多人同时编辑时，再增加定时任务和逐条记录的存储接口。

## 自动查重版快捷指令

用 Python 运行 scripts/build-apple-shortcut.py 并指定输出文件，再用 macOS 的 shortcuts sign 签名。

1. 导入并保留名称 **YiStudioAddEvent**。在设备上把「添加新日程」动作的日历设为目标可写 iCloud 日历，或者确认设备的默认日历就是它。自动版使用设备设置，忽略网页表单的可选日历名称。
2. 首次运行时根据系统提示授权。快捷指令读取设备可访问的日历，用备注里的奕Studio Event ID 查找。找到就输出 existing，停止新增。手工创建且没有标记的同名日程不会被判定为同一个事件。要改期请打开 Apple 日历中的原事件。
3. 没找到匹配时，添加动作直接保存到已配置的日历并输出 added。仅从自己的奕Studio页面启动。快捷指令的 URL 输入本身不携带可信网页来源，设备的系统权限和打开提示仍适用。
4. 返回页显示「已存在」或「已添加」。原工作台能收到匹配的本次回调时，会更新事件标签。若系统跳到另一浏览器，先在返回页看结果，再从工作台刷新订阅。只有读回 iCloud 的唯一匹配会显示「已匹配 iCloud」。

自动版先在专用测试日历验证。使用同一测试日程点两次，第一次应添加，第二次应停止。分别验证定时和全天记录，并确认目标日历中每项只出现一条。手动确认版可作为设备兼容回退。

## 无自有域名时的私有预览

Cloudflare 支持用 Access 保护单个 Worker 的 workers.dev 地址。先启用 Zero Trust，然后建立只允许本人登录的规则。使用部署专用配置启用该 Worker 的 workers_dev，继续禁用公开预览地址，并将 STUDIO_ORIGIN 配成该 Worker 的完整 HTTPS 地址。确认匿名请求被 Access 拒绝、登录后 API 可用，再粘贴真实订阅。默认仓库配置仍关闭 workers.dev。见 [Cloudflare Access 与 Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)。
