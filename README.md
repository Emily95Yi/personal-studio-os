# 奕Studio

Workshop 用画廊浏览活动系列和海报。Self-Board 将个人内容和行动安排放在同一个桌面。项目使用原生 JavaScript、CSS 和 Hash Router，静态托管目录为 `site/`。

```sh
npm run dev
```

打开 http://127.0.0.1:4181。

- Home 页眉的日历图标进入 Calendar。Calendar 按东京时区显示，默认 Week，可在同页切换 Day / Week / Month。
- Workshop → Project Gallery → Events / 共通内容 → Event Detail。共通文档可按版本采用，素材与 Wiki 在 Discover。
- Self-Board 的主入口是 Writing、Reflections、Discover、Collections。Discover 分为 Workshop Wiki 和 Personal Explorations，Collections 用于快速保存与整理生活收藏。页眉图标打开浮动搜索、Quick Capture、Network 和设置。总览包含 Inbox、Auto 和 Calendar。
- Auto 支持单次计划、重复规则和周期次数目标。计划可以手动排到某天；从 Calendar 改期时只会改动该次安排。两处共用同一 Repository。

Workshop 和 Self-Board（包括探索与收藏）保存到当前站点、当前浏览器的 IndexedDB。可从 Workshop 的数据迁移入口加载测试数据。本机静态预览的 Auto 和 Calendar 编辑仅保存在当前页面内存。私有 Worker 配置完成后可保存计划并读取 iCloud 订阅。

- [信息架构、旧链接兼容与数据边界](docs/architecture.md)
- [Workshop 数据迁移](docs/workshop-migration.md)
- [后续 Roadmap](docs/roadmap.md)

Apple Calendar 的使用、私有部署和设备验收见 [集成指南](docs/apple-calendar-integration.md)。使用 Node.js 22.13 或更新版本执行 `npm ci` 和 `npm test`。

CalDAV 双日历测试步骤见 [测试与迁移](docs/icloud-caldav.md)。
