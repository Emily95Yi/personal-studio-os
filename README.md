# Personal Studio OS

展示两层信息架构的 Web Demo。首页分为 Private Workspace 和 Public Space。三个私人空间有独立概览，每个集合有可刷新、可返回的地址。

```sh
npm run dev
```

打开 http://127.0.0.1:4181。使用原生 JavaScript、CSS 和 Hash Router，仅需 Node.js。静态托管目录为 `site/`。

- Workshop：Projects、Sessions、References。活动实践留在 Workshop，通用资料由 Self-Board 的 Discover 统一收纳。
- Career：Exams & Practice、Resume & Experience。
- Self-Board：Discover、Experience、Reflect & Create。这三个入口是可重叠的视图。
- 一期一会 in Tokyo：Home、Activities、Stories、About。

顶部保留 Search。集合显示说明性空状态，空 Demo 中没有可打开的记录详情。详情地址的层级为 `/#/<workspace>/<collection>/<id>`，无记录时可返回集合。

`site/pages.js` 注册空间、集合和公开页面。`site/repository.js` 保留内容、关系和公开投影的只读接口，四个数据集合均为空。真实内容与凭据应由未来的受控服务提供，Demo 不连接数据库或使用浏览器持久化。

- [信息架构与路由](docs/architecture.md)
- [后续 Roadmap](docs/roadmap.md)
