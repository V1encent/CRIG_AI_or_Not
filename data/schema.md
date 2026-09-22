# 数据三册 — 字段说明与评分锚点

本文件是**内容贡献者的契约**。评一张图之前先读第 3 节；那张锚点表的作用是让两个人
给同一张图打同样的分。没有它，三轴难度会退化成三个人的三种直觉。

---

## 1. 为什么是三册而不是一张表

```
data/real.csv   ──┐
                  ├──  tools/gen_manifest.py  ──→  data/manifest.js  ──→  引擎只看见 PUZZLES
data/ai.csv     ──┤        （校验 + join）           window.PUZZLES
data/pairs.csv  ──┘
```

一条真图与它的 AI 对应图之间是**显式引用**，不是"题目里第一张是真第二张是 AI"这种位置约定。
位置约定正是现有 deck 出问题的地方——它让"永远选左"成了通关策略。

| 册 | 一行是什么 | 主键 |
|---|---|---|
| `real.csv` | 一张**真图**（研究者的显微镜图 / 实验照片） | `realId` |
| `ai.csv` | 一张**AI 图** | `aiId` |
| `pairs.csv` | **一道题** = 一次配对 + 难度 + 教学 | `puzzleId` |
| `rights.csv` | 授权证据（可选的旁证台账，供人工核对） | `realId` |

### 三条由此而来的性质

**① 对应关系可校验。** `ai.csv` 的 `derivedFromRealId` 是**反向引用**：AI 图自己记得
它是由哪张真图生成的。于是 `validate.js` 能抓到一类光看题目对象看不出来的错误——
**配错半边**（AI 图 X 本是照真图 Y 生成的，却被配到了真图 Z 上）。
这是"对应的"三个字的落地方式。

**② 两路内容可以不对称地到达。** 研究者先给真图（只有 `real.csv` 有行），AI 图稍后生成；
或反过来。**没有配对的行在磁盘上合法存在**，只是不进 `manifest.js`、永不被 served。
半成品是被结构容纳的，不是错误。

**③ 一张真图可以派生多道题。** 同一张真图配多个 AI 变体（不同 `tells` / `postprocessing`）
→ 一条 `realId` 对多条 `aiId` → 不同难度档的多道题。
研究者供图是稀缺资源，这是内容量的主要乘数。

> ⚠️ 因为一张真图会有多道题，**抽题去重必须按 `realId`**，不能只按 `puzzleId`。
> 否则一局里会出现两次同一张真照片——看起来像 bug，而且第二题答案直接泄露。

---

## 2. 字段

### `real.csv`

| 列 | 必填 | 说明 |
|---|---|---|
| `realId` | ✅ | 稳定 id，如 `r-2026-014`。**一旦被 pairs 引用就不要改** |
| `file` | ✅ | 源文件引用，两种形态（见 §7） |
| `kind` | ✅ | `microscopy` \| `photo` \| `slide` \| `gel` \| `graph` |
| `subjectNl` / `subjectEn` | | 一句话描述，用于教学面板 |
| `credit` | ✅ | 署名。研究者姓名 / 实验室 / 机构 |
| `licence` | ✅ | 如 `Written permission`, `CC-BY-4.0` |
| `licenceUrl` | | 有链接就填 |
| `permitsWeb` | ✅ | `true`/`false` — 允许公网托管 |
| `permitsPublicDisplay` | ✅ | 允许现场公屏展示 |
| `permitsDerivatives` | ✅ | 允许裁剪/降质（我们的流水线会改图 = 衍生作品） |
| `ethicsCleared` | | **仅当** `humanMaterial=true` 时必填，且必须为 `true` |
| `humanMaterial` | ✅ | 是否含人体组织/病理材料。**决定 `ethicsCleared` 适不适用** |
| `rightsNote` | | 授权凭证的自由文本。写清日期与范围 |

**三个 permit 是相互独立的三件事**，很多许可只覆盖其中一两项。

`permitsPublicDisplay` 与 `permitsDerivatives` **总是必需**——我们要在屏幕上放它，
并且要裁剪重编码它，这两件事无论如何都会发生。`permitsWeb` 只在**这道题真的要上公网时**
必需：由 `pairs.csv` 的 `scope` 决定（见下）。缺任何适用项 → `status` 停在 `review`，
永不发布。

