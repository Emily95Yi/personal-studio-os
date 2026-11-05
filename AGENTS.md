# 奕Studio 维护约定

- 日常修改从最新的 `origin/main` 开始，提交到 `main`。除非用户明确要求，勿创建新的长期分支。
- Cloudflare 使用既有 `yistudio-private` Worker、`奕Studio Private` Access 应用和既有私有数据库。除非用户明确要求，勿另建部署入口。
- 本地预览与自动化测试使用隔离数据。生产部署、生产数据库变更和放宽日历写入范围应先得到用户明确授权。
- Apple 凭据、订阅链接、Worker secrets 和私有部署配置留在仓库之外。
