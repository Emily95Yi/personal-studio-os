# 一期一会 inTokyo 首页

沿用 Studio 的原生 JavaScript、CSS、Hash Router。入口为 `/#/public/yiqiyihui`，Home 的原有一期一会入口可直接进入。Activities 显示同一份活动展览；About 与 Contact 目前明确标为待发布。

## 文件与配置

- `site/tokyo-view.js`：Hero、主推海报、拼贴画廊、聚焦详情、Footer；`tokyoCopy` 集中配置主标题、副标题和联系地址。
- `site/tokyo.css`：独立作用域的响应式视觉。使用本机圆体字体栈，不分发系统字体文件。
- `site/tokyo-liquid.js`：原生 WebGL 1 / GLSL 单 pass 背景；鼠标／触摸位置、速度和平滑衰减影响局部形变。
- `site/tokyo-interactions.js`：一次性入场、紧凑导航、FLIP / Web Animations 海报转场、透视退后、焦点恢复、原位返回、80px 下滑退出。
- `site/public-event-data.js`：唯一的公开活动筛选、排序和字段投影；由现有 `publicRepository.activities()` 调用。
- `site/app.js`、`site/views.js`、`site/index.html`：接入既有渲染、路由卸载清理与样式入口。
- `tests/public-events.test.js`：公开边界、时区／报名状态、排序、安全字段、无重复海报的回归测试。

没有新增运行时依赖、数据库、Worker、匿名 API 或管理模块。

## 数据与当前占位

活动继续来自 `startStudioSync()` / `refreshStudioSync()` 使用的现有云端 Studio snapshot；静态本地预览继续使用 IndexedDB。仅接受 `visibility: public`，或明确的 `publication.status: published` / `workshopPublication.status: published`。显式私有、unlisted、草稿、撤回、删除、归档及其他品牌均排除。现有 `workshopPublication.preview` 只是私有预览，绝不据此公开活动。

公开字段仅限活动 ID、标题、日期／时间、地点、公开简介（`publicDescription`，其次 `description` / `theme`）、海报和真实报名 URL。不会读取 Project 文档、主持稿、参与者、现场记录等私有信息。海报复用 `coverAssetId` 指向的已有图片，或 `posterUrl` / `coverUrl`。

明确的 `open` / `recruiting` / `registration_open` 优先，其他活动按日期倒序。活动日期已过、报名截止时间已过或活动取消时，不显示“正在募集中”；`planned` 不自动等同于募集中。日期按东京时区判断。主推海报作为展览第一张，其余海报继续拼贴，第一张不重复。

现有发布功能尚未配置真实公开入口，正常情况下显示“海报占位”和空画廊；页面没有内置假活动。副标题保留用户要求的 `[副标题占位｜Subtitle Placeholder]`。About 品牌介绍与 Contact 联系地址也待真实内容。浏览器 QA 的测试海报仅存在于隔离浏览器内存，未保存进 IndexedDB 或生产云端。

Worker 的既有 Access 与云端权限不变；此改造不把私有 Studio 服务变成匿名公共服务，也不改变生产部署配置。

## 降级与兼容

Hero 使用稳定的 `100svh` 避免手机地址栏变化导致跳动；海报使用 `dvh` 和 safe-area。小屏约两列，平板三列，桌面错落三到四列，大屏五列。图片完整 contain；手机主推／聚焦区约 67dvh，桌面约 50vh，受可用宽度与原始图片比例约束。

Shader 只在 Hero 可见且文档前台时运行；小屏 DPR 上限 1，大屏 1.5，渲染约 140 万像素上限。无 WebGL、编译失败或上下文丢失时保留静态蓝紫渐变。减少动态效果设置下 Shader 固定为静帧，入场／共享元素／平滑滚动动画关闭。路由卸载会取消 RAF、移除监听器、释放 WebGL 与滚动锁。

交互依赖现代浏览器的 `<dialog>`、Web Animations、IntersectionObserver、ResizeObserver、CSS Grid、`svh` / `dvh` 和 `inert`。不带 backdrop-filter 的浏览器仍可读取详情，但背景模糊较弱。系统没有圆体时使用无衬线回退。

## 验收

运行 `npm test`。浏览器检查覆盖 375、390、430、768、1280、1440、1920px；另用隔离九张长／竖海报检查不重复的主推、拼贴、详情、FLIP 中间帧、关闭／Escape、动画中立即退出、下滑退出、长简介独立滚动、焦点和滚动位置恢复。另检查 WebGL 禁用、减少动态效果、鼠标扰动、离屏暂停、图片失效、导航及私有入口。

没有执行生产部署，也没有写入生产活动。

浏览器验收基于 Chrome、响应式视口和触摸输入模拟；未进行实体 iPhone / Safari 验收。最终首屏截图保存在 `deliverables/yiqiyihui-home/`。