`ethicsCleared` **只在 `humanMaterial=true` 时被检查**。这一点值得说明，因为它曾经写错过：
早先的规则是"凡是 `kind=photo/microscopy` 就必须 `ethicsCleared=true`"，那等于逼着每一张
实验照片谎称已获伦理批准。**一个对所有人都恒为 true 的字段不再传递任何信息**，
而真正需要它的人体材料题反而没人去查了。同理，非人体材料不要填 `true`，留空或 `false`。

> ★ `permit` 决定「能不能用」，`scope` 决定「在哪能用」。两者是正交的：
> 源 deck 那批图就是「公屏展示有授权、公网托管没有」——它们的 `permitsPublicDisplay=true`
> 而 `permitsWeb=false`，`scope=kiosk`。这不是漏洞，是对现实的准确记录。


### `ai.csv`

| 列 | 必填 | 说明 |
|---|---|---|
| `aiId` | ✅ | 稳定 id |
| `file` | ✅ | 源文件路径 |
| **`derivedFromRealId`** | ✅ | ★ 反向引用。这张 AI 图是照哪张真图生成的 |
| `generator` | ✅ | `Midjourney` / `DALL·E` / `Stable Diffusion` / … |
| `model` | | 版本号，如 `v6.1` |
| `prompt` | ✅ | 完整 prompt，原样保存 |
| `licence` / `rightsNote` | ✅ | 生成条款。付费计划才可商用 |
| `variantOf` | | 同一真图的第几个变体（`1`,`2`,…）。便于区分 |

> 现有 deck 里那 5 张单图**没有生成器元数据、无 C2PA、无 `Software` 标签**，
> 无法为一个叫不出名字的生成器记录条款。它们可以用于测流水线；
> 若要进公网，应改用已知模型重新生成，或接受 `generator: "unknown"` 并在备注里写清。

### `pairs.csv`

| 列 | 必填 | 说明 |
|---|---|---|
| `puzzleId` | ✅ | 如 `p001` |
| `realId` / `aiId` | ✅ | 引用另两册 |
| `tells` / `subject` / `postprocessing` | ✅ | 三条难度轴，1–5，见第 3 节 |
| `cue` | ✅ | 教学线索枚举，见第 4 节 |
| `tellRegionX/Y/W/H` | ✅ | 归一化 0–1，破绽所在区域 |
| `explanationNl/En` | ✅ | 专家语域，1–3 句 |
| `kidLineNl/En` | ✅ | 儿童语域，一句，≤12 词 |
| `ruleNl/En` | ✅ | ★ 可迁移线索：下次该检查什么 |
| `realNoteNl/En` | ✅ | 为什么另一张是真的 |
| `status` | ✅ | `draft` \| `review` \| `ready` \| `retired` |
| `scope` | ✅ | `kiosk` \| `web` \| `both` — 这道题允许在哪种场合出现。**缺列按 `both` 处理** |
| `verifiedBy` / `verifiedAt` | ✅ | ★ 亲眼找到并确认破绽的人与日期 |
| `verifiedSolution` | ✅ | `true` 才能进 hard 池 |
| `cropWindow` | | 覆盖默认居中裁剪（居中裁会切掉破绽时必须填） |
| `sourceSlide` | | 源 deck 的页码（新内容留空） |
| `author` | | 谁写的这道题 |
| `tags` | | `|` 分隔。**不要拿 `notes` 当标签用** |
| `notes` | | 自由文本 |

**`verifiedBy` 以 `UNCONFIRMED` 开头**表示"有人看过，但签字的人不是 CRIG 的人"。
这类题照常进游戏（否则内容还没签字就一道题都玩不了），但 `manifest.js` 里会挂
`meta.provisional=true`，`verify_assets.py` 会点名，**`--release` 会因此失败**。
发布前必须清零：请人逐组看一遍，把 `verifiedBy` 改成那个人的名字。

> ★ `tellRegionX/Y/W/H` 是**源图**归一化坐标，且是**AI 图那一侧**的源图坐标
> （破绽在 AI 图里，教学面板缩放居中的也是 AI 图）。
> `gen_manifest.py` 会借 `data/crops.json` 把它换算成裁剪后坐标再写进 manifest。
> 换算的中间量**不要手算**——`crops.json` 是"流水线实际做了什么"的凭证，
> 手算就会让"意图"与"落盘的字节"分叉。


---

## 3. ★ 三轴评分锚点

