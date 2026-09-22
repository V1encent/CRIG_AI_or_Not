# 改动记录

格式：`## YYYY-MM-DD — 标题`，下面列**改了设计**的部分（纯实现细节不必记）。
设计层面的改动要同时更新 `DESIGN.md`。

---

## 2026-09-22 — 修好四个阻断缺陷：从"只有一个首页"到能玩通一整局

### 现象

「只能看到一个首页，不能进行实际的 AI 选择」「点击鼠标还是不能玩」——
而 `node tests/run.js` **163 项全绿**，`?autoplay` 也能跑完一局。

**测试全绿和"人能玩"之间隔着一整层，那一层没有任何测试覆盖。**

### 四个缺陷

**① `.attract` 永远盖在整个应用之上（唯一的真阻断项）**

`components.css` 的 `.attract` 写了 `display: flex`，优先级 (0,1,0) 与
`base.css` 的 `.screen { display: none }` **完全相同**，而 components.css 后加载
⇒ 平局时它赢。于是 attract 屏无视 `body[data-screen]` 恒为可见。

而它不是一块普通的屏：`position:fixed; inset:0; z-index:50` ＋不透明背景
＝ 一块永远覆盖全屏的面板。菜单和答题屏在底下**正常渲染**，
`body[data-screen]` 也**正常变化**——所以 `--dump-dom` 查不出来，
autoplay 更是直接调函数、根本不看屏幕。玩家却一个像素都看不到，点击全被它吃掉。

改：`.attract` 只管"长什么样"，显隐还给 `.screen` 与 `body[data-screen]`。

**② 事件委托永远不检查 root 自己**

`while (t && t !== root)`——attract 屏的"整屏点击"就挂在 `<section>` 自己身上，
而那一屏几乎整页空白，点空白处时 `ev.target` 正是 section 本身。
于是**只有点在文字上才有反应**。

改：走到 root 再停，且**先判匹配**。两个方向都有回归测试钉住
（`tests/test.dom.events.js`）：漏掉 root 是 bug，越过 root 往上找是"修过头"。

**③ `[hidden]` 属性被作者样式静默盖掉**

浏览器默认的 `[hidden] { display:none }` 来自 **UA 样式表**，
优先级低于**任何**作者样式。`.chip { display: inline-flex }` 一写，
`#demo-flag` 与 `#reset-chip` 的 `hidden` 就全部失效。

后果不只是难看：`demo-flag` 的文案是"演示模式：这些是测试图片，不是真实谜题"，
而库里明明有 7 道真题——**横幅在骗人**，很可能正是"网页里只有占位图"这个印象的来源。

§12.4 早就记过 `.loupe` 的同类问题，但当时只当成本组件的坑。
这次用一条全局规则钉死：`[hidden] { display: none !important; }`。

**④ 答题屏比视口高，把「下一题」推出屏幕**

这条查得最久，因为**最初的假设是错的**。

量到按钮在 y=935、视口 900，而 `position: sticky` 明明已经生效——
把动画关掉、`transform` 也清成 `none`，位置纹丝不动。一度以为
是 `aon-panel-up` 残留的 `transform` 破坏了 sticky。

真相是：**sticky 一直是好的**。它的参照系是滚动容器 `.teach-wrap`（y 625–1039），
按钮忠实地贴在容器底边上——**而那条底边本身在视口外**。
若 sticky 真没生效，按钮会在 y=1543。

根因在更上层：`.screen` 用的是 `min-height: 100vh`，内容超出时它**跟着长高**
而不是让子元素收缩。1440×900 下板子 451 ＋面板 414 ＋头部 = **1071px**。
flex 容器没有确定高度，就**没有"可分配空间"这个概念**，
`.board` 上的 `flex: 1 1 auto` 连同它的 `min-height: 0` 全都无从发挥。

改三处：

