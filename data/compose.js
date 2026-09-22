/* compose.js — 把【真实题】与【占位题】合成一份可玩题池，并按 status 过滤。
 *
 * ★ 为什么"合并"而不是"替换"：
 *   真实题与占位题共存，于是你可以用 3 道真题 + 40 道占位题开发。
 *   引擎分辨不出差别——这正是重点：如果引擎需要知道哪些是占位题，抽象就漏了。
 *   （puzzle.placeholder 字段只给 dev 工具看，业务逻辑一律不读。）
 *
 * ★ 这是"内容后续填充"能平滑落地的地方：
 *   今天 manifest.js 是空的 → 全占位也能跑完整流程；
 *   明天 researcher 给了 3 张真图 → 那 3 道真题自动混进牌堆，占位题自动退居补位。
 *
 * ★ 纯函数。零 DOM。可 headless 测试。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});

  /* 只有 ready 会被 served。draft/review/retired 一律不可玩—— */
  /* 这道隔离机制保证：摄取真实图片永远不会意外让一道未核验的题变得可玩。 */
  var SERVABLE = { ready: true };

  /* 固定种子，不是随机：占位图是 data: URI，每次启动都不同会让
   * "第 3 题看起来和昨天不一样"变成无法复现的怪事。
   * 用日期当种子，好让图会随时间缓慢变化而不至于每天都变。 */
  var DEFAULT_SEED = 20260922;

  /** 真实题库（data/manifest.js 生成物）。缺失时退回空数组——游戏必须照常跑。 */
  function realPuzzles() {
    var p = g.PUZZLES;
    return Array.isArray(p) ? p : [];
  }

  /**
   * 按 status 过滤，并且【顺手做最后一道 sanity 检查】：
   * 一道题必须恰好两张图、恰好一张 AI。宁可在开发期少出一道题，
   * 也不能让一张没答案的题进到玩家面前——那会毁掉整个教学时刻。
   *
   * ★ mode（'kiosk' | 'web'）是授权闸门的运行期一半。
   *   gen_manifest.py 已经把不符合 scope 的题拦在构建期了，这里是第二道：
   *   同一份 manifest.js 会被两种场合加载，而"公屏展示有授权、公网托管没有"
   *   正是源 deck 那批图的真实处境。少了这一道，那批图就会跟着上公网。
   *   mode 省略 ⇒ 不过滤（测试与工具用）。
   */
  function servable(list, mode) {
    return (list || []).filter(function (p) {
      if (!p || !SERVABLE[p.status]) return false;
      if (mode && !matchesScope(p, mode)) return false;
      if (!Array.isArray(p.images) || p.images.length !== 2) return false;
      var ai = 0, real = 0;
      p.images.forEach(function (im) {
        if (im && im.isAI === true) ai++;
        else if (im && im.isAI === false) real++;
      });
      return ai === 1 && real === 1;
    });
  }

  /**
   * 这道题在 mode 场合能不能出现。
   * 缺 scope 视为 'both' —— 占位题没有 scope 字段，且它们必须处处可用。
   * （gen_manifest.py 对缺列的 CSV 行也是这么兜的，两处保持一致。）
   */
  function matchesScope(p, mode) {
    var s = (p && p.scope) || 'both';
    return s === 'both' || s === mode;
  }

  /**
   * 合成题池。
   *
   * opts: {
   *   mode:               'kiosk' | 'web'；省略则不过滤 scope
   *   includePlaceholder: 是否混入占位题（默认 true）
   *   perTier:            每档生成多少道占位题（默认 10）
   *   placeholderSeed:    占位题种子（默认 DEFAULT_SEED，固定值 ⇒ 每次启动同样的图）
   * }
   *
   * 返回 { puzzles, realCount, placeholderCount, rejectedCount,
   *        outOfScopeCount, isPlaceholderOnly }
   *   —— 计数是刻意返回的：展台上"怎么只有占位题"必须一眼可诊断，
   *      而"web 版怎么一道真题都没有"同样必须一眼可诊断（那通常是授权问题，
   *      不是 bug）。outOfScopeCount 就是为后者存在的。
   */
  function build(opts) {
    opts = opts || {};
    var includePh = opts.includePlaceholder !== false;
    var mode = opts.mode;

    var rawReal = realPuzzles();
    var real = servable(rawReal, mode);

    var ph = [];
    if (includePh && AON.placeholder) {
      ph = AON.placeholder.makePuzzles({
        perTier: opts.perTier || 10,
        seed: opts.placeholderSeed == null ? DEFAULT_SEED : opts.placeholderSeed
      });
    }

    var all = real.concat(ph);

    /* 真实内容不足时，占位题会填满档位。但【永远不静默】：
     * 调用方据此在 dev 期打警告、在展台版里决定要不要显示"演示模式"角标。 */
    return {
      puzzles: all,
      realCount: real.length,
      placeholderCount: ph.length,
      rejectedCount: rawReal.length - real.length,
      /* 其中有多少道是被 scope 挡掉的（授权原因，不是数据坏了） */
      outOfScopeCount: rawReal.filter(function (p) {
        return p && SERVABLE[p.status] && mode && !matchesScope(p, mode);
      }).length,
      isPlaceholderOnly: real.length === 0
    };
  }

  /** 按档位计数，供 --require-min-per-tier 类的判断与 dev 直方图。 */
  function tierHistogram(list) {
    var out = { easy: 0, medium: 0, hard: 0 };
    (list || []).forEach(function (p) {
      var t = AON.difficulty.tier(p.difficulty);
      if (out[t] === undefined) out[t] = 0;
      out[t]++;
    });
    return out;
  }

  AON.compose = {
    SERVABLE: SERVABLE,
    realPuzzles: realPuzzles,
    servable: servable,
    matchesScope: matchesScope,
    build: build,
    tierHistogram: tierHistogram
  };
})(typeof window !== 'undefined' ? window : globalThis);
