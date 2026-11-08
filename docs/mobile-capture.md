# Mobile Capture · 运维与验收

## 现状核查

- 工作目录是 `personal-studio-os`，开发基线为本地 `main`（`5f37f24`），已用只读查询确认与 GitHub 的 `origin/main` 一致。
- 项目使用原生 JavaScript、CSS 和 Hash Router。私有 Worker `yistudio-private` 提供静态资源和 API，生产配置中的入口是 [奕Studio](https://yistudio-private.cho-eki0915.workers.dev)。无会话探测返回 HTTP 302。Worker 校验原有 Cloudflare Access JWT，并使用其 `sub` 作为账户边界。
- 忽略的生产配置已声明 D1 `DB` → `yistudio-private`、R2 `STUDIO_CONTENT` → `yistudio-private-content`。当前 Wrangler 会话缺少 Cloudflare 凭据，生产 D1 真实占用、各表占用、R2 容量及公开入口状态待在 Dashboard 核实。迁移前的历史导出在本机 SQLite 恢复后为 64 KiB，最大表 `caldav_connections` 为 8 KiB。其余日历表各 4 KiB。这是历史导出恢复的文件大小，生产占用请以 D1 报告为准。
- 旧 D1 迁移定义 `calendar_sources`、`planner_states`、`caldav_setup`、`caldav_connections`、`caldav_events`、`caldav_events_queue` 和 `studio_cloud`。旧 Studio 以 IndexedDB 保存本机内容，有私有绑定时以 R2 JSON 快照同步，D1 只保存同步指针及编辑租约。Workshop / Event 和既有编辑器的部分附件在旧快照中为 Base64，文章和活动文档已有版本记录。现有数据沿用原路径。新 Capture 的正文和元数据在 D1，文件字节在 R2。Calendar Weekly View 继续走既有 Planner、CalDAV 和 ICS 接口。localStorage 的 Reflections 排列偏好仍是本机设置。

## 分类映射

| 模块 | 手机选择 | 现有业务记录 |
| --- | --- | --- |
| Reflections | 「标签待定」或现有卡片标签，单选 | `content` 的 thought，`reflectionLabelId` |
| Collection | 「待分类」或可见分类，文件夹可选 | `collectionItems.categoryId` / `folderId` |
| Discover → Workshop Wiki | Tools & Methods、Prompts & Facilitation、Concepts & Principles、Resources | `content`，映射原有类型和 `discoverCategory` |
| Discover → Personal Explorations | 现有 Topic，外加同级的「待分类」 | `explorationEntries.topicId` |

Collection 的「待分类」指 Collections 自己的未分类位置。选定分类后，可以存入分类本身，也可以选择该分类已有的文件夹。Quick Save 始终写入 Self-board Inbox。「待分类」在私有 Studio 云端加载时补齐，下次原编辑器保存时写入旧快照。分类将同一 D1 收藏的正文转换成原模块的记录字段。读取 Studio 时合并，原编辑器保存时将它拆回 D1。D1 批处理同步提交云端修订号和收藏变化。需要先结束正在运行的 Studio 编辑租约，才能跨模块分类。遇到目标模块内的重复链接、引用关系或目标无法表示的编辑字段时，界面会返回冲突并保留原记录。

## 云端配置

1. 使用已有的私有 `wrangler.production.toml`。保留 `STUDIO_ORIGIN`、`ACCESS_TEAM`、`ACCESS_AUD`、`ICAL_ENCRYPTION_KEY` 及既有 CalDAV 绑定和 Secret。在 Cloudflare 确认 `DB` 指向既有 D1、`STUDIO_CONTENT` 指向既有私有 R2。确认 Bucket 的 r2.dev 和公共自定义域名均关闭。新对象使用 `capture/private/` 前缀，可为该前缀配置中止未完成分片的生命周期规则。避免对已完成的对象设置过期删除。
2. 在 D1 控制台记录容量、迁移状态和 Time Travel 恢复点。将 D1 导出及 R2 备份保存到仓库之外。需要查历史表占用时，可将导出恢复到单独 SQLite 文件后查 `dbstat`。恢复后的占用单列记录。
3. 获得生产变更授权后，先运行 `npx wrangler d1 migrations list DB --remote --config wrangler.production.toml` 核对目标，再运行 `npx wrangler d1 migrations apply DB --remote --config wrangler.production.toml`。0005 新建设备、收藏、上传、分片和容量缓存五张表。旧数据没有批量重写。然后运行 `npx wrangler deploy --config wrangler.production.toml`。确认浏览器登录、周历和 Storage 面板。
4. 手机快捷指令需要绕过 Access 的交互登录。只在同一域名的 **两个精确范围** 配置更具体的 Access 应用与 Bypass 策略，`/api/capture/mobile` 和 `/api/capture/mobile/*`。保留站点根、`/api/capture/items`、`/api/storage`、`/capture.html` 以及 Calendar 的原 Access 策略。配置后，无凭证请求手机接口应返回 Worker JSON 401，无会话访问主页或下载接口仍应由 Access 拦截。若该 workers.dev 域的 Access 配置无法按路径设置，请先保留 Web Capture，并在 Cloudflare 确认可行的精确路由后再开启手机 API。将生产 `[vars]` 的 `CAPTURE_MOBILE` 设为字符串 `"1"` 并部署后，设备凭证才能调用手机 API。
5. 回退时先移除上述 Bypass 并关掉 `CAPTURE_MOBILE`。如果需要回滚 Worker，保留 0005 的 D1 表和 R2 对象。旧 Worker 暂时看不到存在 D1 的已分类收藏，恢复本版本后会重新显示。如果需要 D1 Time Travel，先备份新数据和对应的 R2 对象，核对两处版本是否一致，再恢复。生产问题下避免直接 DROP 表。

部署新增变量只有可选的 `CAPTURE_MOBILE`。设备凭证由 Web Settings 生成并在 D1 保存 SHA-256。容量及上传通过 Worker 绑定访问 D1 / R2，无需新增 Cloudflare 管理 Token 或长期 R2 密钥。CLI 的部署认证在本地或 CI 配置。[Access 应用路径](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) · [Access Bypass 配置](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/)

## API

登录的网页调用同源 `/api/capture`。除直接附件下载外，Web API 要求 `X-Studio-Request: 1`，写入还校验 Origin。手机在 `/api/capture/mobile` 下用 `Authorization: Bearer <设备凭证>`，仅开放保存、读分类和本人未提交上传会话操作。下表的路径相对对应前缀。

| 方法与路径 | 作用 |
| --- | --- |
| POST 根路径 | 创建收藏，必填 `requestKey`、`type`。可传 `title`、`originalText`、`userNote`、`sourceUrl`、`metadata`、`target`、`attachmentId` |
| GET /options | 模块 → 分组 → `{label,target}`，原样回传 `target` |
| GET /items | Web 列表，支持 `status`、`type`、`q`、`sort`、`offset`、`limit` |
| GET / PATCH / DELETE /items/:id | Web 详情、编辑、分类、归档、恢复、永久删除。PATCH 传详情返回的 `version` |
| PATCH /items/batch | Web 批量分类，传 `ids`、`target`，最多 20 条 |
| GET /items/:id/attachment | Web 私有下载，支持 `?preview` 预览 PNG/JPEG/GIF/WebP/AVIF |
| POST /uploads | 传 `id`、`size`（字节）、`filename`、可选 `mime`，返回 `chunkBytes` |
| PUT /uploads/:id/:part | 分片编号从 1 开始，原始文件字节 |
| POST /uploads/:id/complete | 确认全部分片和实际长度，返回 `id`、`duplicateFile` |
| POST /uploads/single?id=…&filename=… | 快捷指令单次原始文件请求，最多 8 MiB，返回 `id`、`type`、`duplicateFile` |
| DELETE /uploads/:id | 取消未关联的上传 |
| GET / POST /devices、DELETE /devices/:id | Web 查看、签发、撤销独立设备凭证 |
| GET / POST /api/storage | Web 获取容量，POST 手动刷新 |

URL 去重忽略锚点及常见营销参数，原始地址保留。相同设备及相同 `requestKey` 返回原收藏，原备注和分类保持原值。不同的文字摘录可以共享同一个来源地址。二进制以分片 SHA-256 组合校验，可提示同一账户已有相同内容。重复附件允许作为独立收藏存储。每条新收藏最多一个附件。手机网页支持 256 MiB，以 8 MiB 请求分片、中断重试、取消、完成后确认的方式写入 R2。上传会话有效 24 小时。计划任务清理超时未关联对象及已删除收藏的附件。图片按收到的字节存储，iOS 分享方式决定发送原件或兼容版本。PDF 通过私有链接下载后用系统阅读器打开。

## Storage

D1 从 Worker 绑定返回的 `meta.size_after` 读取当前数据库字节数。R2 通过绑定分页列出已完成对象并累加大小，范围为当前绑定的私有 Bucket（包括旧 R2 快照）。以五分钟缓存采样，手动刷新最短间隔 15 秒。扫描超过 30 页或绑定无法提供数据时显示暂不可获取。D1 的 500 MB 是 Free 计划单库参考，R2 的 10 GB 是 Standard 免费 GB-month 参考。界面 R2 当前对象大小与账单用量分别解释。70% / 85% / 95% 分级提醒，无自动清理或限流策略。[D1 返回值](https://developers.cloudflare.com/d1/worker-api/return-object/) · [D1 限制](https://developers.cloudflare.com/d1/platform/limits/) · [R2 列表](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) · [R2 计费](https://developers.cloudflare.com/r2/pricing/)

## iPhone 配置模板

### 安装已签名的快捷指令

1. 部署手机接口后，两台手机各自在 Safari 登录同一个 Studio 账户，打开 Self-board → Settings → Capture Devices。分别创建 iPhone A 和 iPhone B，并在各自设备上复制当次显示的凭证。
2. 将 [存入奕 Studio.shortcut](../deliverables/存入奕%20Studio.shortcut) 通过 AirDrop 或「文件」App 发到两台手机。在 iPhone 上点开文件，添加快捷指令，并在导入设置中粘贴本机凭证。若未出现设置问题，编辑快捷指令顶部的「文本」动作并替换占位文字。
3. 模板已配置在共享表单中显示。如分享菜单里没有该入口，检查快捷指令详情中的「在共享表单中显示」。在 Safari 分享一个网址，选择「快速保存 · Inbox」，然后回 Self-board 核对。也可以直接在「快捷指令」App 中运行，测试手动输入或剪贴板。

同一份已签名模板可发给不同 Apple ID 的设备。凭证有效期 180 天。换机或轮换时签发新凭证，替换手机中的值后撤销旧设备。分享时使用未填凭证的安装文件。

如需重新生成，在 macOS 运行以下命令。签名时 Apple 会验证这份未填写凭证的模板。[Apple 快捷指令签名说明](https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac)

```sh
python3 scripts/build-capture-shortcut.py "/tmp/存入奕 Studio.shortcut"
shortcuts sign --mode anyone --input "/tmp/存入奕 Studio.shortcut" --output "/tmp/存入奕 Studio 已签名.shortcut"
```

以下是需要自行调整或重建动作时的手动配置参考。

### 主流程

1. 在「快捷指令」创建「存入奕 Studio」。点详情，开启「在共享表单中显示 / Show in Share Sheet」，接受 URL、Safari 网页、文本、富文本、图像、PDF、文件。无输入时选择「继续」。开头用两个「文本」动作分别设变量 `Base`（Studio 源站 + `/api/capture/mobile`）和 `DeviceToken`（这台手机的凭证）。
2. 「如果」快捷指令输入有值，使用输入。若包含多项，先用「从列表中选取」选一项。没有输入时用「从菜单中选取」，提供「手动输入文字」（要求输入）、「读取剪贴板」（获取剪贴板）、「选择照片」（选取照片）、「选择文件」（选取文件）。将选中对象存为 `Input`。
3. 「获取输入的类型 / Get Type」区分 Safari 网页、URL、文字和文件。Safari 网页用「获取 Safari 网页的详细信息」取 URL 和网页名称。文本和富文本用「从输入中获取文本」得到纯文本，段落保留。若完整文本匹配 `^https?://[^\s]+$`，用 URL 分支，否则作为文字保存。iOS 输入类型名称可能随系统语言而变化。调试时可先用「查看内容图谱」确认第三方 App 传入的类型。文字允许另传 `sourceUrl`，没有可靠来源时留空。
4. 用「从菜单中选取」提供「快速保存」和「选择分类」。快速保存的 `target`、`userNote` 为空。「选择分类」用 GET `Base/options`，所有 HTTP 动作在「获取 URL 的内容 / Get Contents of URL」中设置 `Authorization` 为 `Bearer [DeviceToken]`。从字典取 `modules`。对列表逐项取 `label`，让用户从列表选模块，再取该项的 `groups` 选择分组，接着对 `options` 逐项取 `label` 选择分类。为避免同名项目误匹配，可在显示项前加重复索引，再用「获取列表中的项目」按该索引取原字典。设置其 `target` 为变量 `Target`，不解析或改写它。「要求输入」可选备注，允许留空。
5. 在发送前生成 `RequestKey`。用「当前日期」→「格式化日期」（自定义 `yyyyMMddHHmmssSSS`）加「随机数」（六位以上）并用连字符拼接。一次运行内重试复用此键。文字与 URL 直接进第 7 步。图片、PDF 和其他文件先执行第 6 步。
6. 用「获取文件的详细信息」取得原始名称，「URL 编码」处理文件名。用 POST `Base/uploads/single?id=[RequestKey]&filename=[编码后的文件名]`，请求正文选「文件 / File」，设置为原 `Input`。使用服务端响应的 `type` 和 `id` 作为 `Type`、`AttachmentId`。超过 8 MiB 时可用「打开 URL」打开同一 Studio 的 `/capture.html`，在浏览器里选原文件、选择保存方式。手机网页支持上传进度和重试。原生快捷指令单文件动作没有自定义进度条。
7. POST `Base`，正文选 JSON。必填 `requestKey` 和 `type`。URL 分支传 `type=url`、`sourceUrl`。文字分支传 `type=text`、`originalText`、可选 `sourceUrl`。文件分支传服务端 `type`、`attachmentId`。可选传 `target` 和 `userNote`。Safari 已有网页名称时用 `metadata` 字典传 `pageTitle`，也可传 `siteName`、`description`、`favicon`、`cover`（见下节）。
8. 对每个请求先判断返回能否解析为字典且没有 `error`。保存请求还须有 `id` 及受支持的 `status`。有 `classificationError` 就显示「已存入 Inbox，分类未完成」及错误码。有 `duplicate` 就显示「已存在，保留原有记录」。其余只在 `status=inbox` 或 `organized` 时分别提示成功。iOS 如果先显示网络动作失败，请保留输入后重试，或回到 Inbox 核对。Web 上传表单会在当前页面保存会话键。

### 可选 Safari 网页元数据

只有收到 Safari 网页对象时，可以在快捷指令里使用「在网页上运行 JavaScript」。以下动作在用户正在分享的网页执行，Worker 不向用户提供的 URL 发请求。其他 App 没有这些字段时，仍可只保存原始 URL。

```js
const meta = key => document.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.content || '';
const absolute = path => {
  try {
    const url = new URL(path, document.baseURI);
    return path && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
};
completion({
  pageTitle: (meta('og:title') || document.title).slice(0, 300),
  siteName: meta('og:site_name').slice(0, 300),
  description: (meta('og:description') || meta('description')).slice(0, 2000),
  favicon: absolute(document.querySelector('link[rel~="icon"]')?.getAttribute('href')),
  cover: absolute(meta('og:image')),
});
```

将动作结果作为 `metadata` 字典。首次运行请按 iOS 提示授权该网页动作。网页资源地址作为元数据保存。Safari 或第三方 App 只提供 URL 时，用域名作为无标题情况下的显示标题。[Apple 分享输入](https://support.apple.com/guide/shortcuts/apd350ce757a/ios) · [Apple HTTP 请求动作](https://support.apple.com/guide/shortcuts/apd58d46713f/ios)

## 验收与交付边界

- `npm test` 30 项通过，覆盖现有 Calendar、CalDAV、Workshop、Studio 云端租约和模块数据逻辑。
- Playwright + Chrome 390 × 844 实测文字快速保存，随后进入 Self-board 并看到收藏位于本周日历上方。
- `node scripts/capture-acceptance.mjs` 对本机 127.0.0.1:4182 的隔离 Wrangler 预览运行。该预览绑定独立本地 D1/R2，并注入测试账户和测试 Origin。验收脚本覆盖三类模块、URL 去重、同 URL 多段摘录、原编辑器回写、重分类、批量分类、归档、图片、PDF、9 MiB 分片中断与重试、文件指纹、附件所有权、容量、单设备撤销。
- 生产部署后，在两台手机各运行一次 Safari 分享（快速保存）、文字分享（Reflections）、手动读取剪贴板（Discover）、照片与 PDF。检查 Mac 上同一 Inbox、分类记录和私有附件。撤销 A 后确认 A 返回 401 而 B 仍能保存。再验证生产 Storage、原 Workshop 文件、周历和 Apple Calendar 实际同步。
- 大文件当前使用 Worker 分片请求，没有 R2 预签名直传、断网后跨页面恢复或上传后台续传。现有 Workshop / Event 附件结构保持兼容，本次没有将旧编辑器改为 R2 独立对象直传。生产配置、iPhone 分享菜单及真机 Apple Calendar 同步需要现场验收。

## 主要修改文件

- `migrations/0005_mobile_capture.sql` — 新增五张表。
- `worker/capture.js`、`worker/capture-state.js`、`worker/capture-files.js`、`worker/capture-storage.js` — 设备授权、收集 API、分类、文件及容量。
- `worker/index.js`、`worker/studio-cloud.js` — API 路由、清理和 Studio 修订号。
- `site/capture*.js`、`site/capture.html`、`site/style.css` — Inbox、设备、容量、手机表单。
- `site/app.js`、`site/studio-cloud.js`、`site/self-board-*.js`、`site/board-library-*.js` — 接入 Self-board 和原模块阅读、编辑和检索。
- `tests/studio-cloud.test.js`、`scripts/capture-acceptance.mjs` — 回归和隔离验收。
