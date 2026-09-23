/* test.scoring.js — 计分与段位。
 *
 * 全年龄前提：段位没有失败措辞，连击从不显示为损失。
 * 所以这里断言的是"边界不残忍"，而不只是"算术正确"。
 */
(function (g) {
  'use strict';

  var T = g.AON_TEST, S = g.AON.scoring, CFG = g.AON_CONFIG.scoring;

  T.describe('scoring', function () {

    T.it('答错恒为 0 分', function () {
      [{ correct: false, tier: 'hard' }, { correct: false, tier: 'easy' },
       null, undefined, {}].forEach(function (r) {
        T.assertEquals(S.roundPoints(r, { streak: 9 }), 0);
      });
    });

    T.it('答对得分恒为非负整数', function () {
      ['easy', 'medium', 'hard', 'bogus', undefined].forEach(function (tier) {
        for (var streak = 0; streak < 60; streak++) {
          var p = S.roundPoints({ correct: true, tier: tier }, { streak: streak });
          T.assert(Number.isInteger(p), '得分必须是整数，实际 ' + p);
          T.assert(p >= 0, '得分不得为负');
        }
      });
    });

    T.it('难的题更值钱', function () {
      var s = { streak: 0 };
      var e = S.roundPoints({ correct: true, tier: 'easy' }, s);
      var m = S.roundPoints({ correct: true, tier: 'medium' }, s);
      var h = S.roundPoints({ correct: true, tier: 'hard' }, s);
      T.assert(e < m && m < h, '底分应随难度递增: ' + e + '/' + m + '/' + h);
    });

    T.it('未知档位回退到 medium，而不是 NaN', function () {
      T.assertEquals(S.roundPoints({ correct: true, tier: 'nonsense' }, { streak: 0 }),
        CFG.base.medium);
    });

    T.it('★ 连击系数有上限 —— 否则一个运气好的孩子会刷出无法超越的分数', function () {
      var atCap = S.roundPoints({ correct: true, tier: 'hard' }, { streak: CFG.streakCap });
      var wayPast = S.roundPoints({ correct: true, tier: 'hard' }, { streak: 5000 });
      T.assertEquals(wayPast, atCap, '超过上限后不得继续增长');
      var maxMult = 1 + CFG.streakStep * CFG.streakCap;
      T.assert(atCap <= Math.round(CFG.base.hard * maxMult) + 1, '上限系数应生效');
    });

    T.it('连击为 0 / 缺失 / 负数时不惩罚', function () {
      var base = CFG.base.medium;
      T.assertEquals(S.roundPoints({ correct: true, tier: 'medium' }, { streak: 0 }), base);
      T.assertEquals(S.roundPoints({ correct: true, tier: 'medium' }, {}), base);
      T.assertEquals(S.roundPoints({ correct: true, tier: 'medium' }, null), base);
      T.assertEquals(S.roundPoints({ correct: true, tier: 'medium' }, { streak: -5 }), base,
        '负连击不该扣分');
    });

    T.it('段位按比例，任何题量都成立', function () {
      T.assertEquals(S.rank(5, 5).id, 'hunter');
      T.assertEquals(S.rank(4, 5).id, 'detective');
      T.assertEquals(S.rank(3, 5).id, 'spotter');
      T.assertEquals(S.rank(2, 5).id, 'rookie');
      T.assertEquals(S.rank(0, 5).id, 'rookie');

      T.assertEquals(S.rank(8, 8).id, 'hunter');
      T.assertEquals(S.rank(7, 8).id, 'detective');
      T.assertEquals(S.rank(4, 8).id, 'spotter');
    });

    T.it('段位边界是含的', function () {
      T.assertEquals(S.rank(1, 2).id, 'spotter', '0.5 应为 spotter');
      T.assertEquals(S.rank(4, 5).id, 'detective', '0.8 应为 detective');
      T.assertEquals(S.rank(1, 1).id, 'hunter');
    });

    T.it('★ 0 题 或 0 答对 都不得产生失败措辞', function () {
      // 全错的段位是路人级，不是"失败"——对全年龄很重要
      T.assertEquals(S.rank(0, 5).id, 'rookie');
      var zero = S.rank(0, 0);
      T.assertEquals(zero.id, 'rookie', '不能除以 0');
      T.assertEquals(zero.ratio, 0);
      T.assert(Number.isFinite(zero.ratio), 'ratio 不得为 NaN');
    });

    T.it('每个段位 id 都有对应的 i18n 文案（含提示语）', function () {
      ['rookie', 'spotter', 'detective', 'hunter'].forEach(function (id) {
        ['nl', 'en'].forEach(function (lang) {
          T.assert(g.AON.i18n.DICT[lang]['rank.' + id],
            lang + ' 缺 rank.' + id);
          T.assert(g.AON.i18n.DICT[lang]['rank.' + id + '.note'],
            lang + ' 缺 rank.' + id + '.note');
        });
      });
    });

    T.it('stars 恒为 1..3', function () {
      for (var c = 0; c <= 10; c++) {
        var r = S.rank(c, 10);
        T.assert(r.stars >= 1 && r.stars <= 3, 'stars 越界: ' + r.stars);
      }
    });

    /* ── 均分制阶梯爬升计分 ────────────────────────────────────────── */

    T.describe('progressive scoring (equal distribution)', function () {
      [1, 2, 3, 4].forEach(function (k) {
        T.it('pairsPerLevel=' + k + ' 时每道题平均分配 1 分且全对总分等于总题数', function () {
          var session = { pairsPerLevel: k, maxLevel: 6, total: 6 * k, results: [] };
          var total = 0;

          for (var lvl = 1; lvl <= 6; lvl++) {
            for (var i = 0; i < k; i++) {
              var round = { puzzle: { level: lvl }, correct: true };
              var pts = S.roundPoints(round, session);
              T.assertEquals(pts, 1, '每道题得分均固定为 1 分');
              total += pts;
              session.results.push(round);
            }
          }

          T.assertEquals(total, 6 * k, '全对总分必须精确等于总题数');
        });
      });
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
