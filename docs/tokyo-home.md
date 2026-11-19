# 一期一会 inTokyo 首页

沿用 Studio 的原生 JavaScript、CSS、Hash Router。入口为 `/#/public/yiqiyihui`，Studio Home 的一期一会入口在新标签页打开，保留原管理标签页供管理员来回切换。公开页面没有返回 Studio 的链接或隐藏的管理入口。Activities 显示同一份活动展览；导航为纯文字「活动／手记／互动」，后两项进入各自的待建设页面。页脚小红书图标的账号地址在 `tokyoCopy.contactUrl` 补充。

## 文件与配置

- `site/tokyo-view.js`：Hero、主推海报、拼贴画廊、聚焦详情、Footer；`tokyoCopy` 集中配置主标题、副标题和联系地址。
- `site/tokyo-orbit-logo.svg`：从用户提供的旋流图标描摹得到的透明 SVG 路径，保留灰阶旋臂、环轨与圆点；用于公开页左上角的首页入口，不返回 Studio。海报关闭键为透明背景的叉号，页脚只保留小红书图标。
- `site/tokyo-demo.js`：8 张原创 SVG 演示海报与独立的展示层回退逻辑，包含竖版与横版，不写入任何活动数据。
- `site/tokyo.css`：独立作用域的响应式视觉。使用本机圆体字体栈，不分发系统字体文件。
- `site/tokyo-liquid.js`：原生 WebGL 1 / GLSL 单 pass 背景；低饱和、明亮的彩虹色约每三分钟完成一轮，鼠标／触摸位置、速度和平滑衰减影响局部形变。
- `site/tokyo-interactions.js`：一次性入场、紧凑导航、FLIP / Web Animations 海报转场、透视退后、焦点恢复、原位返回、80px 下滑退出。
- `site/public-event-data.js`：唯一的公开活动筛选、排序和字段投影；由现有 `publicRepository.activities()` 调用。
- `site/app.js`、`site/views.js`、`site/index.html`：接入既有渲染、路由卸载清理与样式入口。
- `tests/public-events.test.js`：公开边界、时区／报名状态、排序、安全字段、无重复海报的回归测试。

没有新增运行时依赖、数据库、Worker、匿名 API 或管理模块。

## 数据与当前占位

活动继续来自 `startStudioSync()` / `refreshStudioSync()` 使用的现有云端 Studio snapshot；静态本地预览继续使用 IndexedDB。新联动优先使用明确勾选的 `tokyoPosterStatus: recruiting / ended` 作为仅海报的公开授权；兼容原有 `visibility: public`，或明确的 `publication.status: published` / `workshopPublication.status: published`。显式私有、unlisted、草稿、撤回、删除、归档及其他品牌均排除。现有 `workshopPublication.preview` 只是私有预览，绝不据此公开活动。

旧发布投影字段仅限活动 ID、标题、日期／时间、地点、公开简介（`publicDescription`，其次 `description` / `theme`）、海报和真实报名 URL。不会读取 Project 文档、主持稿、参与者、现场记录等私有信息。海报复用 `coverAssetId` 指向的已有图片，或 `posterUrl` / `coverUrl`。

明确的 `open` / `recruiting` / `registration_open` 优先，其他活动按日期倒序。活动日期已过、报名截止时间已过或活动取消时，不显示“正在募集中”；`planned` 不自动等同于募集中。日期按东京时区判断。主推海报作为展览第一张，其余海报继续拼贴，第一张不重复。

Workshop Event 的「编辑 Event 基础信息」内提供「一期一会公开海报」单选：不展示／募集中／已结束。上传海报并保存后，`tokyoPosterStatus` 随既有 Studio snapshot 一起保存，不新增数据库或存储。募集中及已结束分别展示，未上传图片、未勾选、草稿、删除或归档的内容不进入公开海报区。取消勾选（不展示）立即撤回此海报。公开海报授权仅作用于海报，不公开活动简介、主持稿、流程、资源与记录；活动标题保留用于无障碍标签和聚焦标题，其余文字之后确定。人工勾选的海报状态优先，不按旧日期自动改组。

默认关闭 Demo 回退；无已勾选的海报时显示真实空状态。`showDemo: true` 仍可在独立验收中使用演示素材。Event 默认阅读模式隐藏编辑器；点击基础信息编辑、内容编辑或添加动作才显示输入框，保存或取消后收起，未提交草稿保留现有保护。

公开页沿用现有云端刷新；本地预览在切回标签页或定期刷新时重新读取 IndexedDB，以同步其他 Workshop 标签页的保存结果。左上角图标略缩小、副标题增大一号，主推海报不再显示序号。

Worker 的既有 Access 与云端权限不变；此改造不把私有 Studio 服务变成匿名公共服务，也不改变生产部署配置。

独立域名正式上线时，公开前台应接入只读的发布内容入口，私有 Studio 继续保留现有登录鉴权。管理员可将两个地址分别加入书签，或从 Studio 的新标签页入口进入公开站。本轮只调整页面与预览切换，不绑定域名、不开放私有接口。精简后的当前页面截图为 `deliverables/yiqiyihui-home/public-preview.jpg`。

## 降级与兼容

Hero 使用稳定的 `100svh` 避免手机地址栏变化导致跳动；品牌标题缩小，桌面为约 30% 视口宽度、位于左下方，手机位于中间偏上并保留字形可读性。悬浮菜单始终只有文字，无底板、边框或模糊背景。海报使用 `dvh` 和 safe-area。小屏约两列，平板三列，桌面错落三到四列，大屏五列。图片完整 contain；手机主推／聚焦区约 67dvh，桌面约 50vh，受可用宽度与原始图片比例约束。

Shader 只在 Hero 可见且文档前台时运行；小屏 DPR 上限 1，大屏 1.5，渲染约 140 万像素上限。无 WebGL、编译失败或上下文丢失时保留静态浅蓝粉紫渐变。减少动态效果设置下 Shader 固定为静帧，入场／共享元素／平滑滚动动画关闭。路由卸载会取消 RAF、移除监听器、释放 WebGL 与滚动锁。

交互依赖现代浏览器的 `<dialog>`、Web Animations、IntersectionObserver、ResizeObserver、CSS Grid、`svh` / `dvh` 和 `inert`。不带 backdrop-filter 的浏览器仍可读取详情，但背景模糊较弱。系统没有圆体时使用无衬线回退。

## 验收

运行 `npm test`（74 项通过）。本轮浏览器检查覆盖 375、390、430、600、768、1280、1440、1920px；使用八张横／竖 Demo 海报检查不重复的主推、拼贴、详情、FLIP 中间帧、关闭／Escape、下滑退出、焦点和滚动位置恢复。另检查纯文字悬浮导航、手记／互动路由、小红书占位及既有 Worker CSP 下的 SVG 加载和聚焦。前一轮已覆盖 WebGL 禁用、减少动态效果、鼠标扰动、离屏暂停、长简介独立滚动、图片失效和私有入口。

没有执行生产部署，也没有写入生产活动。

浏览器验收基于 Chrome、响应式视口和触摸输入模拟；未进行实体 iPhone / Safari 验收。最终首屏截图保存在 `deliverables/yiqiyihui-home/`。
