# iCloud Calendar 只读同步评估

## 推荐路径

先在受保护的服务端验证一个由用户选择的 iCloud 日历。奕Studio 将其显示为独立只读来源。第一阶段读取日程标题、时间和必要状态。私人日历数据不进入静态站点。当前仓库只有浏览器内存原型。

| 连接方式 | 可行性与成本 |
|---|---|
| Apple Account 数据授权 | Apple 支持部分第三方应用取得 iCloud Mail、Calendar 与 Contacts 的数据授权，可在账号设置撤销。奕Studio 能否使用该授权流程需要向 Apple 验证。普通 Sign in with Apple 的公开 scopes 为姓名与邮箱，不能用于获取日历。 |
| CalDAV 与 App 专用密码 | Apple 提供 App 专用密码作为兼容选项，需要双重认证。可在隔离服务端用测试账号验证 CalDAV 的集合发现、日期范围读取和撤销。凭据可能拥有比只读界面更广的权限，Worker 应限制为读取方法与选定集合。接入成本中等，主要是鉴权、DAV 发现、iCalendar 解析和轮询。 |
| 公开 ICS | Apple 的公开日历允许取得链接的人订阅。它适合本来就应公开的活动，私人日历应采用鉴权连接。 |
| 原生 EventKit | iOS 或 macOS 应用可访问获授权的设备事件和提醒。Apple 的权限模型要求读取事件时申请完整事件访问。原生方案还需安装客户端并设计上传与离线同步，成本高于服务端只读方案。 |

来源：[Apple 第三方数据授权](https://support.apple.com/en-us/121539)、[App 专用密码](https://support.apple.com/en-us/102654)、[Sign in with Apple scopes](https://developer.apple.com/documentation/signinwithapple/incorporating-sign-in-with-apple-into-other-platforms)、[iCloud 日历共享](https://support.apple.com/en-sg/guide/icloud/mm6b1a9479/icloud)、[EventKit 权限](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)。

## 同步与数据映射

- **只读**由服务端定期拉取选定日历的日期范围，向浏览器提供经过裁剪的日程投影。探测服务端是否支持 `sync-collection`。支持时保存每个集合的同步令牌，失效后重建。否则比较资源 URL 与 ETag，并在成功完成范围扫描后处理移除记录。请求失败时保留已有投影并标记更新时间。
- **双向**成本更高，需要处理新增、编辑、删除、邀请、重复事件单次或整组修改，以及多个设备的并发。更新用 `If-Match` 与上次读取的 ETag，遇到 412 拉取远端版本并让用户处理冲突。新建用稳定 UID 与 `If-None-Match: *` 防止重试重复。只有在授权、凭据保管、冲突与回滚均确认后再开发。
- 维护远端映射键 `连接 ID + 日历集合 ID + UID + RECURRENCE-ID`，同时保存资源 URL、ETag 和内部 ID。重复扫描执行幂等更新。标题和时间只用于候选匹配，不能作为唯一键。将 Workshop 事件、内部待办与外部日程作为不同来源聚合，可通过明确关联去重。
- 定时事件保留 UTC 时间与原始 TZID。全天事件保存日期和排他的结束日期。浮动时间按明确的日历时区解释。限制重复规则展开范围，并处理夏令时、跨日、例外实例及单次改期。
- Apple Calendar 的事件是日程。Apple Reminders 属于单独的数据与授权范围。iCalendar 定义的 VTODO 不能当成现代 iCloud Reminders 一定可经 CalDAV 读取的保证。奕Studio 的 To-Do 与 Habits 首阶段使用自身数据来源。

来源：[CalDAV RFC 4791](https://www.rfc-editor.org/rfc/rfc4791.html)、[WebDAV 同步 RFC 6578](https://www.rfc-editor.org/rfc/rfc6578.html)、[iCalendar RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html)、[Apple EventKit](https://developer.apple.com/documentation/eventkit)。

## Cloudflare 部署边界

1. 先为私有日历 API 配置身份验证和逐用户授权。公开站和静态预览不具备日历绑定。API 仅返回选定范围的最小字段，使用私有缓存策略。
2. 凭据仅进入服务端密钥管理。单用户验证可用 Worker secret。多账户凭据需要单独的加密存储与密钥轮换，解密密钥与记录分离。Apple 账号密码、App 专用密码、令牌和订阅链接不得进入仓库、前端、浏览器存储或日志。提供撤销与清理投影入口。
3. 连接器限制目标主机、端口和读取方法，校验发现返回的 URL。重定向按允许名单逐跳检查，凭据只发给已验证的 Apple 端点。设置超时、限流和退避。日志仅记录摘要，不记录授权头、请求正文或日程内容。
4. 可使用 Cron 定期同步，按连接串行处理，使用私有 D1 或等效持久存储保存最小投影与同步游标。先用专用测试日历验证授权、跨时区、重复和撤销，再确定轮询成本及可用的 Apple 授权方式。

来源：[Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、[Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)。
