/* selector.js — 抽题、去重、左右随机、自适应。
 *
 * ★ 纯函数 + 注入式 RNG。零 DOM、零 Math.random。
 * ★ 这个文件承载整个设计的两个硬要求：
 *    1. 左右随机（否则"永远选左边"就能通关——现有 deck 正是这个问题）
 *    2. 按 realId 去重（否则同一张真照片会在一局里出现两次，且泄露答案）
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});

  /**
   * 找出题目的真侧与 AI 侧。
   *
   * ★ 刻意不依赖 images 数组的顺序。数组顺序【不携带任何信息】——
   *   谁是真、谁是 AI 只由 isAI 决定；显示在左还是右由 aiSlot 决定。
   *   这样即使有人手工调整了 manifest 里的数组顺序，也不会意外泄露答案。
   */
  function sidesOf(puzzle) {
    var imgs = (puzzle && puzzle.images) || [];
    var out = { ai: null, real: null };
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].isAI === true) out.ai = imgs[i];
      else if (imgs[i].isAI === false) out.real = imgs[i];
    }
    return out;
  }

  /** 去重键。优先用真图的 id —— 一张真图可能派生多道题（不同 AI 变体）。 */
  function realIdOf(puzzle) {
    var s = sidesOf(puzzle);
    return (s.real && s.real.id) || puzzle.realId || puzzle.id;
  }

  /**
   * 建一个牌堆。
   *
   * opts: {
   *   puzzles:        候选题（调用方已过滤 status / 权利 / 模式）
   *   count:          一局题量
   *   seed:           随机种子（可选）。同一种子 + 同一输入 ⇒ 同一牌堆。
   *   cfg:            覆盖 AON_CONFIG.selector（测试用）
   *   recentRealIds:  跨局历史（可选），这些 realId 会被当作已出过
   * }
   */
  function createDeck(opts) {
    opts = opts || {};
    var cfg = opts.cfg || g.AON_CONFIG.selector;
    var dcfg = g.AON_CONFIG.difficulty;
    var rng = AON.util.mulberry32(opts.seed == null ? 1 : opts.seed);
    var pool = (opts.puzzles || []).slice();
    var count = opts.count || 1;

    var seenReal = {};
    (opts.recentRealIds || []).forEach(function (id) { seenReal[id] = 1; });

    var lastRealId = null;
    var lastAiSlot = -1;
    var sameSlotRun = 0;
    var widened = false;
    var exhausted = false;

    /* 侧别分配。随机，但绝不让 AI 连续同侧超过 avoidSameAiSideRun 轮。 */
    function pickAiSlot() {
      var slot = rng() < 0.5 ? 0 : 1;
      if (sameSlotRun >= cfg.avoidSameAiSideRun) slot = 1 - lastAiSlot;
      sameSlotRun = (slot === lastAiSlot) ? sameSlotRun + 1 : 1;
      lastAiSlot = slot;
      return slot;
    }

    function wrap(p) {
      return {
        puzzle: p,
        aiSlot: pickAiSlot(),
        tier: AON.difficulty.tier(p.difficulty, dcfg),
        realId: realIdOf(p)
      };
    }

    /* 候选池：优先本局没出过的 realId。 */
    function candidates() {
      var fresh = pool.filter(function (p) { return !seenReal[realIdOf(p)]; });
      if (fresh.length) return fresh;

      /* 题池耗尽。内容少时（比如只有 2 道题）这条路径会一直触发，
       * 它必须顺滑而不是报错，但也不能紧接着重复同一张真图——
       * 那样看起来就像游戏坏了。 */
      exhausted = true;
      widened = true;
      var notJustSeen = pool.filter(function (p) { return realIdOf(p) !== lastRealId; });
      return notJustSeen.length ? notJustSeen : pool;
    }

    /**
     * 抽一道题。
     * target 为 null / {tier:'easy'} → 固定档位模式
     * target 为 {score:0.42, window:0.15} → 自适应模式（按连续分数选最近的）
     */
    function draw(target) {
      var avail = candidates();
      if (!avail.length) return null;

      var chosen = null;

      if (target && typeof target.score === 'number') {
        var best = Infinity;
        avail.forEach(function (p) {
          var d = Math.abs(AON.difficulty.score(p.difficulty, dcfg) - target.score);
          if (d < best) { best = d; chosen = p; }
        });
        if (best > target.window) widened = true;
      } else {
        var wantTier = target && target.tier;
        var strict = avail.filter(function (p) {
          return AON.difficulty.eligibleForTier(p, wantTier, dcfg);
        });
        if (!strict.length) {
          /* 池子不够铺满这一档：接受任意题，并诚实标记。
           * 内容少时这是常态，不是错误。 */
          widened = true;
          strict = avail;
        }
        chosen = AON.util.shuffle(strict, rng)[0];
      }

      if (!chosen) return null;
      var rid = realIdOf(chosen);
      seenReal[rid] = 1;
      lastRealId = rid;
      return wrap(chosen);
    }

    return {
      poolSize: pool.length,
      count: count,
      draw: draw,
      isWidened: function () { return widened; },
      isExhausted: function () { return exhausted; },
      /* 测试用：一次抽完一局。 */
      drawAll: function (target) {
        var out = [];
        for (var i = 0; i < count; i++) {
          var r = draw(typeof target === 'function' ? target(i) : target);
          if (r) out.push(r);
        }
        return out;
      }
    };
  }

  /**
   * 自适应：根据上一轮结果调整儿童阶梯（1..kidLevels）。
   * 约 20 行，且复用同一个牌堆与配置，所以不构成第二条代码路径。
   */
  function adapt(session, lastCorrect, cfg) {
    cfg = cfg || g.AON_CONFIG.adapt;
    var lvl = session.kidLevel;
    if (lastCorrect) {
      session.correctStreak = (session.correctStreak || 0) + 1;
      if (session.correctStreak >= cfg.upAfterCorrectStreak) {
        lvl += 1; session.correctStreak = 0;
      }
    } else {
      session.correctStreak = 0;
      lvl -= 1;
    }
    session.kidLevel = AON.util.clamp(lvl, 1, g.AON_CONFIG.difficulty.kidLevels);
    return session.kidLevel;
  }

  /** 儿童阶梯（1..N）→ 该档位的目标连续分数。 */
  function targetForLevel(level) {
    var n = g.AON_CONFIG.difficulty.kidLevels;
    // 把 level 映射到它那一档的中心分数。
    return { score: (level - 0.5) / n, window: g.AON_CONFIG.adapt.window };
  }

  /**
   * 分级阶梯爬升牌堆（Progressive Deck）。
   *
   * 游玩模式：
   * 1. 难度逐级攀升（Level 1 -> Level 2 -> Level 3 -> Level 4）。
   * 2. UI 上完全不显示难度字样（无 Makkelijk/Gemiddeld/Moeilijk，纯净专注于辨识）。
   * 3. 左右槽位严格随机（AI 不得连续同侧超过 avoidSameAiSideRun 次）。
   * 4. 按 realId 去重。
   * 5. 每个难度随机挑选 pairsPerLevel 对（当前为 1 对，后续图片增加可设为 3~4 对）。
   * 6. 总题量动态等于 实际抽取题目总数。
   */
  function createProgressiveDeck(opts) {
    opts = opts || {};
    var cfg = opts.cfg || g.AON_CONFIG.selector;
    var progCfg = (g.AON_CONFIG && g.AON_CONFIG.progressive) || {};
    var pairsPerLevel = opts.pairsPerLevel || progCfg.pairsPerLevel || 1;
    var maxLevel = opts.maxLevel || progCfg.maxLevel || 4;
    var rng = AON.util.mulberry32(opts.seed == null ? 1 : opts.seed);
    var pool = (opts.puzzles || []).slice();

    var seenReal = {};
    (opts.recentRealIds || []).forEach(function (id) { seenReal[id] = 1; });

    var lastAiSlot = -1;
    var sameSlotRun = 0;
    var widened = false;
    var exhausted = false;

    function pickAiSlot() {
      var slot = rng() < 0.5 ? 0 : 1;
      if (sameSlotRun >= cfg.avoidSameAiSideRun) slot = 1 - lastAiSlot;
      sameSlotRun = (slot === lastAiSlot) ? sameSlotRun + 1 : 1;
      lastAiSlot = slot;
      return slot;
    }

    function wrap(p) {
      return {
        puzzle: p,
        aiSlot: pickAiSlot(),
        tier: 'level-' + (p.level || 1),
        realId: realIdOf(p)
      };
    }

    var levelMap = {};
    for (var l = 1; l <= maxLevel; l++) {
      levelMap[l] = [];
    }
    pool.forEach(function (p) {
      var lvl = p.level || (p.meta && p.meta.level);
      if (!lvl && p.difficulty && AON.difficulty) {
        var dcfg = g.AON_CONFIG && g.AON_CONFIG.difficulty;
        var t = AON.difficulty.tier(p.difficulty, dcfg);
        lvl = t === 'easy' ? 1 : (t === 'medium' ? 2 : 4);
      }
      lvl = Math.max(1, Math.min(maxLevel, lvl || 1));
      levelMap[lvl].push(p);
    });

    var sequence = [];
    for (var lvl = 1; lvl <= maxLevel; lvl++) {
      var candidates = levelMap[lvl].slice();
      if (!candidates.length) continue;
      var fresh = candidates.filter(function (p) { return !seenReal[realIdOf(p)]; });
      var avail = fresh.length >= pairsPerLevel ? fresh : candidates;
      if (avail.length < pairsPerLevel) exhausted = true;
      var shuffled = AON.util.shuffle(avail, rng);
      var chosen = shuffled.slice(0, Math.min(pairsPerLevel, shuffled.length));
      chosen.forEach(function (p) {
        seenReal[realIdOf(p)] = 1;
        sequence.push(wrap(p));
      });
    }

    var cursor = 0;
    function draw() {
      if (cursor >= sequence.length) return null;
      return sequence[cursor++];
    }

    return {
      poolSize: pool.length,
      count: sequence.length,
      sequence: sequence,
      draw: draw,
      drawAll: function () {
        return sequence.slice();
      },
      isWidened: function () { return widened; },
      isExhausted: function () { return exhausted; }
    };
  }

  AON.selector = {
    sidesOf: sidesOf,
    realIdOf: realIdOf,
    createDeck: createDeck,
    createProgressiveDeck: createProgressiveDeck,
    adapt: adapt,
    targetForLevel: targetForLevel
  };
})(typeof window !== 'undefined' ? window : globalThis);
