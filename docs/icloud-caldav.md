# Apple Calendar 双向同步与部署

在 Studio 的「Calendar → 日历设置 → Apple 私人日历」使用同一个 Apple 账号和 [App 专用密码](https://support.apple.com/en-ie/102654)，选择两个不同的 iCloud 日历：A 可读写，B 在 Studio 只读。已有 A 连接可直接点「选择只读日历 B」，复用原授权。没有私人 B 时，仍可选用原有的公开 ICS 订阅。私人 B 读取失败时会保留其上次成功缓存，不切换到公开源。需要更换密码时，断开连接再选回同一个 A；Apple 端也可撤销 App 专用密码。连接请求不回显密码、私有路径或授权头。

在 Calendar 可以按 A / B / 全部筛选，保留 Day / Week / Month。可直接创建 A 日程，也可以从原 Auto 待办的 Review 新建关联日程。Studio 创建时使用固定 UID；后续修改使用当前 ETag 对原资源做条件 PUT，删除也检查 ETag。连接和同步状态与 Planner 数据分开；Apple 的标题、时间、全天状态、地点和备注会覆盖已同步日程的显示字段，原 Project、Event、Task、Review 和 Auto 关联保持独立。已确认的 Apple 删除保留本地同步墓碑，后续刷新不会重新创建原事件。

- **Pending / Error**：修改已保存在 Studio，等待处理或重试。
- **Synced**：Apple 端版本已读回。两端可继续编辑。
- **Conflict**：两边的修改仍在。先对照详情，再选择采用 Apple 版本或明确应用 Studio 的修改。Apple 已删除时不会以原 UID 重建。
- 重复事件、邀请和无法验证版本的资源可以查看，需在 Apple 日历中修改。对已关联单次事件，移到显示范围外不会被当作删除。标准显示范围为过去 90 天至未来 366 天，按东京日期展示。
- 新增仍会检查 A 和 B 的时间重叠。如果已配置只读源却暂时不可用，新增会暂停等待重试。两个日历没有共同的事务；独立客户端可以在检查与写入之间新建重叠日程。

## 隔离验收

创建两个空的 iCloud 测试日历，默认命名为 `YiStudio CalDAV Test A` 和 `YiStudio CalDAV Test B`。在本机运行 `node scripts/caldav-acceptance.mjs`；如使用其他名称，在命令后加两个带引号的准确名称，先 A 后 B。从终端输出打开仅监听 127.0.0.1 的测试页面，手动填写 App 专用密码。测试数据库在内存里，不使用生产数据；进程退出后会清除。本机桥接只用于验收真实 CalDAV，Access 的生产行为需要单独验证。

1. 在 Studio 新建单次 A 日程，确认 iPhone 只出现一条。检查定时、全天和跨日样例。
2. 在 iPhone 修改标题、起止、全天、地点和备注，再刷新 Studio 核对。随后从 Studio 再次修改，在 iPhone 确认是同一条事件。
3. 分别从两端删除。刷新两次，确认 Apple 删除不会被 Studio 补写。打开 Studio 编辑表单后先在 iPhone 保存同一条，再在 Studio 提交；确认旧版本被拒绝，表单内容保留，或详情中保留两版供选择。
4. 在 Apple 添加、修改、删除 B 日程并手动刷新。确认 Studio 没有 B 的写入入口。测试密码撤销后是否显示失败并保留缓存；完成后删除测试数据、撤销专用测试密码、停止本机进程。
5. 运行 `npm test`。自动化覆盖条件写入、412、缓存、签名 JWT 和模块回归；实际 iCloud 与 iPhone 验收单独记录。

## 既有 Worker 上线

- 使用现有 `yistudio-private` Worker、现有 `奕Studio Private` Access 应用及其所有者策略。生产地址为 `https://yistudio-private.cho-eki0915.workers.dev`，`workers_dev = true`，预览 URL 保持关闭。确保 Access 应用覆盖整个主机，且 JWT 的签发方、受众和当前 Worker 的 `ACCESS_TEAM`、`ACCESS_AUD` 一致。保留既有用户的身份和 D1 归属键。
- 从 Worker 控制台核对当前 `DB` 绑定，再复制 `wrangler.toml` 到已忽略的 `wrangler.production.toml`，仅在私有副本中用已核对的数据库 ID 替换占位值。不要新建数据库覆盖绑定。保留现有定时任务、变量和两个 Worker Secrets（`ICAL_ENCRYPTION_KEY`、`CALDAV_ENCRYPTION_KEY`）。不要轮换现有加密密钥；它们用来解密已有连接与订阅。若生产已有 `CALDAV_TEST_CALENDAR`，保持原值，扩大到正式 A 日历需要在真机验收后另行核对。
- 真机验收通过后，记录当前 Worker 版本，导出 D1 到仓库之外或已忽略且仅本人可读的目录。确认备份可还原，且远端待应用迁移只有新增字段的 `0003_caldav_bidirectional.sql`。先用私有配置执行 Wrangler dry run，再对同一个 D1 应用迁移、部署到同一个 Worker。所有远端命令都使用 `--config wrangler.production.toml`。
- 部署后核对新版本承接 100% 流量、域名仍启用、匿名 API 跳转 Access、所有者可登录，以及 Calendar 与其他模块可打开。如有问题，可回退 Worker 到原版本；新增 D1 字段与旧代码兼容，回退 Worker 不会回滚 D1 或 Apple 事件。

[Cloudflare Access 与 Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) · [Cloudflare D1 Wrangler 命令](https://developers.cloudflare.com/d1/wrangler-commands/) · [CalDAV 标准](https://www.rfc-editor.org/rfc/rfc4791.html)
