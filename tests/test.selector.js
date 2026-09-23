/* test.selector.js — 抽题、左右随机、去重、自适应。
 *
 * 这个文件里的两条断言直接对应整个项目最硬的两个要求：
 *   1. ★ 左右必须随机 —— 否则"永远选左边"就能通关（现有 deck 正是这个问题）
 *   2. ★ 去重必须按 realId —— 否则同一张真照片会在一局里出现两次，且泄露答案
 */
(function (g) {
  'use strict';

  var T = g.AON_TEST, S = g.AON.selector, H = g.AON_HELPERS;
  var DCFG = g.AON_CONFIG.difficulty;

  var EASY = { tells: 1, subject: 1, postprocessing: 1 };
  var HARD = { tells: 5, subject: 5, postprocessing: 5 };

  /** 把一道题的真侧 id 改成指定值 —— 用来模拟"一张真图派生多道题"。 */
  function withRealId(p, id) {
    p.images.forEach(function (im) { if (im.isAI === false) im.id = id; });
    return p;
  }

  function slotsOf(draws) { return draws.map(function (d) { return d.aiSlot; }); }
  function realIdsOf(draws) { return draws.map(function (d) { return d.realId; }); }
  function puzzleIdsOf(draws) { return draws.map(function (d) { return d.puzzle.id; }); }

  /** 最长连续同值游程。 */
  function maxRun(arr) {
    var best = arr.length ? 1 : 0, run = 1;
    for (var i = 1; i < arr.length; i++) {
      run = (arr[i] === arr[i - 1]) ? run + 1 : 1;
      if (run > best) best = run;
    }
    return best;
  }

  T.describe('selector', function () {

    /* ── sidesOf：数组顺序不携带任何信息 ─────────────────────────── */

    T.it('sidesOf 靠 isAI 判定，不靠数组顺序', function () {
      var p = H.mkPuzzle('x', EASY);
      var normal = S.sidesOf(p);
      T.assertEquals(normal.ai.id, 'x-2');
      T.assertEquals(normal.real.id, 'x-1');

      // 手工把数组倒过来 —— 答案不得因此改变
      var flipped = H.mkPuzzle('x', EASY);
      flipped.images.reverse();
      var f = S.sidesOf(flipped);
      T.assertEquals(f.ai.id, 'x-2', '★ 顺序颠倒后 AI 侧必须还是同一张图');
      T.assertEquals(f.real.id, 'x-1');
    });

    T.it('realIdOf 取真侧 id —— 这才是去重键', function () {
      var a = H.mkPuzzle('pa', EASY);      // 真图 id: pa-1
      var b = H.mkPuzzle('pb', EASY);      // 真图 id: pb-1
      T.assert(S.realIdOf(a) !== S.realIdOf(b));
      T.assertEquals(S.realIdOf(a), 'pa-1');
    });

    T.it('缺图时不抛异常', function () {
      T.assert(S.sidesOf(null).ai === null);
      T.assert(S.sidesOf({}).real === null);
      T.assertEquals(typeof S.realIdOf({ id: 'solo' }), 'string');
    });

    /* ── 左右随机：消灭"永远选左" ─────────────────────────────────── */

    T.it('★ AI 不会连续同侧超过 avoidSameAiSideRun 轮', function () {
      var pool = H.mkSet('s', 30, { tells: 3, subject: 3, postprocessing: 3 });
      for (var seed = 1; seed <= 40; seed++) {
        var deck = S.createDeck({ puzzles: pool, count: 25, seed: seed });
        var slots = slotsOf(deck.drawAll({ tier: 'medium' }));
        T.assertEquals(slots.length, 25);
        T.assert(maxRun(slots) <= g.AON_CONFIG.selector.avoidSameAiSideRun,
          '种子 ' + seed + ' 出现连续 ' + maxRun(slots) + ' 次同侧');
      }
    });

    T.it('★ 两侧都被用到 —— "永远选左"必须失效', function () {
      var pool = H.mkSet('s', 30, { tells: 3, subject: 3, postprocessing: 3 });
      var deck = S.createDeck({ puzzles: pool, count: 30, seed: 99 });
      var slots = slotsOf(deck.drawAll({ tier: 'medium' }));
      var left = slots.filter(function (s) { return s === 0; }).length;
      T.assert(left > 0 && left < slots.length,
        '一侧从未出现，等于答案固定在另一侧: left=' + left + '/' + slots.length);
      T.assert(left >= 8 && left <= 22, '左右分布过于失衡: left=' + left + '/30');
    });

    T.it('aiSlot 只会是 0 或 1', function () {
      var pool = H.mkSet('s', 20, { tells: 3, subject: 3, postprocessing: 3 });
      var deck = S.createDeck({ puzzles: pool, count: 20, seed: 7 });
      slotsOf(deck.drawAll({ tier: 'medium' })).forEach(function (s) {
        T.assert(s === 0 || s === 1, '非法 aiSlot: ' + s);
      });
    });

    /* ── 按 realId 去重 ───────────────────────────────────────────── */

    T.it('★ 同一张真图在一局里只出现一次（即使配了不同 AI 变体）', function () {
      // pa 与 pb 是【同一张真图】的两个 AI 变体；pc 是另一张真图。
      var pool = [
        withRealId(H.mkPuzzle('pa', EASY), 'real-1'),
        withRealId(H.mkPuzzle('pb', EASY), 'real-1'),
        withRealId(H.mkPuzzle('pc', EASY), 'real-2')
      ];
      var deck = S.createDeck({ puzzles: pool, count: 2, seed: 5 });
      var ids = realIdsOf(deck.drawAll({ tier: 'easy' }));
      T.assertEquals(ids.length, 2);
      T.assert(ids[0] !== ids[1],
        '★ 一局里出现了两次同一张真图 —— 看起来像 bug，而且第二题答案直接泄露');
    });

    T.it('题池充裕时，一局内 realId 全部互不相同', function () {
      var pool = H.mkSet('s', 10, EASY);
      var deck = S.createDeck({ puzzles: pool, count: 10, seed: 3 });
      var ids = realIdsOf(deck.drawAll({ tier: 'easy' }));
      T.assertEquals(new Set(ids).size, ids.length, 'realId 出现重复');
    });

    T.it('recentRealIds 跨局生效：优先出上一局没见过的那张', function () {
      var pool = H.mkSet('s', 5, EASY);   // realId: s00-1 .. s04-1
      var seen = ['s00-1', 's01-1', 's02-1', 's03-1'];

      var deck = S.createDeck({ puzzles: pool, count: 1, seed: 11, recentRealIds: seen });
      var draws = deck.drawAll({ tier: 'easy' });
      T.assertEquals(draws.length, 1);
      T.assertEquals(draws[0].realId, 's04-1', '唯一没见过的那张必须优先出');
      T.assert(!deck.isExhausted(), '还有新图时不该标记耗尽');
    });

    T.it('★ 新图用尽后回落到旧图，并【诚实标记】——这是内容池太薄的信号', function () {
      // 这条路径在只有 7 道真题时会一直触发，必须顺滑，但也不能假装没事：
      // isExhausted() 就是 dev 期该报警的地方。
      var pool = H.mkSet('s', 5, EASY);
      var deck = S.createDeck({
        puzzles: pool, count: 2, seed: 11,
        recentRealIds: ['s00-1', 's01-1', 's02-1', 's03-1']
      });
      var ids = realIdsOf(deck.drawAll({ tier: 'easy' }));
      T.assertEquals(ids[0], 's04-1', '第一张仍应是没见过的那张');
      T.assert(deck.isExhausted(), '★ 第二轮不得不复用旧图，必须标记耗尽');
      T.assert(ids[1] !== ids[0], '即便复用也不能紧邻重复');
    });

    /* ── 薄题池：必须顺滑，不能报错 ───────────────────────────────── */

    T.it('★ 只有 2 道题却要跑 5 轮：不抛异常、不出现紧邻重复', function () {
      var pool = H.mkSet('thin', 2, EASY);
      var deck = S.createDeck({ puzzles: pool, count: 5, seed: 1 });
      var draws = deck.drawAll({ tier: 'easy' });

      T.assertEquals(draws.length, 5, '题池耗尽也必须抽满这一局，而不是提前结束');
      var ids = realIdsOf(draws);
      for (var i = 1; i < ids.length; i++) {
        T.assert(ids[i] !== ids[i - 1],
          '★ 紧邻两轮是同一张真图 —— 玩家会以为游戏坏了。序列: ' + ids.join(','));
      }
      T.assert(deck.isExhausted(), '应诚实标记题池已耗尽（供 dev 警告）');
    });

    T.it('空题池：draw 返回 null，drawAll 返回空数组，绝不抛异常', function () {
      var deck = S.createDeck({ puzzles: [], count: 5, seed: 1 });
      T.assertEquals(deck.draw({ tier: 'easy' }), null);
      T.assertDeepEquals(deck.drawAll({ tier: 'easy' }), []);
      T.assertEquals(deck.poolSize, 0);
    });

    T.it('题池比一局题量少：抽满但不重复', function () {
      var pool = H.mkSet('small', 3, EASY);
      var deck = S.createDeck({ puzzles: pool, count: 3, seed: 21 });
      var ids = realIdsOf(deck.drawAll({ tier: 'easy' }));
      T.assertEquals(new Set(ids).size, 3, '三道题应当三道都出到');
    });

    /* ── 档位与放宽 ───────────────────────────────────────────────── */

    T.it('固定档位模式：只出该档的题', function () {
      var pool = H.mkSet('e', 5, EASY)
        .concat(H.mkSet('m', 5, { tells: 3, subject: 3, postprocessing: 3 }));
      var deck = S.createDeck({ puzzles: pool, count: 5, seed: 2 });
      deck.drawAll({ tier: 'easy' }).forEach(function (d) {
        T.assertEquals(d.tier, 'easy');
      });
    });

    T.it('★ 档位池为空时自动放宽，并诚实标记 —— 不当成错误', function () {
      var pool = H.mkSet('e', 4, EASY);      // 只有 easy 题
      var deck = S.createDeck({ puzzles: pool, count: 3, seed: 4 });
      var draws = deck.drawAll({ tier: 'hard' });   // 请求 hard，一道都没有
      T.assertEquals(draws.length, 3, '放宽后仍须抽满，而不是给一道空题');
      T.assert(deck.isWidened(), '必须标记已放宽，供 dev 期警告');
      T.assert(draws.every(function (d) { return !!d.puzzle; }), '不得返回空题');
    });

    T.it('hard 池只收已核验的题', function () {
      var pool = [
        H.mkPuzzle('hv', HARD, { verifiedSolution: true }),
        H.mkPuzzle('hu1', HARD, { verifiedSolution: false }),
        H.mkPuzzle('hu2', HARD, { verifiedSolution: false })
      ];
      var deck = S.createDeck({ puzzles: pool, count: 1, seed: 6 });
      var d = deck.draw({ tier: 'hard' });
      T.assertEquals(d.puzzle.id, 'hv',
        '★ 出到了未核验的 hard 题 —— 玩家会遇到连作者都没找到破绽的题');
      T.assert(!deck.isWidened(), '有合规题时不应触发放宽');
    });

    T.it('自适应模式按连续分数选最近的题', function () {
      var pool = H.mkSet('e', 3, EASY)
        .concat(H.mkSet('h', 3, HARD));
      var deck = S.createDeck({ puzzles: pool, count: 3, seed: 8 });
      var target = { score: 1.0, window: 0.15 };   // 明确要最难
      var draws = deck.drawAll(target);
      T.assertEquals(draws.length, 3);
      T.assert(draws[0].tier === 'hard', '目标分数 1.0 应选到 hard，实际 ' + draws[0].tier);
    });

    /* ── 种子可复现 ───────────────────────────────────────────────── */

    T.it('★ 同种子 ⇒ 完全相同的牌堆（bug 可工单化）', function () {
      var pool = H.mkSet('s', 12, { tells: 3, subject: 3, postprocessing: 3 });
      var a = S.createDeck({ puzzles: pool, count: 8, seed: 12345 }).drawAll({ tier: 'medium' });
      var b = S.createDeck({ puzzles: pool, count: 8, seed: 12345 }).drawAll({ tier: 'medium' });
      T.assertDeepEquals(puzzleIdsOf(a), puzzleIdsOf(b), '题序应可复现');
      T.assertDeepEquals(slotsOf(a), slotsOf(b), '左右分配也应可复现');
    });

    T.it('不同种子 ⇒ 不同牌堆（否则种子没接上）', function () {
      var pool = H.mkSet('s', 12, { tells: 3, subject: 3, postprocessing: 3 });
      var a = S.createDeck({ puzzles: pool, count: 10, seed: 1 }).drawAll({ tier: 'medium' });
      var b = S.createDeck({ puzzles: pool, count: 10, seed: 2 }).drawAll({ tier: 'medium' });
      T.assert(JSON.stringify(puzzleIdsOf(a)) !== JSON.stringify(puzzleIdsOf(b)),
        '不同种子产生了相同牌堆 —— RNG 没有真正被使用');
    });

    T.it('不传种子也能跑（退回固定种子而非 Math.random）', function () {
      var pool = H.mkSet('s', 5, EASY);
      var a = S.createDeck({ puzzles: pool, count: 5 }).drawAll({ tier: 'easy' });
      var b = S.createDeck({ puzzles: pool, count: 5 }).drawAll({ tier: 'easy' });
      T.assertDeepEquals(puzzleIdsOf(a), puzzleIdsOf(b),
        '无种子时应可复现（用固定默认种子，不用 Math.random）');
    });

    T.it('不修改传入的题池', function () {
      var pool = H.mkSet('s', 4, EASY);
      var before = JSON.stringify(pool);
      S.createDeck({ puzzles: pool, count: 4, seed: 1 }).drawAll({ tier: 'easy' });
      T.assertEquals(JSON.stringify(pool), before, '抽题不得改动题池');
    });

    T.it('每张牌都带着 puzzle / aiSlot / tier / realId 四件套', function () {
      var pool = H.mkSet('s', 4, EASY);
      var deck = S.createDeck({ puzzles: pool, count: 4, seed: 1 });
      deck.drawAll({ tier: 'easy' }).forEach(function (d) {
        T.assert(d.puzzle && d.puzzle.id, '缺 puzzle');
        T.assert(d.aiSlot === 0 || d.aiSlot === 1, '缺 aiSlot');
        T.assert(['easy', 'medium', 'hard'].indexOf(d.tier) >= 0, '缺 tier');
        T.assert(typeof d.realId === 'string' && d.realId, '缺 realId');
      });
    });

    /* ── 自适应 ───────────────────────────────────────────────────── */

    T.describe('adapt', function () {

      T.it('连对 upAfterCorrectStreak 次升一级', function () {
        var cfg = g.AON_CONFIG.adapt;
        var s = { kidLevel: 2, correctStreak: 0 };
        for (var i = 1; i < cfg.upAfterCorrectStreak; i++) {
          T.assertEquals(S.adapt(s, true, cfg), 2, '还不到升级所需的连对次数');
        }
        T.assertEquals(S.adapt(s, true, cfg), 3, '应升到 3');
        T.assertEquals(s.correctStreak, 0, '升级后连对应归零');
      });

      T.it('答错一次立刻降一级', function () {
        var s = { kidLevel: 3, correctStreak: 1 };
        T.assertEquals(S.adapt(s, false), 2);
        T.assertEquals(s.correctStreak, 0);
      });

      T.it('降级不快于每次一档 —— 对孩子不能太狠', function () {
        var s = { kidLevel: 5, correctStreak: 4 };
        T.assertEquals(S.adapt(s, false), 4, '一次只能降一档');
      });

      T.it('上下界被封住', function () {
        var hi = { kidLevel: 5, correctStreak: 0 };
        for (var i = 0; i < 10; i++) S.adapt(hi, true);
        T.assertEquals(hi.kidLevel, g.AON_CONFIG.difficulty.kidLevels);

        var lo = { kidLevel: 1, correctStreak: 0 };
        for (var j = 0; j < 10; j++) S.adapt(lo, false);
        T.assertEquals(lo.kidLevel, 1);
      });

      T.it('targetForLevel 覆盖整条 0..1 区间且单调', function () {
        var n = g.AON_CONFIG.difficulty.kidLevels;
        var prev = -1;
        for (var lvl = 1; lvl <= n; lvl++) {
          var tgt = S.targetForLevel(lvl);
          T.assert(tgt.score > 0 && tgt.score < 1, '目标分越界: ' + tgt.score);
          T.assert(tgt.score > prev, '目标分应随等级单调上升');
          T.assertEquals(tgt.window, g.AON_CONFIG.adapt.window);
          prev = tgt.score;
        }
      });
    });

    /* ── Progressive Deck（难度阶梯爬升） ───────────────────────── */

    T.describe('createProgressiveDeck', function () {
      function mkLevelSet() {
        var out = [];
        for (var l = 1; l <= 4; l++) {
          for (var i = 1; i <= 3; i++) {
            var p = H.mkPuzzle('p_l' + l + '_' + i, { tells: l, subject: l, postprocessing: l });
            p.level = l;
            out.push(p);
          }
        }
        return out;
      }

      T.it('严格按照 Level 1 -> Level 2 -> Level 3 -> Level 4 爬升', function () {
        var pool = mkLevelSet();
        var deck = S.createProgressiveDeck({ puzzles: pool, pairsPerLevel: 1, seed: 42 });
        var cards = deck.drawAll();
        T.assertEquals(cards.length, 4);
        T.assertDeepEquals(cards.map(function (c) { return c.puzzle.level; }), [1, 2, 3, 4]);
      });

      T.it('pairsPerLevel=2 时每级抽取两题，总题量为 8', function () {
        var pool = mkLevelSet();
        var deck = S.createProgressiveDeck({ puzzles: pool, pairsPerLevel: 2, seed: 123 });
        var cards = deck.drawAll();
        T.assertEquals(cards.length, 8);
        T.assertDeepEquals(cards.map(function (c) { return c.puzzle.level; }), [1, 1, 2, 2, 3, 3, 4, 4]);
      });

      T.it('左右槽位随机且无超长连续', function () {
        var pool = mkLevelSet();
        for (var seed = 1; seed <= 20; seed++) {
          var deck = S.createProgressiveDeck({ puzzles: pool, pairsPerLevel: 2, seed: seed });
          var slots = deck.drawAll().map(function (c) { return c.aiSlot; });
          T.assert(maxRun(slots) <= g.AON_CONFIG.selector.avoidSameAiSideRun,
            '种子 ' + seed + ' 同侧游程超标: ' + maxRun(slots));
        }
      });

      T.it('一局全对总分精确等于总题数（每题平均分配 1 分）', function () {
        var pool = mkLevelSet();
        var deck = S.createProgressiveDeck({ puzzles: pool, pairsPerLevel: 1, seed: 99 });
        var cards = deck.drawAll();
        var total = 0;
        var sess = { pairsPerLevel: 1, maxLevel: 4, streak: 0 };
        cards.forEach(function (card) {
          var pts = g.AON.scoring.roundPoints({ puzzle: card.puzzle, correct: true }, sess);
          T.assertEquals(pts, 1, '每题得分为 1');
          total += pts;
        });
        T.assertEquals(total, cards.length, '全对总积分精确等于总题数');
      });
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