- 答题屏 `height: 100dvh`（配 `overflow-y:auto` 兜底）→ 恰好一屏，文档永不滚
- `.board { min-height: min(34vh, 280px) }` → 极矮视口下不会被压成 0（那是完全没法玩）
- `.teach-wrap` 可收缩（`flex-shrink: 4`，板子优先）＋下限 `max(152px, 26vh)`
  —— 152px 是 sticky 按钮自己(104)＋面板内边距(48)，再矮按钮就被裁一截

**板子优先**的理由是不对称的：面板本来就能滚、按钮是 sticky 的，矮一点只是多滚两下；
板子被压扁是直接看不清图，那才是真的玩不了。

### 验收

CDP 派发**真实鼠标事件**（`Input.dispatchMouseEvent`）从 `file://` 跑完整一局：
**16/16 通过**，含答满 5 题、到达总结屏、「再来一局」。8 个视口尺寸（1440×900 到
740×360）全部满足"文档不滚、按钮可点、板子可见"。`node tests/run.js` 163/163，
浏览器 `tests/run.html` 176/176，`python tools/verify_assets.py` exit 0。

### 一条方法论

这一整类缺陷（**输入层、CSS 布局层**）对既有测试是**结构性不可见**的：
`?autoplay` 直接调 `startSession()`/`onTimeout()`/`goNext()`，从不派发点击；
`--dump-dom` 只看 `body[data-screen]`，而那个属性一直是对的。

新增的 `tests/test.dom.events.js` 补上了事件委托那一层（7 例，已确认在旧代码上会红）。
但样式层这三条仍然只能靠真实浏览器验收——`tools/smoke.mjs` 待定，见 README。

---

## 2026-09-22 — p001 的教学文案重写：把没核实的破绽拿掉

### 为什么

p001 的讲解里有**两处我编造/推断的话**，是逐张放大核对图片时发现的：

1. ❌ 「画面里没有粉色灯」——**假的**。AI 图天花板上明明有品红色灯管，
   地板上也有对应的粉色反光。这句直接删掉。
2. ❌ 地板格栅那段（"同一距离上尺寸不同"）——**从未验证成功**。
   量了四次，第一次把整条暗带当成格栅，第二次裁到了瓷砖网格上，
   始终没得到可信的结论。**没核实的东西不能进教学文案。**

`realNote` 里还有一处细节错误：原文说"机柜、线缆和**地板砖**透视一致"，
而那张真图（`1.webp`）里根本没有地板，只有机柜和线缆。

### 改了什么

`cue` 从 `perspective` 改成 **`text`**，`tellRegion` 从地板移到屏幕图表区。

现在的破绽是 5 倍放大直接看到的、可复核的：大屏上
`Epoch 742/10000`、`Accuracy 98.7%` 这些大字清晰可读，而两个图表的
**坐标轴标签全是无法辨认的糊块**——不是字母也不是数字。

这带来一条更好的可迁移规则：*AI 写得好大字，小字只是装饰；
永远去放大画面里最小的文字*。原来的规则（"找重复图案检查重复是否成立"）
指向的破绽我自己都没找到，教不了别人。

### 一个必须记住的教训

**这道题的 `verifiedSolution=true` 曾经是假的。** 我"找到了一个破绽"，
写进了教学文案，跑通了全部校验——而它是错的。流水线抓不到这个：
难度对、授权齐、教学字段齐全、163 项测试全绿、答案键对账通过。

`tests/` 能保证**结构**正确，保证不了**内容为真**。这就是为什么
`verifiedBy` 必须由人签字，也是为什么它现在还带着 `UNCONFIRMED` 前缀。
**剩下 6 道题的讲解同样只经过了工具目视核验，没有第二双眼睛看过。**

---

## 2026-09-22 — 阶段 5：内容流水线跑通，7 道真题进库

### 做了什么

- 新增 `tools/`：`seed_deck_content.py`（一次性引导）、`make_webp.py`、
  `gen_manifest.py`、`verify_assets.py`。`data/crops.json` 作为裁剪凭证落盘。
