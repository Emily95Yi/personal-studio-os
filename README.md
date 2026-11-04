# Personal Studio OS

展示两层信息架构的 Web Demo。首页分为 Private Workspace 和 Public Space。三个私人空间有独立概览，每个集合有可刷新、可返回的地址。

```sh
npm run dev
```

打开 http://127.0.0.1:4181。使用原生 JavaScript、CSS 和 Hash Router，仅需 Node.js。静态托管目录为 `site/`。

- Workshop：Projects、Knowledge、Resources
- Career：Projects、Learning、Portfolio
- Self-Board：Reading、Watching、Notes、Works
- 一期一会 in Tokyo：Home、Activities、Stories、About

本版清除了私人示例项目、阅读笔记、文章、发布记录、关系、公开活动和故事。集合使用说明性空状态，顶部保留 Search。该 Demo 不连接生产数据，也不使用浏览器持久化。

`site/pages.js` 注册空间、集合和公开页面。`site/repository.js` 保留内容、关系和公开投影的数据形状与只读接口。新增集合或公开页面时，可复用现有空状态布局。真实内容与凭据应由未来的受控服务提供。

- [信息架构与路由](docs/architecture.md)
- [后续 Roadmap](docs/roadmap.md)
