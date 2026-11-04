# Personal Studio OS

面向个人积累、创作与发布的可交互 Web Demo。首页汇总 Workshop、Career、Self-Board 和「一期一会 in Tokyo」。三个私人领域提供独立概览，集合与详情都有可分享和刷新的地址。

```sh
npm run dev
```

打开 http://127.0.0.1:4181。仅需 Node.js，无第三方依赖。静态托管入口为 `site/`，部署后可直接访问 URL，路由使用 hash。Demo 使用只读示例数据，筛选、关系选择和报名预览仅在当前会话内生效。

- [架构、Sitemap、导航取舍与数据流](docs/architecture.md)
- [交付范围与开发 Roadmap](docs/roadmap.md)

`site/pages.js` 注册私人领域、集合、共享工具和公开品牌页面。为领域增加集合时，定义其标签、描述和现有分类即可复用概览、集合和详情布局。增加公开页面时，在注册表和 `site/views.js` 增加对应页面。示例数据访问集中于 `site/repository.js`。

可以从 `/#/workshop` 进入 Workshop，再从 `/#/workshop/projects` 打开 `/#/workshop/projects/plan`。面包屑和浏览器返回键都可返回上一级。GitHub 公开仓库仅用于示例代码和文档，运行所需的真实数据与凭据由未来受控环境提供。