- 源 deck 的 slides 2–8 变成 **p001–p007**，14 张 WebP 落盘，共 1.0 MB。
- `node tests/run.js` → **163/163 通过**；`python tools/verify_assets.py` → exit 0。

### 改了三处设计

**1. 授权闸门从"三项全要"改成按 `scope` 与 `humanMaterial` 分别适用。**

旧规则是"凡是 `kind=photo/microscopy` 就必须 `permits.web`+`permits.publicDisplay`+
`permits.derivatives` 全为真，且 `ethicsCleared=true`"。这有两个后果，都是错的：

- 它逼着每一张实验照片谎称"人体材料已获伦理批准"，而 `schema.md` 写的是
  「人体组织/病理材料必须为 true」。**一个对所有人都恒为 true 的字段不再传递信息**，
  真正需要它的人体材料题反而没人查。
- 源 deck 的 7 张真图既没有公网授权也没有伦理批件，按旧规则**一道题都上不了场**。

现在：`publicDisplay` 与 `derivatives` 总是必需（我们确实要放它、要改它）；
`permitsWeb` 只在 `scope` 含 web 时必需；`ethicsCleared` 只在 `humanMaterial=true` 时检查。
缺 `scope` 按"需要公网"处理（fail closed）。全部 7 道题 `scope=kiosk`。

`scope`（在哪能用）与 `permit`（能不能用）是正交的两件事，这个区分是对现实的准确记录，
不是漏洞：这批图**现场公屏展示过**，所以 `permitsPublicDisplay=true`；
**公网托管没确认**，所以 `permitsWeb=false`。

**2. 运行时按 `mode` 过滤 `scope`。**

`compose.js` 的 `servable()` 与 `build()` 接受 `mode`，`main.js` 传入解析后的模式。
少了这一道，kiosk-only 的图会跟着上公网——构建期拦一次不够，因为同一份
`manifest.js` 会被两种场合加载。`build()` 多返回一个 `outOfScopeCount`，
好让"web 版怎么一道真题都没有"能一眼诊断（那通常是授权问题，不是 bug）。

**3. `verifiedBy` 以 `UNCONFIRMED` 开头 = 可玩但不可发布。**

答案键是工具目视核验出来的，不是 CRIG 的人签的字。若因此把题降为 `review`，
那"先用 deck 的图把版本做出来"就没法玩了。所以：题照常 served，
`manifest.js` 挂 `meta.provisional=true`，`gen_manifest.py` 结尾大声点名，
`verify_assets.py --release` 会因此失败。

### 抓到的 bug（记下来，因为它差点静默上线）

**答案键整体标反。** `make_webp.py` 把 AI 图放在编号为 `aiSlot` 的槽位
（`plan[slot if kind=="ai" else 3-slot]`），而 `gen_manifest.py` 把 `isAI` 标到了
另一侧（写成了 `slot != 1` / `slot == 1`）。**14 张图全部标错**，
游戏会理直气壮地告诉玩家"真照片是 AI"，而 manifest 里看不出任何异常——
难度对、教学齐全、授权齐备、`validate` 全绿。

这类 bug 的可怕之处在于它不需要任何错误输入就能存在。所以现在有三道防线：

| 防线 | 在哪 | 抓什么 |
|---|---|---|
| 主防线 | `gen_manifest.py` 逐张与 `crops.json` 的 `kind` 对账 → `answer-key-inverted` | 生成逻辑写反了 |
| 第二道 | `verify_assets.py` 重新对账一次 | `manifest.js` 是旧的、`crops.json` 是新的 |
| 回归 | `tests/test.manifest.js` | 生成物本身不合规、不可玩 |

三道都**实测过会失败**（故意写反 → 确认报错 → 还原）。

### 其它修正

- `to_post_crop()` 取错了裁剪记录的那一侧（`source`/`cropBox` 在 `rec.images[n]`
  里，不在 record 顶层），且 `box` 的键大小写与调用方不一致。两个 bug 互相掩盖：
  第一个让函数提前 return，第二个永远没被执行到。现在 `tellRegion` 明确约定为
  **AI 图那一侧**的源图坐标。
