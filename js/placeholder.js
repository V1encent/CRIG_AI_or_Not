/* placeholder.js — 运行时占位图生成器（内联 SVG data: URI，零二进制素材）。
 *
 * ★ 要求比"没有图也能跑"更强：占位图必须让【难度分档真的可测】。
 *   所以破绽是真实的、而且由三根轴字面参数化。
 *
 * ★ 诚实护栏（见 DESIGN.md §9）：
 *   tells ≥ 4 时不画显式破绽，而那样的图【并非真的可解】。
 *   所以生成器最高只到 MAX_HONEST_TELLS，并把 verifiedSolution 记为 false，
 *   validate.js 据此把它排除在 hard 池外。
 *   —— 占位图可以测所有档位的管道，但绝不能用来调最高档的手感。
 *
 * ★ 纯函数。零 DOM（只生成字符串）。可 headless 测试。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});

  var W = 1200, H = 800;
  var MAX_HONEST_TELLS = 3;   // 见文件头

  /* 扁平化小清新调色板。低饱和填充 + 深色描边。 */
  var PALETTE = {
    bgs: ['#EEF6F4', '#F3F1FA', '#FDF4EC', '#EDF4FB', '#F5F2EC'],
    fills: ['#BFE3DC', '#C9DDF0', '#E6D6EE', '#F1DCCB', '#CFE7CD'],
    ink: '#2C4A4A',
    accent: '#D98A4B'
  };

  var nf = function (v) { return Math.round(v * 1000) / 1000; };

  /* ── 场景：两张图共享同一个场景，只有破绽不同 ──────────────────── */

  function buildScene(rng, difficulty) {
    var subject = difficulty.subject || 1;
    var tells = difficulty.tells || 1;

    /* tells 3 的破绽是"比例尺与细胞尺寸自相矛盾"，所以那一档【必须】有比例尺。
     * 否则 subject<3 时那条破绽会静默退化成"只有一个细胞特别大"，
     * 于是 tells 3 在不同 subject 下不是同一个东西。 */
    var needsScaleBar = subject >= 3 || tells >= 3;

    var cellCount = 5 + Math.round((subject - 1) * 2);   // 5 .. 13
    var cells = [];
    for (var i = 0; i < cellCount; i++) {
      var rx = 60 + rng() * 70;
      var ry = rx * (0.62 + rng() * 0.5);
      cells.push({
        x: 90 + rng() * (W - 180),
        y: 90 + rng() * (H - 180),
        rx: rx, ry: ry,
        rot: rng() * 180 - 90,
        fill: PALETTE.fills[Math.floor(rng() * PALETTE.fills.length)],
        nr: Math.max(9, rx * (0.16 + rng() * 0.12)),
        noff: (rng() - 0.5) * rx * 0.45
      });
    }

    // 题材越复杂，越多的"结构"和画面内文字
    var vessels = [];
    if (subject >= 4) {
      for (var v = 0; v < 2 + Math.round(subject - 4); v++) {
        vessels.push({
          x1: rng() * W, y1: 0, x2: rng() * W, y2: H,
          w: 4 + rng() * 7
        });
      }
    }

    return {
      bg: PALETTE.bgs[Math.floor(rng() * PALETTE.bgs.length)],
      cells: cells,
      vessels: vessels,
      label: needsScaleBar ? '200 µm' : '',
      scaleBar: needsScaleBar
    };
  }

  /* 深拷贝，好让 AI 侧改场景而不影响真侧。 */
  function cloneScene(s) {
    return JSON.parse(JSON.stringify(s));
  }

  /* ── 破绽：由 tells 参数化 ──────────────────────────────────────── */

  /**
   * tells 1 → 一眼可见（多一个细胞核 / 多一根突起）
   * tells 2 → 要看一眼（核跑到膜外）
   * tells 3 → 要细看（比例尺与细胞尺寸冲突 + 文字镜像）
   * tells ≥ 4 → 不画（诚实护栏）
   */
  function applyDefect(scene, tells, rng) {
    var t = Math.min(tells || 1, MAX_HONEST_TELLS);
    var cell = scene.cells[Math.floor(scene.cells.length / 2)];
    var region = null;

    if (t === 1) {
      // 一个细胞里有两个核 —— 结构不可能，一眼可见
      cell.extraNucleus = { dx: cell.noff + cell.nr * 2.2, dy: cell.nr * 1.1, r: cell.nr };
      region = bboxOf(cell, 1.6);
    } else if (t === 2) {
      // 核跑到了细胞膜外面 —— 需要看一眼
      cell.noff = cell.rx * 1.12;
      region = bboxOf(cell, 1.5);
    } else {
      // 比例尺与细胞尺寸冲突 + 文字镜像 —— 要细看
      if (scene.label) scene.label = '200 µm';   // 与真侧相同字样，但比例尺被改短
      scene.scaleBarLen = 46;                     // 真侧是 130
      scene.labelMirrored = true;
      var last = scene.cells[scene.cells.length - 1];
      last.rx *= 2.35;                            // 尺寸不合常理
      region = bboxOf(last, 1.5);
    }

    return { kind: 'tells-' + t, region: region };
  }

  function bboxOf(cell, pad) {
    var rx = cell.rx * (pad || 1.4), ry = cell.ry * (pad || 1.4);
    return normRect(cell.x - rx, cell.y - ry, rx * 2, ry * 2);
  }

  /**
   * 把像素矩形转成归一化矩形，并【保证它整个落在画面内】。
   *
   * ★ 必须平移回画面内，而不是简单裁掉宽高：tellRegion 驱动"看这里"的聚焦环，
   *   一个越界的区域会让取景框对不准破绽，甚至会得到 x+w>1 的退化矩形，
   *   被 validate.js 判为 tellregion-degenerate。
   *   靠近右/下边缘的细胞正是最容易触发这条路径的情形。
   *
   * 先对 w/h 取整再算位移，否则两次四舍五入会破坏 x+w ≤ 1 这个不变式。
   */
  function normRect(x, y, w, h) {
    var nw = Math.min(nf(w / W), 1);
    var nh = Math.min(nf(h / H), 1);
    var nx = Math.min(Math.max(nf(x / W), 0), nf(1 - nw));
    var ny = Math.min(Math.max(nf(y / H), 0), nf(1 - nh));
    return { x: nx, y: ny, w: nw, h: nh };
  }

  /* ── 渲染 ──────────────────────────────────────────────────────── */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render(scene, difficulty) {
    var pp = difficulty.postprocessing || 0;      // 1..5
    var blur = pp > 1 ? (pp - 1) * 0.32 : 0;      // 0 .. 1.28
    var noise = pp > 1 ? 0.03 + (pp - 1) * 0.035 : 0;

    var parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">');

    if (blur > 0 || noise > 0) {
      parts.push('<defs>');
      if (blur > 0) {
        parts.push('<filter id="b" x="-5%" y="-5%" width="110%" height="110%">' +
          '<feGaussianBlur stdDeviation="' + nf(blur) + '"/></filter>');
      }
      if (noise > 0) {
        // 固定 seed ⇒ 两侧噪声完全一致 —— 这正是"抹平线索"：降质是均等的，不构成提示
        parts.push('<filter id="n" x="0" y="0" width="100%" height="100%">' +
          '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="t"/>' +
          '<feColorMatrix in="t" type="saturate" values="0"/></filter>');
      }
      parts.push('</defs>');
    }

    var g0 = '<g' + (blur > 0 ? ' filter="url(#b)"' : '') + '>';

    parts.push('<rect width="' + W + '" height="' + H + '" fill="' + scene.bg + '"/>');
    parts.push(g0);

    // 血管 / 结构线
    scene.vessels.forEach(function (v) {
      parts.push('<line x1="' + nf(v.x1) + '" y1="' + nf(v.y1) + '" x2="' + nf(v.x2) +
        '" y2="' + nf(v.y2) + '" stroke="' + PALETTE.fills[1] + '" stroke-width="' + nf(v.w) +
        '" stroke-linecap="round" opacity="0.55"/>');
    });

    // 细胞
    scene.cells.forEach(function (c) {
      parts.push('<g transform="rotate(' + nf(c.rot) + ' ' + nf(c.x) + ' ' + nf(c.y) + ')">');
      parts.push('<ellipse cx="' + nf(c.x) + '" cy="' + nf(c.y) + '" rx="' + nf(c.rx) +
        '" ry="' + nf(c.ry) + '" fill="' + c.fill + '" stroke="' + PALETTE.ink +
        '" stroke-width="2.5" opacity="0.9"/>');
      parts.push('<ellipse cx="' + nf(c.x + c.noff) + '" cy="' + nf(c.y) + '" rx="' + nf(c.nr) +
        '" ry="' + nf(c.nr * 0.85) + '" fill="' + PALETTE.ink + '" opacity="0.72"/>');
      if (c.extraNucleus) {
        parts.push('<ellipse cx="' + nf(c.x + c.extraNucleus.dx) + '" cy="' + nf(c.y + c.extraNucleus.dy) +
          '" rx="' + nf(c.extraNucleus.r) + '" ry="' + nf(c.extraNucleus.r * 0.85) +
          '" fill="' + PALETTE.ink + '" opacity="0.72"/>');
      }
      parts.push('</g>');
    });

    // 比例尺与文字
    if (scene.scaleBar) {
      var len = scene.scaleBarLen || 130;
      parts.push('<line x1="60" y1="' + (H - 60) + '" x2="' + (60 + len) + '" y2="' + (H - 60) +
        '" stroke="' + PALETTE.ink + '" stroke-width="7" stroke-linecap="round"/>');
      if (scene.label) {
        var label = scene.labelMirrored
          ? scene.label.split('').reverse().join('')
          : scene.label;
        parts.push('<text x="60" y="' + (H - 78) + '" font-family="system-ui,Segoe UI,Roboto,sans-serif" ' +
          'font-size="30" fill="' + PALETTE.ink + '">' + esc(label) + '</text>');
      }
    }

    parts.push('</g>');

    if (noise > 0) {
      parts.push('<rect width="' + W + '" height="' + H + '" filter="url(#n)" opacity="' + nf(noise) + '"/>');
    }

    parts.push('</svg>');
    return parts.join('');
  }

  function toUri(svg) {
    // encodeURIComponent 而非 base64：可读、可 diff，且无需 btoa（后者在非 Latin1 下会抛）
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ── 对外 API ──────────────────────────────────────────────────── */

  /**
   * 生成一对图。real 与 ai 共享同一个场景，只有破绽与（可选的）降质不同。
   * 返回 { real, ai, tellRegion, width, height }，全是可直接塞进 <img src> 的 URI。
   */
  function makePair(seed, difficulty) {
    difficulty = difficulty || { tells: 1, subject: 1, postprocessing: 1 };
    var sceneRng = AON.util.mulberry32(seed);
    var scene = buildScene(sceneRng, difficulty);

    var realSvg = render(cloneScene(scene), difficulty);

    var aiScene = cloneScene(scene);
    var defect = applyDefect(aiScene, difficulty.tells, AON.util.mulberry32(seed + 991));
    var aiSvg = render(aiScene, difficulty);

    return {
      real: toUri(realSvg),
      ai: toUri(aiSvg),
      tellRegion: defect.region,
      width: W,
      height: H
    };
  }

  /**
   * 生成一整套占位题（同一形状的 puzzle 对象，与真实题库完全一致）。
   * 引擎分辨不出真假——这正是重点。
   */
  function makePuzzles(opts) {
    opts = opts || {};
    var perTier = opts.perTier || 10;
    var baseSeed = opts.seed == null ? 1000 : opts.seed;
    var out = [];

    /* 三根轴的组合。
     *
     * ★ 两条硬约束，都不是审美问题：
     *   1. tells 必须 ≤ MAX_HONEST_TELLS(3)。tells≥4 时 applyDefect 什么都不画，
     *      两张图会一模一样 —— 那就不再是一道题了。
     *   2. 每组 [t,s,p] 算出来的 tier 必须真的等于它所在的键。否则 id 叫
     *      'ph-medium-04' 的题实际是 easy，"难度菜单"就是假的，而且从界面上
     *      完全看不出来。tests/test.placeholder.js 逐条断言这一点。
     *
     * 第一版把 [3,1,1]（实际 0.225 → easy）和 [2,2,3]（0.3125 → easy）放进了
     * medium，正是这个错误。
     */
    var COMBOS = {
      easy:   [[1, 1, 1], [1, 2, 1], [2, 1, 1], [1, 1, 2]],
      /* 其中 [1,4,4] 与 [1,5,5] 是刻意的"抵消"用例：
       * 破绽一眼可见，但场景复杂、降质重，合起来仍是 medium。
       * 这正是三轴模型比单一 hard 标签有价值的地方。 */
      medium: [[3, 2, 2], [2, 3, 3], [3, 3, 3], [2, 4, 4], [1, 4, 4], [1, 5, 5]],
      hard:   [[3, 5, 5], [3, 4, 5], [3, 5, 4], [2, 5, 5]]
    };

    Object.keys(COMBOS).forEach(function (tierName) {
      var combos = COMBOS[tierName];
      for (var i = 0; i < perTier; i++) {
        var c = combos[i % combos.length];
        var difficulty = { tells: c[0], subject: c[1], postprocessing: c[2] };
        var id = 'ph-' + tierName + '-' + String(i + 1).padStart(2, '0');
        var pair = makePair(baseSeed + out.length * 37, difficulty);

        /* 实际档位由轴算出来，【不读 COMBOS 的键】——键只是造 id 用的标签。
         * 这样即使以后有人改了轴值而忘了改标签，诚实护栏也不会跟着一起错。 */
        var actualTier = AON.difficulty.tier(difficulty);

        out.push({
          id: id,
          schemaVersion: 1,
          status: 'ready',
          placeholder: true,               // 仅供开发期识别；引擎业务逻辑【不读】这个字段
          slide: null,
          difficulty: difficulty,
          images: [
            { id: id + '-1', src: pair.real, isAI: false, width: W, height: H,
              altKey: 'alt.imageSlot',
              provenance: { kind: 'photo', generator: null, prompt: null,
                credit: 'Placeholder', licence: 'Generated', licenceUrl: null, sourceUrl: null,
                rightsCleared: true,
                permits: { web: true, publicDisplay: true, derivatives: true },
                /* 合成图，不是人体材料。ethicsCleared 因此是 null 而不是 true：
                 * 一个恒为 true 的字段不传递任何信息，真需要它的那道题就没人查了。 */
                humanMaterial: false, ethicsCleared: null,
                rightsNote: 'Generated placeholder.' } },
            { id: id + '-2', src: pair.ai, isAI: true, width: W, height: H,
              altKey: 'alt.imageSlot',
              provenance: { kind: 'ai', generator: 'placeholder.js', model: 'v1',
                prompt: 'synthetic microscopy-like scene, tells=' + difficulty.tells,
                credit: null, licence: 'Generated',
                permits: { web: true, publicDisplay: true, derivatives: true } } }
          ],
          postprocess: { recipe: difficulty.postprocessing > 1 ? 'placeholder-pp' : null,
            applied: [], sourceAspect: [W / H, W / H], cropWindow: 'none' },
          teaching: {
            cue: difficulty.subject >= 3 ? 'cell-structure' : 'repetition',
            tellRegion: pair.tellRegion,
            explanation: {
              nl: 'Testbeeld: de AI-versie heeft een celstructuur die niet kan bestaan.',
              en: 'Test image: the AI version has a cell structure that cannot exist.'
            },
            kidLine: {
              nl: 'Kijk naar de cel: er klopt iets niet!',
              en: 'Look at the cell: something is off!'
            },
            rule: {
              nl: 'Tel structuren en kijk of ze kloppen. AI verzint er vaak net één te veel.',
              en: 'Count structures and check whether they make sense. AI often invents one too many.'
            },
            realNote: {
              nl: 'Bij de echte versie past elke kern bij precies één cel.',
              en: 'In the real version every nucleus belongs to exactly one cell.'
            }
          },
          /* ★ 诚实护栏：只有 easy / medium 的占位题记 verifiedSolution。
           *   hard 占位题的难度只来自 subject 与 postprocessing —— tells 被封在 3 ——
           *   所以它并非真正的 hard 题。validate.js 会报 hard-unverified 把它挡在
           *   hard 池之外（见 difficulty.eligibleForTier）。
           *   占位图能测通所有档位的【管道】，但绝不能用来调最高档的手感。 */
          meta: { author: 'placeholder.js', reviewer: 'placeholder.js',
            reviewedAt: null,
            verifiedSolution: difficulty.tells <= MAX_HONEST_TELLS && actualTier !== 'hard',
            tags: ['placeholder', actualTier], notes: 'Synthetic.' }
        });
      }
    });

    return out;
  }

  AON.placeholder = {
    makePair: makePair,
    makePuzzles: makePuzzles,
    MAX_HONEST_TELLS: MAX_HONEST_TELLS
  };
})(typeof window !== 'undefined' ? window : globalThis);