三条轴**相互独立**。评之前先问自己：我评的是"破绽多明显"、"场面多复杂"，
还是"这张图被处理到什么程度"？三者会互相抵消，这是模型有意为之。

### `tells` — 破绽的明显程度

| 分 | 锚点 | 例子 |
|---|---|---|
| 1 | 一秒内可见，不需知道任何背景 | 六指；画面内文字是乱码；肢体从背景里长出来 |
| 2 | 看一眼能发现，但需要主动去找 | 多一个指节；投影方向与光源矛盾；两眼不对称 |
| 3 | 要细看或要数一下 | 手指数量对但关节走向不可能；重复图案的间隔忽大忽小 |
| 4 | 需要逻辑推理，外行要人提示才看得出 | 荧光信号没有对应的细胞器；比例尺与细胞尺寸冲突 |
| 5 | 无解剖/文字错误，只剩统计线索 | 只在不自然的平滑度或纹理重复上体现——**占位图到不了这一档** |

### `subject` — 题材复杂度

| 分 | 锚点 |
|---|---|
| 1 | 单一物体，平背景，无遮挡 |
| 2 | 单一物体 + 简单环境 |
| 3 | 两个交叠物体，或有阴影/倒影 |
| 4 | 多个对象、遮挡、画面内文字 |
| 5 | 强透视 / 汇聚线 / 拥挤场景 / 画面内文字且需读懂 |

### `postprocessing` — 预处理抹平线索的程度

| 分 | 锚点 |
|---|---|
| 1 | 未处理。原图直接进流水线 |
| 2 | 仅统一尺寸与格式（剥 EXIF、转 WebP、裁到 3:2） |
| 3 | 轻微降质：轻模糊 + 轻噪点，两侧同等施加 |
| 4 | 明显降质，真图的锐度优势被抹掉 |
| 5 | 两侧质感几乎一致，只剩像素级差异 |

> **`postprocessing` 是流水线施加的，而且是刻意对真实照片降质**（模糊、加噪、重压缩）。
> 这是最高档能成立的唯一办法，但有些合作者会从原则上反对。需要事先确认。
> 每一道题都会用 `postprocess.applied[]` 记录**实际做了什么**，让"意图"与"落盘的字节"
> 不会悄悄分叉。

### 合成规则

归一化后加权平均，权重在 `js/config.js`：`tells 0.45 / subject 0.30 / postprocessing 0.25`。

| 归一化分数 | 档位 |
|---|---|
| ≤ 0.34 | `easy` |
| ≤ 0.66 | `medium` |
| > 0.66 | `hard` |

**两条轴真的会互相抵消**：`{tells:5, subject:1, pp:1}` 与 `{tells:1, subject:5, pp:5}`
都落在 medium。单一 `hard` 标签无法区分这两种题，而它们应当同档——
这正是三轴模型比单一标签有价值的地方。

**档位与儿童阶梯一律推导得出，绝不手写。** 改权重时只需改一个地方。

`tools/verify_assets.py --stats` 会用约 15 行 Python 重实现同一个函数，并
**与 `tests/test.difficulty.js` 共用同一张 fixture 表**（`tests/fixture.difficulty.js`），
保证两边永不给出不同答案。它还会打印 **轴间相关系数**：若 `tells` 与 `subject`
相关系数超过 ~0.7，说明实际上只有一条轴，难度菜单是假的。

---

## 4. `cue` 枚举（教学线索）

外行可迁移的判据。**判据是逻辑，不是专业知识**——见 DESIGN.md §3.2。

| 值 | 中文 | 何时用 |
|---|---|---|
| `hands` | 手 | 手指数量、关节走向、指甲 |
| `text` | 文字 | 乱码、字母镜像、同一词写两遍不同 |
| `background` | 背景 | 背景物体融化、结构接不上 |
| `lighting` | 光与影 | 投影方向与光源矛盾、两个光源互相打架 |
| `perspective` | 透视 | 汇聚线不交于一点、近大远小失效 |
| `physics` | 物理 | 悬空、穿插、反重力、反射不对 |
| `repetition` | 重复 | 纹理/图案间距忽大忽小、同一个"随机"细节出现两次 |
| `cell-structure` | 细胞结构 | 核膜关系不可能、有丝分裂画成对称装饰 |
| `staining` | 染色 | 荧光信号没有对应细胞器、颜色分布不合物理 |
| `scale-bar` | 比例尺 | 比例尺与细胞尺寸自相矛盾 |