- `data/manifest.js` 改成 UMD 式收尾（`})(typeof window !== 'undefined' ? window : globalThis);`），
  与 `js/` 下所有模块统一。**代价是零，收益是它能在 Node 里被求值**，
  于是"生成的题库真的能通过 validate"成了一条自动化测试。
- `make_webp.py` 的 `info["out"]` 键名与输出路径相撞，尺寸被路径字符串覆盖
  （打印出 `px0`）。改名 `outFile`。
- `gen_manifest.py` 的 `tags` 曾经拿 `notes` 去 `split('|')`，拆出来的"标签"
  是一整句话，会显示在界面上。改成只读 `tags` 列。
- `placeholder.js` 的占位真图 `ethicsCleared: true` → `null` + `humanMaterial: false`，
  与新语义一致。
- 测试里那两条编码旧规则的用例已按新规则重写，并补了 `scope` / `humanMaterial` 的覆盖。

### 一个报告项，不是阻断项：两侧体积比

7 组里 6 组的 AI 侧比真图侧大 1.40–2.84 倍。原因不是格式泄露（两侧同一份
`WEBP_OPTS` 编出来），而是**降采样倍数不同**：真图 3713×2475 → 1200×800 缩了 3.09 倍，
颗粒被平均掉、压得很好；AI 图 1526×1024 只缩 1.27 倍，高频纹理基本原样保留。

**为什么不修**：① 它在游戏里看不见——两张卡同宽高比、同像素尺寸，页面上没有任何
位置能读出字节数（原计划里格式/分辨率/EXIF 三条是真泄露，因为前两条会改变卡片在
屏幕上的样子）；② 要压平它只能给两侧配不同的 `quality`，那正好违反"一对图用完全
相同的编码参数"这条原则——用一个看不见的泄露去换一个看得见的泄露；③ 能被 Network
面板利用的人本来就能直接读 `window.PUZZLES` 里的 `isAI`。

所以 `make_webp.py` 把数值记进 `crops.json`，超阈值时在报告里点名，但不失败。
理由写在脚本里，谁要"修"它先读那三条。

### 阶段状态

- **能玩**：kiosk 模式 37 道池 → 27 道可用（7 真题 + 20 占位题）。
- **web 模式 0 道真题**，7 道被 `scope` 正确挡掉。这是**授权状态的真实反映**，
  不是 bug。要让公网版有真题，需要先拿到公网授权。
- **hard 档是空的。** 7 道真题全部算作 `medium`（三轴加权 0.3625–0.5125），
  占位题又被诚实护栏挡在 hard 之外（`verifiedSolution: false`）。
  这不是评分 bug，是内容现状：做出一道 hard 题需要
  「真图 + 刻意的降质」或「毫无显式缺陷的 AI 图」，两者现有素材都没有。

---

## 2026-09-22 — 项目建立

### 背景核实（对源 deck 的实测结论）

- 拆包 `20260917_CRIG_Ontdekt_AIorNot.pptx`：**14 页、19 张图、6 个英文词**。
  没有规则、计分、难度分级、讲解页、备注——现有玩法全靠主持人现场口头讲。
- **7 组图对全部是 PNG(AI) 在左、JPEG(真) 在右。** 依据 `<a:off x>` 坐标排序得出。
  （最初曾据 rel 顺序推断"图序不一致"，**该说法已作废**——rel 顺序不等于视觉位置。）
  → **后果：现有 deck 可被"永远选左边"一条规则通关。**
- AI 图约 1526×1024；真图约 3713×2475（slide 2 例外，3543×2362）。格式与分辨率双重泄露。
- slide 2 两侧宽高比差 14%（1.5000 vs 1.3123）——尺寸差本身是提示。
- 仅 `image1.jpg` 带 EXIF（Canon EOS 5DS R / Photoshop CS6 / 2017-01-12）；
  **GPS IFD 存在但只有 `GPSVersionID`，无实际经纬度**（是元数据泄露，不是位置泄露）。
  其余 6 张真图 EXIF 为 0 条。
