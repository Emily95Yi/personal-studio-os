# Personal Studio OS

展示 Workspace 信息架构与 Workshop 嵌套导航的 Web Demo。首页分为 Private Workspace 和 Public Space。三个私人空间有独立概览，每个集合有可刷新、可返回的地址。

```sh
npm run dev
```

打开 http://127.0.0.1:4181。使用原生 JavaScript、CSS 和 Hash Router，仅需 Node.js。静态托管目录为 `site/`。

- Workshop：Projects → Project Overview → Events / Resources。Events 下有单次活动详情。
- Career：Exams & Practice、Resume & Experience。
- Self-Board：Discover、Experience、Reflect & Create、SOP & Habits、To-Do。
- 一期一会 in Tokyo：Home、Activities、Stories、About。

从 `/#/workshop/projects` 进入 Project 结构预览，再打开 Events 与 Resources。预览入口用于走查页面，Repository 中的项目、活动、资源和内容集合仍为空。顶栏保留 Search，页面支持直达、刷新和面包屑返回。

`site/pages.js` 定义路由与资源模块配置。`site/repository.js` 保留只读接口与未来数据形状，正式内容可由受控云端 API 提供。

- [信息架构与路由](docs/architecture.md)
- [后续 Roadmap](docs/roadmap.md)
