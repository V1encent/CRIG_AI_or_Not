/* test.difficulty.js — 三轴难度的黄金用例。
 *
 * 这是全项目风险最高的一块：如果分数算错，整个难度菜单就是假的，
 * 而假难度菜单从界面上完全看不出来（题照样出，只是分档没有意义）。
 */
(function (g) {
  'use strict';

  var T = g.AON_TEST, D = g.AON.difficulty, F = g.AON_FIXTURES;
  var HELPERS = g.AON_HELPERS;

  T.describe('difficulty', function () {

    T.it('黄金用例表：分数与档位逐条吻合', function () {
      F.cases.forEach(function (c) {
        T.assertClose(D.score(c.d), c.score, 1e-9, c.why);
        T.assertEquals(D.tier(c.d), c.tier, c.why);
      });
    });

    T.it('阈值边界：≤ 是含的（用二进制精确值测，不测浮点噪声）', function () {
      F.boundaries.forEach(function (c) {
        var cfg = c.cfg === 'exact' ? F.exactCfg : null;
        T.assertClose(D.score(c.d, cfg), c.score, 1e-12, c.why);
        T.assertEquals(D.tier(c.d, cfg), c.tier, c.why);
      });
    });

    T.it('两条轴真的会互相抵消 —— 这是三轴模型存在的理由', function () {
      // 简单场景里的细微错误 vs 复杂场景里的明显错误。
      // 单一 hard 标签无法区分这两者，而它们应当同档。
      var subtle = { tells: 5, subject: 1, postprocessing: 1 };
      var obvious = { tells: 1, subject: 5, postprocessing: 5 };
      T.assertEquals(D.tier(subtle), D.tier(obvious),
        '这两道题必须落在同一档，否则轴权重配错了');
      T.assert(Math.abs(D.score(subtle) - D.score(obvious)) < 0.15,
        '两者分数不应相差太远');
    });

    T.it('缺轴 → 变容易，绝不被重新归一化', function () {
      // 只评了 tells，另两轴未评。
      var partial = { tells: 5 };
      T.assertClose(D.score(partial), 0.45, 1e-9);
      // 若错误地按 weightSum=0.45 重新归一化，会得到 1.0 → hard。
      // 那是最糟的失败方向：未评分的题看起来比实际更难。
      T.assert(D.score(partial) < 1.0, '缺轴不得把分数推满');
      T.assertEquals(D.tier(partial), 'medium', '缺轴应落 medium 而非 hard');
    });

    T.it('完全没有评分 → 0 分而不是 NaN', function () {
      T.assertEquals(D.score({}), 0);
      T.assertEquals(D.score(null), 0);
      T.assertEquals(D.score(undefined), 0);
      T.assertEquals(D.tier({}), 'easy');
    });

    T.it('非数值轴按缺失处理，不产生 NaN', function () {
      T.assertEquals(D.score({ tells: 'x', subject: null, postprocessing: undefined }), 0);
      T.assertEquals(D.score({ tells: NaN, subject: Infinity, postprocessing: -Infinity }), 0,
        'NaN/Infinity 都不是有效评分');
    });

    T.it('越界输入被 clamp，不溢出', function () {
      T.assertClose(D.score({ tells: 99, subject: -5, postprocessing: 3 }), 0.575, 1e-9);
      T.assertEquals(D.score({ tells: 1e9, subject: 1e9, postprocessing: 1e9 }), 1);
      T.assertEquals(D.score({ tells: -1e9, subject: -1e9, postprocessing: -1e9 }), 0);
    });

    T.it('分数恒在 [0,1] 内（随机扫一遍）', function () {
      var rng = g.AON.util.mulberry32(4242);
      for (var i = 0; i < 500; i++) {
        var d = { tells: rng() * 10 - 2.5, subject: rng() * 10 - 2.5, postprocessing: rng() * 10 - 2.5 };
        var s = D.score(d);
        T.assert(s >= 0 && s <= 1, '越界分数 ' + s);
      }
    });

    T.it('tier 与 kidLevel 出自同一分数，永不失配', function () {
      var rng = g.AON.util.mulberry32(77);
      for (var i = 0; i < 300; i++) {
        var d = { tells: 1 + rng() * 4, subject: 1 + rng() * 4, postprocessing: 1 + rng() * 4 };
        var lvl = D.kidLevel(d);
        T.assert(lvl >= 1 && lvl <= 5, 'kidLevel 越界: ' + lvl);
      }
      // 单调性：分数升，档位绝不降
      var prev = -1;
      for (var j = 0; j <= 20; j++) {
        var x = 1 + (j / 20) * 4;
        var l = D.kidLevel({ tells: x, subject: x, postprocessing: x });
        T.assert(l >= prev, 'kidLevel 在分数上升时下降了');
        prev = l;
      }
    });

    T.it('kidLevel 上下界被封住', function () {
      T.assertEquals(D.kidLevel({ tells: 1, subject: 1, postprocessing: 1 }), 1);
      T.assertEquals(D.kidLevel({ tells: 5, subject: 5, postprocessing: 5 }), 5);
    });

    T.it('eligibleForTier：hard 额外要求人工确认过破绽', function () {
      var cfg = g.AON_CONFIG.difficulty;
      var hardVerified = HELPERS.mkPuzzle('h1', { tells: 5, subject: 5, postprocessing: 5 },
        { verifiedSolution: true });
      var hardUnverified = HELPERS.mkPuzzle('h2', { tells: 5, subject: 5, postprocessing: 5 },
        { verifiedSolution: false });

      T.assertEquals(D.tier(hardVerified.difficulty), 'hard', '前置条件：这确实是 hard');
      T.assert(D.eligibleForTier(hardVerified, 'hard', cfg), '已核验的 hard 题应入池');
      T.assert(!D.eligibleForTier(hardUnverified, 'hard', cfg),
        '★ 未核验的 hard 题必须被排除 —— 否则玩家会遇到一道连作者都没找到破绽的题');
    });

    T.it('eligibleForTier：非 hard 档不看 verifiedSolution', function () {
      var cfg = g.AON_CONFIG.difficulty;
      var easyUnverified = HELPERS.mkPuzzle('e1', { tells: 1, subject: 1, postprocessing: 1 });
      T.assert(D.eligibleForTier(easyUnverified, 'easy', cfg));
      T.assert(!D.eligibleForTier(easyUnverified, 'hard', cfg));
    });

    T.it('explain 对任意输入都返回字符串', function () {
      [{}, null, undefined, { tells: 5 }, { tells: 1, subject: 5, postprocessing: 5 }]
        .forEach(function (d) {
          T.assertEquals(typeof D.explain(d), 'string', 'explain 必须总是返回字符串');
        });
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