- 答案键不在文件中，只能反推。
- `zipfile.ZipFile()` 报 `PermissionError` 的成因已定位：OneDrive 持有 **delete-share 锁**，
  而 CPython 的 `open()`（`_SH_DENYNO`）不申请 `FILE_SHARE_DELETE`。
  解法：`CreateFileW(..., share=7)` / `unzip -p` / 先拷贝。

### 确立的设计

- **硬性要求：出题必须随机左右。** 由上面的位置规律直接推出，在 `selector.js` 层强制，
  不交给渲染层（否则改 UI 就会把它改没）。
- **难度 = 三条独立轴**（`tells` / `subject` / `postprocessing`），加权合成分数再分档。
  权重放 `config.js`，调曲线不碰题库。两条轴可互相抵消 → 单一 `hard` 标签表达不了。
- **内容三流模型**：`real.csv` / `ai.csv` / `pairs.csv` → join → `manifest.js`。
  `ai.derivedFromRealId` 反向引用使"配错半边"可被检测。
  两路内容可不对称到达（半成品合法存在但不被 served）。
  **一张真图可派生多道题**——研究者供图稀缺，这是内容量的乘数。
- **抽题去重按 `realId`**，不按 `puzzleId`（否则同一张真照片会在一局里出现两次，且泄露答案）。
- **图片统一重编码是修 bug 不是美化**：堵住格式 / 分辨率 / EXIF 三条独立作弊路径，
  并统一宽高比。这同时就是难度轴③。
- **生物医学题材的破绽判据必须是逻辑而非专业知识**——否则外行玩家在抛硬币，
  答错但学不到东西，比答对更糟。
- **研究者供图的伦理闸门**：`permits.{web, publicDisplay, derivatives}` 三项分开记，
  人体材料另需 `ethicsCleared`。缺一项就不能达到 `status:"ready"`。
- **作答限时 20 秒只作用于作答**，揭晓即停，教学面板不限时。
  否则"每题都教学"会被 20 秒吃掉。用扁平进度条而非倒数数字。
- **揭晓不做翻牌**（镜像照片无法阅读，会毁掉教学时刻），改用色块 + 徽标 + 聚焦。
- **`tellRegion` 自动聚焦**是价值最高的功能：把"信我，手画错了"变成"你看这只手"。
- **占位图必须带真实可控的破绽**，否则难度分档无法测。
  `tells:5` 时占位图并非真的可解 → 生成器最高只到 `tells:3` 并标 `verifiedSolution:false`。
- **否决**在清单里混淆答案键（加盐哈希会静默使人工核验过的 `isAI` 失效，
  把数据完整性问题变成密码学问题）。这是个诚实的游戏，不是安全游戏。

### 技术形态（由 `file://` 倒推，非偏好）

- 纯静态、零依赖、零构建、无框架。
- 不能用 ES modules / `fetch()` 本地 JSON / `@font-face` / 直接读写 `localStorage`——
  四者在 `file://` 下分别被 CORS 拦或不可靠。
- 纯逻辑模块用 UMD 式收尾（挂 `window` 或 `globalThis`），使浏览器与 Node 双跑、可 headless 测试。

### 结构要求（用户提出）

> 「在结构上要能够区分后续引入的实际图片和对应的 AI 图片」

→ 落成 §4 的三流模型与 `derivedFromRealId` 反向引用。见上。

### 交付

- `DESIGN.md` / `README.md` / `CHANGELOG.md` 建立（文档从第一天起，不是最后补）。
- 阶段 0–1：可运行骨架 + 三轴难度系统 + 占位图生成器 + 测试。

---

## 2026-09-22 — 阶段 2–4：引擎、UI、展台，全流程跑通

**这一版是可以双击打开玩完整一局的。**