新增枚举时**必须同时在 `js/i18n.js` 的 nl 与 en 里加 `cue.<名>`**，
否则教学面板会把裸 key 显示给观众。`tests/test.i18n.js` 会双向检查这件事。

---

## 5. 从 CSV 到可玩的题

```bash
# 一次性：从源 deck 引导出四册 CSV 的骨架（之后 CSV 就是唯一真源）
python tools/seed_deck_content.py

#   ↓ 人工核对：填 verifiedBy、三个 permit、教学载荷、tellRegion
python tools/make_webp.py       # 统一 WebP + 固定尺寸 + 固定宽高比 + 剥 EXIF
                                # 同时写出 data/crops.json（裁剪凭证）
python tools/gen_manifest.py --require-min-per-tier 3
python tools/verify_assets.py   # 对产物断言（含"assets/ 下不许有源图"与答案键对账）
node tests/run.js               # 纯逻辑回归 + 生成物校验
```

`gen_manifest.py` 强制：一道题只有在 `status:ready` **且**适用的 permit 为真
**且**（`humanMaterial=true` 时）`ethicsCleared` 为真 **且** 教学字段齐全
**且** `tellRegion` 已设且能换算 **且** 有人工核验人 **且** `ai.derivedFromRealId`
与本题配的 `realId` 一致时，才会进 `manifest.js`。其余全部停在 `review`，永不被 served。

**这道缝是刻意的安全属性**：摄取真实图片永远不会意外让一道未核验的题变得可玩，
所以你可以反复跑流水线，同时慢慢磨答案键和授权。

### 三道防线的分工（别搞混）

答案键标反过一次——`make_webp.py` 把 AI 图放在编号为 `aiSlot` 的槽位，
而 `gen_manifest.py` 把 `isAI` 标到了另一侧，14 张图全标错。manifest 里看不出
任何异常：难度对、教学齐全、授权齐备、校验全绿。所以现在有三道：

| 防线 | 在哪 | 抓什么 |
|---|---|---|
| 主防线 | `gen_manifest.py` 生成时逐张与 `crops.json` 的 `kind` 对账 | 生成逻辑写反了 |
| 第二道 | `verify_assets.py` 重新对账一次 | `manifest.js` 是旧的、`crops.json` 是新的 |
| 回归 | `tests/test.manifest.js` | 生成物本身不合规、不可玩（Node 里没有 fs，不做对账） |

---

## 6. 路径命名规则

**落盘的路径必须中性**：`assets/img/p/<puzzleId>/1.webp` 与 `2.webp`。

**绝不能出现 `assets/img/ai/…` 或 `real.webp`。** 路径会出现在 URL、DOM、DevTools 里，
是全套防护中最容易漏、且能绕过其它所有防护的一条。
语义化的 id 只允许活在 CSV 里。

`js/validate.js` 会用 `/(^|\/)(ai|real)[\/_.-]/i` 检查这一点，`tests/test.validate.js`
里有正反两组用例。落盘时**文件名编号也不携带信息**：AI 落在 `1.webp` 还是 `2.webp`
由 `make_webp.py` 的 `ai_slot(puzzleId)` 哈希决定（可复现，不是随机），
`gen_manifest.py` 只读 `crops.json` 里记下的那个答案，绝不自己猜。

---

## 7. `file` 列：两种形态

| 形态 | 例子 | 什么时候用 |
|---|---|---|
| deck 内条目 | `20260917_CRIG_Ontdekt_AIorNot.pptx#ppt/media/image2.png` | 源图在 pptx 里（作者供图那一批） |
| 文件路径 | `sources/zebrafish-01.jpg` | 源图是散装文件 |

相对路径**相对于 `ai-or-not/` 的父目录**（也就是 `CRIG Ontdekt/`）解析——
`make_webp.py` 会 `abspath` 之后再打开，所以结果不取决于你从哪个目录调用它。
`--sources <dir>` 可覆盖散装文件的根目录。

> 源 deck 刻意留在 `ai-or-not/` **之外**，这样打包或 `git add -A` 永远不会把
> 38 MB 带 EXIF 的源图发出去。`verify_assets.py` 用一条断言守住这个意图：
> `assets/` 下不得出现任何 `.pptx/.jpg/.jpeg/.png`。

