# Personal Studio OS

面向个人积累、创作与发布的可交互 Web Demo。顶部切换 Private Workspace 和 Public Space，页面地址可分享和刷新。

```sh
npm run dev
```

打开 http://127.0.0.1:4181。仅需 Node.js，无第三方依赖。静态托管入口为 `site/`，部署后可直接访问 URL，路由使用 hash。Demo 使用只读示例数据，筛选、关系选择和报名预览仅在当前会话内生效。

- [架构、Sitemap、导航取舍与数据流](docs/architecture.md)
- [交付范围与开发 Roadmap](docs/roadmap.md)

`site/pages.js` 注册空间和页面。新增一条页面注册记录并在 `site/views.js` 增加对应渲染函数，导航会自动更新。公开品牌也可以在同一注册表增加。示例数据访问集中于 `site/repository.js`。