### 新增能力

- **引擎**：带种子的抽题（`mulberry32`）、按 `realId` 去重、左右随机 + 同侧连续上限、
  档位池自动放宽、自适应升降档、计分与连击。`selector` / `scoring` / `machine` 全部有测试。
- **UI**：菜单 → 作答（20 秒限时条）→ 揭晓 → 每题教学 → 总结，五个屏一次做完。
  含破绽区域自动聚焦放大、全屏查看浮层（拖拽 / 双指缩放 / 双击 / 桌面端悬停放大镜）。
- **展台**：空闲回 attract、局中倒计时后清场、会话清除、WebAudio 合成音效（零素材，默认静音）。
- **启动器**：`kiosk.bat`（Chrome `--kiosk`）、`serve.bat`（本地 http）。

### 设计层面的改动

- **★ 揭晓改用两个独立通道。** 原计划把"真相"和"玩家选了什么"都表达在卡片描边上。
  实现时发现两者会**互相覆盖**——玩家选错时，"错"就只剩颜色可看，而颜色是四条通道里
  最不可靠的一条。改为：**外框 `border` = 真相**（AI 粗实线 / 真图细虚线），
  **内缩 `outline` = 玩家选择**（蓝环 + 白垫圈）。看一眼就能读出四种组合。
- **★ 徽标在揭晓时才创建，不是提前写好再隐藏。** 理由是反过来的：
  `display:none` 的元素仍然能被 DevTools、读屏和 CSS 选择器找到——
  "藏在 DOM 里"和"不在 DOM 里"在追查泄露时是两件事。
- **卡片结构改为 `.card-slot` 套 `.card`。** 卡片本身是 `<button>`，而放大按钮也是
  `<button>`，**按钮里不能套按钮**（非法 HTML，浏览器会把内层拆出去，焦点顺序崩坏）。
  两者改成兄弟，放大按钮绝对定位浮在右上角。
- **「下一题」在 DOM 里排第一、视觉上排最后**（`.teach .btn-next { order: 99 }`）。
  Tab 序与视觉位置在这里是两件必须分开的事。
- **放大镜的可见性用内联 `display` 控制**，不用 `hidden` 属性也不用 class：
  `hidden` 会被 `.loupe { display:block }` 这条类规则盖掉，而 class 切换又得跟
  `@media (hover:hover)` 打架。三者互相覆盖是这个组件最容易出的 bug。
- **五个 UI 屏合并进一个 `js/ui.js`。** 它们共用同一个 `app` 对象和同一组 DOM 引用，
  拆成五个文件只增加一层间接、不增加清晰度。
- **模式必须能在 http 下测**（`?mode=kiosk` 覆盖协议推断）。
  否则所有展台行为（空闲重置、清场、自动前进）在开发机上永远测不到，
  只能等活动当天在现场发现。
- **题池的不变量：池里的每一道题都是我们愿意端出去的。** 校验不过的题直接出池，
  而不是留在池里靠后面各处的判断去挡——挡漏一次，玩家就会看到一道没有讲解的题。
- **`hard-unverified` 在警告里单独点名**，因为它**不是缺陷**：占位图的 `tells` 最高只到 3，
  够不到 hard，而 hard 池按设计只接受人工确认过可解的题。混在一起报会让人去修一个没坏的东西。

### 修掉的问题

| 问题 | 成因 |
|---|---|
| 启动即崩在错误屏 | 重写 `app` 对象字面量时漏掉 `el: {}` |
| 「再来一局」渲染上一局的最后一题 | `AGAIN` 立刻切屏，但那一刻 session 还是旧的；改为先备好新 session 与新牌堆再发事件 |
| 总结屏会自己跳题 | 教学页的自动前进定时器跨屏泄漏；改为进入任何屏时先取消 |
| `?autoplay` 绕过结算与播报 | 原实现直接发 `TIMEOUT`，改为走 `onTimeout()` |
| 放大后聚焦环指向错的地方 | 环没有跟着图一起被 transform —— **这比不指还糟**，它让人确信自己看错了位置 |

