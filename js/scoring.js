/* scoring.js — 计分与段位。
 *
 * ★ 纯函数。零 DOM、零 Math.random。
 * ★ 全年龄前提：段位【没有失败措辞】，连击也从不显示为"损失"。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});

  function calculateLevelPoints(level, levelQuestionsCount, maxLevel, targetTotal, idxInLevel) {
    targetTotal = targetTotal || 100;
    maxLevel = maxLevel || 6;
    levelQuestionsCount = Math.max(1, levelQuestionsCount || 1);
    idxInLevel = idxInLevel || 0;
    var W = 0;
    for (var l = 1; l <= maxLevel; l++) W += l;
    var prevCum = 0;
    for (var p = 1; p < level; p++) prevCum += p;
    var curCum = prevCum + level;
    var levelTotal = Math.round((targetTotal * curCum) / W) - Math.round((targetTotal * prevCum) / W);
    var base = Math.floor(levelTotal / levelQuestionsCount);
    var rem = levelTotal % levelQuestionsCount;
    return Math.max(1, base + (idxInLevel < rem ? 1 : 0));
  }

  /**
   * 单轮得分。
   * 底分按档位（难的题更值钱），再乘一个【有上限】的连击系数。
   * 上限是必需的：无上限的乘数会让一个运气好的孩子在共享展台上刷出无法超越的分数。
   */
  function roundPoints(round, session, cfg) {
    cfg = cfg || g.AON_CONFIG.scoring;
    if (!round || !round.correct) return 0;

    // 分级阶梯爬升模式（均分制）：当且仅当题目带有 level 且启用 progressive 时，每题得 1 分
    var progCfg = (g.AON_CONFIG && g.AON_CONFIG.progressive) || {};
    if (round.puzzle && round.puzzle.level && progCfg.enabled) {
      return progCfg.pointsPerQuestion != null ? progCfg.pointsPerQuestion : 1;
    }

    var base = cfg.base[round.tier];
    if (typeof base !== 'number') base = cfg.base.medium;
    /* ★ 下限夹到 0。负连击不是"惩罚"，它是别处出 bug 的信号
     *   （会话被恢复、计数器被写坏），而它造成的后果是荒谬的：
     *   streak=-10 时 mult=0，答对得 0 分；streak=-20 时得负分。
     *   全年龄前提是连击从不显示为损失，所以这里必须夹住而不是信任调用方。 */
    var streak = Math.max(0, (session && session.streak) || 0);
    var mult = 1 + cfg.streakStep * Math.min(streak, cfg.streakCap);
    return Math.round(base * mult);
  }

  /**
   * 一局结束后的段位。按比例而非绝对答对数，所以任何题量都成立。
   * 返回一个 i18n key 而不是文案——文案归 i18n.js。
   */
  function rank(correct, total) {
    if (!total) return { id: 'rookie', stars: 1, ratio: 0 };
    var ratio = correct / total;
    var id = 'rookie';
    if (ratio >= 1) id = 'hunter';
    else if (ratio >= 0.8) id = 'detective';
    else if (ratio >= 0.5) id = 'spotter';
    var stars = id === 'hunter' ? 3 : (id === 'detective' ? 3 : (id === 'spotter' ? 2 : 1));
    return { id: id, stars: stars, ratio: ratio };
  }

  AON.scoring = {
    roundPoints: roundPoints,
    rank: rank,
    calculateLevelPoints: calculateLevelPoints
  };
})(typeof window !== 'undefined' ? window : globalThis);
