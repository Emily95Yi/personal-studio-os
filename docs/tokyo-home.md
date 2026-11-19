# 一期一会 inTokyo 首页

沿用 Studio 的原生 JavaScript、CSS、Hash Router。入口为 `/#/public/yiqiyihui`，Studio Home 的一期一会入口在新标签页打开，保留原管理标签页供管理员来回切换。公开页面没有返回 Studio 的链接或隐藏的管理入口。Activities 显示同一份活动展览；导航为纯文字「活动／手记／互动」，后两项进入各自的待建设页面。页脚小红书图标的账号地址在 `tokyoCopy.contactUrl` 补充。

本次动态画廊与叠放工具卡只接入首页，Activities 保留原静态海报展览。Hero、募集区和 Footer 继续使用原组件，Cloudflare / R2 存储与同步机制未修改。

## 文件与配置

- `site/tokyo-view.js`：Hero、募集区、往期画廊、聚焦详情、Footer；`tokyoCopy` 集中配置主标题、副标题和联系地址。
- `site/tokyo-gallery.js`：往期公开活动按日期倒序筛选，以及有界、可逆的列间位移和卡片深度计算。不修改 Workshop 的 Event 顺序。
- `site/tokyo-experiences.js`：四张体验卡片的默认公开文案、配色、真实图片配置和渲染；只在首页出现。
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

活动仍来自现有云端 Studio snapshot，但公开页面通过经过原有 Access 鉴权的只读 `GET /api/studio/posters` 获取字段白名单投影，不再向浏览器传输整个私有 snapshot。`site/public-posters.js` 独立管理加载、错误重试和 revision 增量检查；进入私有管理页才初始化完整 Studio 同步。真实快照验收中，首次传输从 83,318,775 字节减少为 7,708,525 字节（两张原始海报），无变化时返回 204。加载中和加载失败不会再误报为「暂无公开海报」。静态本地预览在接口返回 404 时继续使用 IndexedDB。新联动使用 Event 的募集中／已结束状态与海报作为仅海报的公开条件，`tokyoPosterHidden` 可明确关闭；兼容原有 `visibility: public`，或明确的 `publication.status: published` / `workshopPublication.status: published`。草稿、撤回、删除、归档及其他品牌均排除。现有 `workshopPublication.preview` 只是私有预览，绝不据此公开活动。

旧发布投影字段仅限活动 ID、标题、日期／时间、地点、公开简介（`publicDescription`，其次 `description` / `theme`）、海报和真实报名 URL。不会读取 Project 文档、主持稿、参与者、现场记录等私有信息。海报复用 `coverAssetId` 指向的已有图片，或 `posterUrl` / `coverUrl`。

明确的 `open` / `recruiting` / `registration_open` 优先，其他活动按日期倒序。活动日期已过、报名截止时间已过或活动取消时，不显示“正在募集中”；`planned` 不自动等同于募集中。日期按东京时区判断。主推海报作为展览第一张，其余海报继续拼贴，第一张不重复。

Workshop Event 的「状态」继续决定公开海报分区。有海报且状态为「募集中」时进入募集区；「往期回顾」仅展示已结束的公开活动，排除募集中、未来待举办和已取消活动。无募集活动时保留原有居中提示。兼容旧记录中缺少或为空的 `tokyoPosterStatus`，也不会让旧公开选项覆盖正在保存的 Event 状态。「隐藏此海报（不在公开页展示）」仍为独立退出开关。已经明确公开的活动缺少海报时显示占位卡；没有海报且未明确公开的内部 Event 不会因此被公开。详情复用原来的弹层，展示已有公开标题、日期及简介；状态联动的仅海报活动只接受明确的 `publicDescription`，绝不退回私有 `description`、主持稿、流程、资源或记录。所有读取仍经由原有投影，不迁移或批量改写生产记录。

往期画廊居中、最大宽度 1240px，桌面和平板三列，640px 以下两列。海报保留原始比例和 contain 展示，列间留白、起始高度错开，滚动进度驱动不同方向与幅度的 `translate3d`，上滚自然逆向。没有无限循环、随机排列、重复活动或第二份手机海报。Hover 只变换当前按钮，列和相邻海报保持稳定；缺图／失效提供可点击的占位。

画廊之后是「活动体验与工具」。四张卡片共享 Sticky 父容器，桌面约 40% 文字与 60% 图片，手机上图下文。每张卡停靠位置递增 12–16px，后卡从下方覆盖，前卡轻微缩小、上移并改变阴影；最后一张之后由正常文档流释放到原 Footer。动画与页面滚动直接关联，没有内部滚动、自动播放或下一张按钮。RAF 合并滚动回调，几何读取先于样式写入，ResizeObserver 处理图片／布局变化，卸载清理全部监听。短视口或放大字体导致内容装不下时自动使用正常文档流，减少动态效果时展示静态错位画廊与四张展开的卡片。