### ★ 一个只在实测里才会暴露的坑（已修，值得记）

`kiosk.bat` 最初写成 `cd` 到脚本目录 + 传相对路径 `index.html`。
**实测不成立**：Chrome 把命令行上的相对路径当成搜索词，打开的是一张错误页，
**而退出码仍是 0**。展会当天会表现为"双击了，出来个空白页"，且没有任何错误信息。

改为拼绝对 `file://` URL（反斜杠换斜杠；路径里的空格**不需要**转义，实测 Chrome 接受原样空格），
并已用 `kiosk.bat` 的真实逻辑跑通、确认落在 `data-mode="kiosk" data-screen="attract"`。

### 又发现并修掉的三个问题（在写文档、核对文档与代码是否一致时）

| 问题 | 成因 | 性质 |
|---|---|---|
| **`tests/run.html` 与 `tests/run.js` 漂移** | `run.js` 加了 `modes` 与 `answer-reveal`，`run.html` 没跟上 | ★ 那一批用例在浏览器里**根本没执行**，页面却显示全绿 |
| **`?audit` 绕过被测试的解析器** | 它是唯一一个在 `main.js` 里直接读的 dev 开关，没进 `devOptions` | 恰恰是守"答案不进 DOM"的那个开关，最该被测 |
| **README 承诺了不存在的命令** | `tools/` 是空目录，README 却写着 `python tools/gen_manifest.py` | 文档说了假话，比没有文档更糟 |

对策：
- `devOptions` 增加 `audit`（三态：没写 / 开 / 明确关掉），并补测试。全部 dev 开关走同一个解析器。
- `run.js` 跳过 `test.dom.*` 并**把跳过的文件名打出来**——
  否则"Node 全绿"会被误读成"全都测过了"，而实际上一整类用例没跑。
- README 里给 `tools/` 与尚未存在的文件加上明确的"尚未开工"标记。

### ★ 守卫自己也被测了

`audit()` 是"揭晓前活 DOM 里没有任何东西指明哪张是 AI"这条最重要规则的机器化检查。

**一个从不触发的守卫比没有守卫更糟**——它给人虚假的安全感，还占着"这条已经查过了"的位置。
所以新建 `tests/test.dom.answer-reveal.js`，拿真实的 DOM 验证守卫**真的会响**：

- 七个泄露属性逐一注入 → 全部抓住
- 六个泄露类名 → 全部抓住；子串（`painted` 里的 `ai`）**不误报**
- `data-slot` / `data-zoom` / `card-slot` / `zoom-btn` 是槽位不是身份 → **不误报**
  （误报同样要防：噪音会让真泄露被忽略）
- 用一道"两张都是 AI"的坏题验证 `buildSlot` 不会顺手把 `isAI` 抄进 DOM

命名约定 `.dom.` 表示"要 `document`"，只在 `run.html` 里跑。

### 实测状态

- `node tests/run.js` → **148/148 通过**（9 个测试文件）。
- `tests/run.html` → **154/154 通过**（多出的 6 项是 `test.dom.*`）。
- `file://` 下 boot → `data-mode="kiosk" data-screen="attract"`，无控制台错误。
- `?autoplay=12&seed=12345` 无人值守从磁盘跑完 **attract → menu → 5 轮 → 总结**，
  总结屏内容完整（得分、段位、线索回顾、两个按钮）。超时不计分，0/5 正确——这是对的。
- `kiosk.bat` 的**真实逻辑**（浏览器查找 + URL 构造）跑通，落在
  `data-mode="kiosk" data-screen="attract"`。

### 刻意推迟

- `js/share.js`（Web Share，`file://` 下不存在）、`sw.js`、`manifest.webmanifest`。
- `tests/test.compose.js`（`compose.js` 目前没有测试）。
- `tools/` 全部脚本（阶段 5）。**目录现在是空的，README 已标明。**
