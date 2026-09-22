# AI or not AI

CRIG Ontdekt 的网页科普游戏：左右两张图，选出哪张是 AI 生成的。
生物医学题材为主，全年龄，每题揭晓后都教一条可识别的破绽。

> 设计意图、技术约束与"为什么这么做" → 见 **[DESIGN.md](DESIGN.md)**
> 改动记录 → 见 **[CHANGELOG.md](CHANGELOG.md)**

---

## 怎么跑

### 展台（离线，推荐）

直接**双击 `index.html`**，或：

```bat
kiosk.bat
```

`kiosk.bat` 用 `--kiosk` 启动 Chrome：无地址栏、无标签页（顺手堵掉"输网址离开游戏"），
并用独立的 `--user-data-dir`，不干扰你自己的 Chrome profile。

> ⚠️ **验收测试就是双击 `index.html`。** 不是 `serve.bat`。
> `file://` 与 `http://` 是两条会分叉的代码路径（service worker、分享、localStorage），
> 两个都要过一遍。

### 本地开发 / 公网

```bat
serve.bat
```

然后打开 http://localhost:8000

### URL 参数

| 参数 | 作用 |
|---|---|
| `?mode=kiosk` / `?mode=web` | 强制模式（默认：`file://` → kiosk，否则 web）**仅开发** |
| `?lang=nl` / `?lang=en` | 强制语言（默认跟随 `navigator.language`，荷兰语优先） |
| `?level=easy`/`medium`/`hard`/`adaptive` | 跳过菜单直接开局 |
| `?placeholder=1` / `?placeholder=0` | 强制全用 / 禁用占位图（**仅开发**） |
| `?seed=12345` | 固定牌堆随机种子（复现 bug 用） |
| `?autoplay=200` | 无人值守连跑 200 轮（浸泡测试用，**仅开发**） |
| `?audit=1` / `?audit=0` | 每轮自检"答案没进 DOM"（传了 `?mode=` 也会默认打开） |

**仅开发**的开关在发布构建里应被剥除——展台不能被乱输入的网址打进占位模式或自检模式。

### 现在能玩到什么程度

**完整一局是可以玩的**：`attract → 菜单 → 5 题（20 秒限时）→ 每题揭晓 + 教学 → 总结 → 再来一局`。
展台行为（空闲回 attract、清场、自动前进）也已就绪。

题库现状（`python tools/verify_assets.py`）：

- **7 道真题**（p001–p007，来自源 deck 的 slides 2–8），14 张 WebP，共 1.0 MB
- 档位全是 `medium`
- 占位图仍在：真题不够时按 `scope` 补齐，`demo-flag` 横幅只在**一道真题都没有**时出现
- ⚠️ **7 道的答案键都还没复核过**（`verifiedBy` 带 `UNCONFIRMED` 前缀）。
  `verify_assets.py --release` 会因此拒绝发布。详见下面「怎么加内容」开头的说明。

> `?placeholder=1` 可以强制回到全占位模式，用来单独检查占位路径。

---

## 怎么加内容

> ✅ **流水线已经跑通了（阶段 5）。** 现在题库里有 **7 道真题**，
> 全部来自源 deck 的 slides 2–8，全部 `scope=kiosk`。
>
> ⚠️ 但这 7 道题的答案键是**工具目视核验**出来的，`verifiedBy` 都带 `UNCONFIRMED` 前缀。
> 它们可以玩、可以评审、可以调难度，**但不可以这样发布**：
> `python tools/verify_assets.py --release` 会因此失败。发布前请人逐组看一遍。

内容分三路进来，各自独立填写，最后 join 成 `data/manifest.js`：

```
data/real.csv    ← 真图（研究者供图）
data/ai.csv      ← AI 图（含 derivedFromRealId 反向引用）
data/pairs.csv   ← 配对：把一张真图和一张 AI 图组成一道题
data/rights.csv  ← 授权证据
```

```bash
python tools/make_webp.py           # 源图 → assets/img/p/<id>/{1,2}.webp
                                    # 顺手写出 data/crops.json（裁剪凭证）
python tools/gen_manifest.py        # 校验 + join → data/manifest.js
python tools/verify_assets.py       # 对产物断言（含"assets/ 下不许有源图"）
node tests/run.js                   # 纯逻辑回归 + 生成物校验
```

`python tools/seed_deck_content.py` 是**一次性引导脚本**，把源 deck 的 7 组图写进
四册 CSV。跑一次就够了——之后 CSV 就是唯一真源，再跑会覆盖它。

### 一道题要达到什么条件才能上线

`gen_manifest.py` 会强制执行，缺任一项就停在 `status:"review"`、永不被 served：

- ✅ `isAI` 有人工核验记录（`verifiedBy` / `verifiedAt`）——**不是从格式推断的**
- ✅ `real.csv` 侧：`permitsPublicDisplay` / `permitsDerivatives` 为真
- ✅ `permitsWeb` 为真 —— **仅当 `scope` 含 web 时**
- ✅ `humanMaterial=true` 时另需 `ethicsCleared` 为真
- ✅ 三轴难度已评（`tells` / `subject` / `postprocessing`，各 1–5）
- ✅ `teaching` 字段齐全（`explanation` / `kidLine` / `rule` 的 nl+en）
- ✅ `tellRegion` 已设且能换算到裁剪后坐标（否则揭晓后无法自动聚焦到破绽）
- ✅ `ai.derivedFromRealId` 与本题配的 `realId` 一致（抓"配错半边"）
- ✅ AI 侧有 `generator`
- ✅ 落到 hard 档时另需 `verifiedSolution` 为真

**`scope` 决定这道题能在哪种场合出现**（`kiosk` / `web` / `both`）。
`compose.js` 在运行期按 `mode` 过滤，所以 `kiosk` 题不会出现在公网版里。