四个图片槽位目前为空，使用明确标注「真实工具照片待补」的占位图形，不生成或冒充活动现场。编辑 `site/tokyo-experiences.js` 中每张卡的 `image.src`、`alt`、`width`、`height`、`fit` 即可替换；建议把真实照片放在 `site/`，例如 `./tokyo-oh-cards.jpg`，也支持 HTTPS 地址。`fit` 可设为 `cover` 或 `contain`。本地预览已支持 JPG / PNG / WebP / AVIF。建议补充：OH卡／观系图卡桌面实拍、蜕变游戏布局、涂鸦／编织创作、神谕卡／诗歌卡与手写笔记，各一张。不会自动读取私有 Workshop 资源。

默认关闭 Demo 回退；无已勾选的海报时显示真实空状态。`showDemo: true` 仍可在独立验收中使用演示素材。Event 默认阅读模式隐藏编辑器；点击基础信息编辑、内容编辑或添加动作才显示输入框，保存或取消后收起，未提交草稿保留现有保护。

公开页切回标签页或每 30 秒通过海报投影接口检查 revision；本地预览重新读取 IndexedDB，以同步其他 Workshop 标签页的保存结果。左上角图标略缩小、副标题增大一号，主推海报不再显示序号。

Worker 的既有 Access 与云端权限不变；此改造不把私有 Studio 服务变成匿名公共服务，也不改变生产部署配置。

Workshop 保存使用现有 R2 中的轻量目录校验增量，在不可变基础快照上追加本次修改，不在每次状态保存时读取或重写原始图片。revision、编辑锁、幂等保存回执及 Capture 投影仍由现有 D1 事务控制。完整读取兼容旧快照和新增的分层版本；清理旧版本时保留当前及上一版本仍引用的基础快照和增量。无需数据库迁移。选项控件为 15px，radio 不再继承普通输入框的满宽和 40px 高度。

独立域名正式上线时，公开前台应接入只读的发布内容入口，私有 Studio 继续保留现有登录鉴权。管理员可将两个地址分别加入书签，或从 Studio 的新标签页入口进入公开站。本轮只调整页面与预览切换，不绑定域名、不开放私有接口。精简后的当前页面截图为 `deliverables/yiqiyihui-home/public-preview.jpg`。

## 降级与兼容

Hero 使用稳定的 `100svh` 避免手机地址栏变化导致跳动；品牌标题缩小，桌面为约 30% 视口宽度、位于左下方，手机位于中间偏上并保留字形可读性。悬浮菜单始终只有文字，无底板、边框或模糊背景。海报使用 `dvh` 和 safe-area。画廊小屏两列、其他尺寸三列。图片完整 contain；手机主推／聚焦区约 67dvh，桌面约 50vh，受可用宽度与原始图片比例约束。弹层固定 body 并恢复原 scrollY，阻止背景回弹；支持关闭图标、背景、Escape、海报上的 80px 下滑手势，详情文本保留独立的自然滚动。

Shader 只在 Hero 可见且文档前台时运行；小屏 DPR 上限 1，大屏 1.5，渲染约 140 万像素上限。无 WebGL、编译失败或上下文丢失时保留静态浅蓝粉紫渐变。减少动态效果设置下 Shader 固定为静帧，入场／共享元素／平滑滚动动画关闭。路由卸载会取消 RAF、移除监听器、释放 WebGL 与滚动锁。

交互依赖现代浏览器的 `<dialog>`、Web Animations、IntersectionObserver、ResizeObserver、CSS Grid、`svh` / `dvh` 和 `inert`。不带 backdrop-filter 的浏览器仍可读取详情，但背景模糊较弱。系统没有圆体时使用无衬线回退。

## 验收

2026-11-19 滚动交互升级：本地 `npm test` 85 项通过。使用隔离的既有 DEMO 海报，加载真实应用入口与相同生产 CSP，检查 1440×900、390×844、375×667、768×1024 视口。已确认三／两列切换、列间不同位移、无横向溢出、缺图占位、海报 contain 聚焦、关闭／Escape、滚动与焦点恢复、四张真正覆盖堆叠、上滚逆向展开及 Footer 释放。截图在 `deliverables/tokyo-scroll-upgrade/`，其中 DEMO 只用于验收，不写入生产数据。已实现并检查 reduced-motion 静态路径；浏览器工具没有系统媒体偏好和真实触摸设备模拟，尚未进行系统减少动态效果切换、实体 iPhone / Safari 手势测试。云端地址访问被自动审批拒绝，未做本轮在线数据验收或生产部署。下方为先前版本的历史验收记录。

运行 `npm test`（76 项通过）。本轮浏览器检查覆盖 375、390、430、600、768、1280、1440、1920px；使用八张横／竖 Demo 海报检查不重复的主推、拼贴、详情、FLIP 中间帧、关闭／Escape、下滑退出、焦点和滚动位置恢复。另检查纯文字悬浮导航、手记／互动路由、小红书占位及既有 Worker CSP 下的 SVG 加载和聚焦。前一轮已覆盖 WebGL 禁用、减少动态效果、鼠标扰动、离屏暂停、长简介独立滚动、图片失效和私有入口。

已按用户授权部署到既有 Worker；没有写入生产活动或更改访问控制。

浏览器验收基于 Chrome、响应式视口和触摸输入模拟；未进行实体 iPhone / Safari 验收。最终首屏截图保存在 `deliverables/yiqiyihui-home/`。
