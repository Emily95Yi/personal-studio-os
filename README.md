# Personal Studio OS

Workshop 以画廊浏览活动系列和海报。Self-Board 将个人内容与行动安排放在同一个桌面。Calendar 提供 Day、Week、Month 视图。

```sh
npm run dev
```

打开 http://127.0.0.1:4181。使用原生 JavaScript、CSS 和 Hash Router。静态托管目录为 `site/`。

- Workshop → Project Detail → Event Detail。Related Resources 与 Events Gallery 同页。
- Self-Board 包含 Discover、Experience、Reflect & Create、SOP & Habits、To-Do 五种 Widget。
- Home 和 Self-Board 都可打开 Calendar。在 Calendar 选择日期后，可新建、编辑和完成演示待办。To-Do 摘要与 Calendar 读取同一份会话数据。
- Habit Focus 的打卡也会显示在 Calendar。SOP 执行预览可逐步推进。

演示项目与活动海报明确标为结构占位。Calendar 和行动交互仅保存在当前页面会话的内存中，刷新会清除。正式数据可通过 Repository 接入经授权的云端 API。

- [信息架构、旧链接兼容与数据边界](docs/architecture.md)
- [后续 Roadmap](docs/roadmap.md)
