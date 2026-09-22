/* test.answer-reveal.js — "谁在左、谁在右、答对没有"这一小段纯逻辑。
 *
 * ★ 它值得单独测，因为它是答案的最后一跳：
 *   selector 决定 aiSlot（随机），这里决定它落到哪个槽位、以及玩家的点击
 *   算对还是算错。写反一次，整个游戏就在骗人——而且骗得毫无征兆：
 *   玩家答对了却被告知错了，屏幕上两张图看起来都很正常。
 *
 * DOM 的部分（buildSlot / reveal / audit）在 tests/run.html 里才跑得了，
 * 这里只测纯逻辑。
 */
(function (g) {
  'use strict';
  var T = g.AON_TEST;
  var AR = g.AON.answerReveal;
  var mk = g.AON_HELPERS.mkPuzzle;

  T.describe('answer-reveal', function () {

    T.it('aiSlot=0 时 AI 在左，aiSlot=1 时 AI 在右', function () {
      var p = mk('p1');
      var a = AR.slots(p, 0);
      var b = AR.slots(p, 1);

      T.assertEquals(a.left.isAI, true);
      T.assertEquals(a.right.isAI, false);
      T.assertEquals(b.left.isAI, false);
      T.assertEquals(b.right.isAI, true);
    });

    T.it('★ 显示顺序与 manifest 里的数组顺序无关', function () {
      /* 这正是 deck 出问题的地方：位置被当成了身份。
       * 这里把数组倒过来，显示结果必须完全不变。 */
      var p = mk('p2');
      var flipped = JSON.parse(JSON.stringify(p));
      flipped.images.reverse();

      T.assertEquals(AR.slots(p, 1).left.src, AR.slots(flipped, 1).left.src);
      T.assertEquals(AR.slots(p, 0).left.src, AR.slots(flipped, 0).left.src);
    });

    T.it('view 同时给出身份与位置，且两者一致', function () {
      var p = mk('p3');
      var v = AR.slots(p, 1);
      T.assertEquals(v.order.length, 2);
      T.assertEquals(v.left, v.order[0]);
      T.assertEquals(v.right, v.order[1]);
      T.assertEquals(v.order[v.aiSlot].isAI, true);
      T.assertEquals(v.ai, v.order[v.aiSlot]);
      T.assertEquals(v.real, v.order[1 - v.aiSlot]);
    });

    T.it('不是恰好一张 AI 一张真图时返回 null，而不是猜一个', function () {
      var both = mk('p4');
      both.images[0].isAI = true;
      both.images[1].isAI = true;
      T.assertEquals(AR.slots(both, 0), null);

      var none = mk('p5');
      none.images[0].isAI = false;
      none.images[1].isAI = false;
      T.assertEquals(AR.slots(none, 0), null);

      T.assertEquals(AR.slots(null, 0), null);
      T.assertEquals(AR.slots({ images: [] }, 0), null);
    });

    T.it('isCorrect：选中的槽位等于 AI 所在的槽位', function () {
      T.assertEquals(AR.isCorrect(0, 0), true);
      T.assertEquals(AR.isCorrect(1, 1), true);
      T.assertEquals(AR.isCorrect(0, 1), false);
      T.assertEquals(AR.isCorrect(1, 0), false);
    });

    T.it('★ 没作答（超时）不判对也不判错', function () {
      T.assertEquals(AR.verdictOf(null, 0), null);
      T.assertEquals(AR.verdictOf(undefined, 1), null);
      T.assertEquals(AR.verdictOf(-1, 1), null);
      T.assertEquals(AR.isCorrect(null, 0), false, '没作答不该被算成答对');
      T.assertEquals(AR.verdictOf(0, 0), 'correct');
      T.assertEquals(AR.verdictOf(1, 0), 'wrong');
    });

    T.it('★ 两个槽位永远给出相反的结果（不会两个都对）', function () {
      for (var aiSlot = 0; aiSlot <= 1; aiSlot++) {
        var v0 = AR.verdictOf(0, aiSlot);
        var v1 = AR.verdictOf(1, aiSlot);
        T.assert(v0 !== v1, 'aiSlot=' + aiSlot + ' 时两个槽位给出了相同结果');
        T.assert(v0 === 'correct' || v0 === 'wrong');
      }
    });

    T.it('aiSlot 只认 0 / 1，别的值退回 0（AI 在左）', function () {
      var p = mk('p6');
      T.assertEquals(AR.slots(p, 5).aiSlot, 0);
      T.assertEquals(AR.slots(p, null).aiSlot, 0);
      T.assertEquals(AR.slots(p, '1').aiSlot, 0, '字符串 1 不是槽位');
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
