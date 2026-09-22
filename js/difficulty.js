/* difficulty.js — 三条独立难度轴 → 一个连续分数 → 一个档位。
 *
 * ★ 纯函数。零 DOM、零 Math.random。浏览器与 Node 双跑，所以可 headless 测试。
 * ★ 本文件被 tools/verify_assets.py 用 Python 重实现，并与 tests/test.difficulty.js
 *   共用同一张 fixture 表——否则你调参时看的统计报告描述的题与游戏实际出的题不是同一批。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});

  var AXES = ['tells', 'subject', 'postprocessing'];

  function cfgOf(cfg) { return cfg || g.AON_CONFIG.difficulty; }

  /**
   * 归一化难度 ∈ [0, 1]。0 = 全年龄一眼可见，1 = 只有专家看得出。
   *
   * 每根轴 1..5 线性映射到 0..1（1→0，5→1）后加权平均。
   *
   * ★ 关键行为：某根轴缺失或非数值时，它【计入分母但不计入分子】。
   *   于是"没评分的题"会变【更容易】，而不是悄悄把权重重新分配给其它轴
   *   （那会让一道未评分的题看起来比实际更难，是最糟的失败方向）。
   */
  function score(difficulty, cfg) {
    cfg = cfgOf(cfg);
    var lo = cfg.axisRange.min, hi = cfg.axisRange.max, span = hi - lo;
    var weights = cfg.axisWeights;
    var weighted = 0, weightSum = 0;

    for (var i = 0; i < AXES.length; i++) {
      var axis = AXES[i];
      if (!Object.prototype.hasOwnProperty.call(weights, axis)) continue;
      var w = weights[axis];
      weightSum += w;
      var raw = difficulty ? difficulty[axis] : undefined;
      if (typeof raw === 'number' && isFinite(raw)) {
        weighted += w * (Math.min(Math.max(raw, lo), hi) - lo) / span;
      }
    }
    return weightSum > 0 ? weighted / weightSum : 0;
  }

  /** 'easy' | 'medium' | 'hard' —— 给成人看的标签。 */
  function tier(difficulty, cfg) {
    cfg = cfgOf(cfg);
    var s = score(difficulty, cfg);
    if (s <= cfg.tierThresholds.easy) return 'easy';
    if (s <= cfg.tierThresholds.medium) return 'medium';
    return 'hard';
  }

  /**
   * 1..kidLevels —— 儿童语域用更细的阶梯（显示为星星，不显示数字）。
   * 与 tier() 出自同一个连续分数，所以两者永不失配。
   */
  function kidLevel(difficulty, cfg) {
    cfg = cfgOf(cfg);
    var s = score(difficulty, cfg);
    return Math.min(cfg.kidLevels, Math.max(1, 1 + Math.floor(s * cfg.kidLevels)));
  }

  /**
   * 把不可见的轴翻译成一句人能读懂的话，给专家教学面板用。
   * 顺带是个嗅觉测试：如果这句话读起来不对劲，多半是轴评错了。
   */
  function explain(difficulty, cfg) {
    cfg = cfgOf(cfg);
    var d = difficulty || {}, parts = [];
    if (d.tells >= 4) parts.push('de fout van de AI was heel subtiel');
    else if (d.tells <= 2 && d.tells >= 1) parts.push('de fout van de AI was duidelijk zichtbaar');
    if (d.subject >= 4) parts.push('de scène was druk');
    else if (d.subject <= 2 && d.subject >= 1) parts.push('de scène was eenvoudig');
    if (d.postprocessing >= 4) parts.push('de echte foto is bewerkt om op een AI-beeld te lijken');
    return parts.length ? parts.join('; ') : '';
  }

  /**
   * 一道题是否可以被放进指定档位的池子。
   * hard 档额外要求有人确认过破绽真的存在——见 DESIGN.md §9 的诚实护栏。
   */
  function eligibleForTier(puzzle, wantTier, cfg) {
    cfg = cfgOf(cfg);
    if (tier(puzzle.difficulty, cfg) !== wantTier) return false;
    if (wantTier === 'hard' && cfg.hardRequiresRealContent) {
      return !!(puzzle.meta && puzzle.meta.verifiedSolution === true);
    }
    return true;
  }

  AON.difficulty = {
    AXES: AXES,
    score: score,
    tier: tier,
    kidLevel: kidLevel,
    explain: explain,
    eligibleForTier: eligibleForTier
  };
})(typeof window !== 'undefined' ? window : globalThis);