### 一条硬规则

⚠️ **语义化的 id 只活在 CSV 里，落盘的路径必须是中性的。**

`assets/img/p/<puzzleId>/1.webp` 和 `2.webp` —— **绝不能出现 `assets/img/ai/xxx.webp`**。
路径会出现在 URL、DOM 和 DevTools 里，是全套防护中最容易漏、且能绕过其它所有防护的一条。
`verify_assets.py` 会用正则检查这件事。

### 让一张真图产出多道题

研究者供图是稀缺资源。同一张真图可以生成多个 AI 变体（不同 `tells` / `postprocessing`），
在 `pairs.csv` 里写成多行、复用同一个 `realId`，于是一张图撑起 easy 与 hard 两道题。

⚠️ 抽题去重按 `realId` 而非 `puzzleId`——否则同一张真照片会在一局里出现两次，
既显得像 bug，又泄露答案。

---

## 怎么部署到公网

整个 `ai-or-not/` 文件夹就是可部署产物。把它上传到任何静态托管的根目录即可。

```bash
python tools/verify_assets.py    # 必须 exit 0
```

**部署前必须确认**：`assets/` 下不得出现任何 `.pptx` / `.jpg` / `.jpeg` / `.png`。
`verify_assets.py` 会替你检查——这条防的是 38 MB 带 EXIF 的源图被误发布。

---

## 目录

```
ai-or-not/
├── index.html          所有屏幕是 <section>，同一时刻只显示一个
├── DESIGN.md           设计文档（活文档）
├── README.md           本文件
├── CHANGELOG.md        改动记录
├── kiosk.bat / serve.bat
├── css/                tokens / base / layout / components / motion
├── js/                 全部经典 script，全部挂 window.AON（无模块、无构建）
├── data/               real.csv / ai.csv / pairs.csv / rights.csv
│                       → manifest.js（生成物）+ crops.json（裁剪凭证）
├── assets/img/p/       <puzzleId>/1.webp, 2.webp   ← 路径刻意中性
├── tools/              内容流水线：deck.py / seed_deck_content.py /
│                       make_webp.py / gen_manifest.py / verify_assets.py
└── tests/              run.js（Node）+ run.html（浏览器）+ test.*.js
```

**还没有的**（记在这里以免被当成"已经有了"）：
`sw.js`、`manifest.webmanifest`、`js/share.js`。

源 deck（`20260917_CRIG_Ontdekt_AIorNot.pptx`，38 MB）刻意放在 `ai-or-not/` **之外**，
这样打包或 `git add -A` 永远不会把它发出去。

### 开发时需要知道的几条约束

这些是 `file://` 倒推出来的，**不是风格偏好**，改动会破坏 kiosk：

- **不能加 `<script type="module">`** —— `file://` 下被 CORS 拦掉
- **不能 `fetch()` 本地文件** —— 同上。题库是 `.js` 全局变量，不是 JSON
- **不能加 `@font-face`** —— 字体跨源加载被拦。只能用系统字体栈
- **不能直接读写 `localStorage`** —— 走 `AON.util.storage`
- **`js/` 里的纯逻辑文件必须保持零 DOM、零 `Math.random`** —— 这是它们能在 Node 与浏览器双跑、且可测试的前提

---

## 测试

```bash
node tests/run.js          # 163 项，纯逻辑
```

浏览器打开 `tests/run.html`（绿色横幅 = 全过）→ **176 项**，多出来的 13 项是
`test.dom.*`，它们要 `document`，Node 里跑不了。

**两个入口都要跑。** `run.js` 会列出被它跳过的 `test.dom.*` 文件——
否则"Node 全绿"很容易被误读成"全都测过了"。

`run.html` 与 `run.js` 的加载清单**必须保持一致**（顺序即依赖顺序）。
这两份清单曾经漂移过：`run.js` 加了两个模块而 `run.html` 没跟上，
那一批用例在浏览器里根本没执行，页面却显示全绿。

### ★ 这套测试【测不到】什么

有两层对上述全部自动化手段是**结构性不可见**的，而 2026-09-22 修掉的四个阻断缺陷
全都落在这两层里，其中三个当时是"163 项全绿"：

- **输入层。** `?autoplay` 直接调 `startSession()`/`onTimeout()`/`goNext()`，
  从不派发点击。事件委托坏掉、按钮被别的东西盖住、屏幕根本不可见——它一样跑得完。
  委托那一层现在由 `tests/test.dom.events.js` 补上了。
- **CSS 布局层。** `.attract` 恒为可见、`[hidden]` 失效、答题屏比视口高——
  这三条 `--dump-dom` 一个都查不出来，因为 `body[data-screen]` 始终是正确的。
  它们只能靠**真实浏览器里的真实鼠标事件**验收：
  见 `DESIGN.md` §11「手动清单」第 13 项——**纯鼠标通关一局，每一步都在视口内、无需滚动**。

### 无人值守跑一整局

```bash
chrome --headless=new --dump-dom \
  "file:///…/index.html?autoplay=12&seed=12345"
```

跑完读 `body[data-screen]` 与总结屏内容。`DESIGN.md` §11「手动清单」里有 4 项可以由此预先排掉。

⚠️ **但这条路查不出输入层与布局层的缺陷**——它直接调 `startSession()`/`goNext()`，
从不派发点击，也不看任何元素的实际位置。第 13 项（纯鼠标通关）必须真的用鼠标，
或者用 CDP 的 `Input.dispatchMouseEvent` 派发真实事件。

React/Vite 之类的构建步骤被刻意排除了：kiosk 要能从磁盘直接打开，而无后端、无构建的静态站点
是满足这个约束的最简形态。见 DESIGN.md §2.1。
