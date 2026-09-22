/* test.dom.answer-reveal.js — 【只在浏览器里跑】"答案不进 DOM"的守卫本身。
 *
 * ★ 为什么必须有这个文件：audit / assertClean 是"揭晓前活 DOM 里没有任何东西
 *   指明哪张是 AI"这条最重要的规则的机器化检查。而一个【从不触发】的守卫
 *   比没有守卫更糟——它给人虚假的安全感，还占着"这条已经查过了"的位置。
 *   所以守卫自己要被测：每一条泄露路径都要能抓住，且合法的槽位属性不能误报。
 *
 * 误报同样要防：如果 data-slot / data-zoom 这类槽位属性会触发警报，
 * 真正的泄露就会淹在噪音里，最后的结果是没人再看这个警告。
 *
 * 文件名里的 .dom. 是约定：tests/run.js 会跳过 test.dom.*，
 * 因为 Node 里没有 document。run.html 会加载它。
 */
(function (g) {
  'use strict';
  var T = g.AON_TEST;
  var AR = g.AON.answerReveal;

  /* 每个用例自己造一块牌子，跑完就丢掉——避免用例之间互相污染。 */
  function withBoard(fn) {
    var b = g.document.createElement('div');
    g.document.body.appendChild(b);
    try { return fn(b); } finally { b.remove(); }
  }

  T.describe('answer-reveal · DOM 守卫', function () {

    T.it('干净牌面不报警', function () {
      var clean = withBoard(function (b) {
        b.innerHTML = '<div class="card-slot">' +
          '<button class="card" data-slot="0"><img alt="prent A"></button>' +
          '<button class="zoom-btn" data-zoom="0">+</button></div>';
        return AR.audit(b).length;
      });
      T.assertEquals(clean, 0, '尚未揭晓的正常牌面不该有告警');
    });

    T.it('★ 七个泄露属性一个都不能漏', function () {
      ['data-is-ai', 'data-ai', 'data-real', 'data-answer',
       'data-role', 'data-verdict', 'data-picked'].forEach(function (attr) {
        var n = withBoard(function (b) {
          var d = g.document.createElement('div');
          d.setAttribute(attr, '1');
          b.appendChild(d);
          return AR.audit(b).length;
        });
        T.assertEquals(n, 1, attr + ' 没有被抓住');
      });
    });

    T.it('★ 类名泄露也要抓（AI / real / echt / fake / answer / solution）', function () {
      ['ai', 'real', 'echt', 'fake', 'answer', 'solution'].forEach(function (c) {
        var n = withBoard(function (b) {
          var d = g.document.createElement('div');
          d.className = 'card ' + c;
          b.appendChild(d);
          return AR.audit(b).length;
        });
        T.assert(n >= 1, 'class="' + c + '" 没有被抓住');
      });
      /* 子串不算：'ai' 出现在 'paint' 里不该误报 */
      var sub = withBoard(function (b) {
        var d = g.document.createElement('div');
        d.className = 'painted';
        b.appendChild(d);
        return AR.audit(b).length;
      });
      T.assertEquals(sub, 0, 'painted 含 ai 子串，但不该误报');
    });

    T.it('★ 槽位属性不能误报——噪音会让真泄露被忽略', function () {
      var n = withBoard(function (b) {
        b.innerHTML = '<div class="card-slot">' +
          '<div data-slot="1"></div><div data-zoom="1"></div>' +
          '<div class="zoom-btn"></div></div>';
        return AR.audit(b).length;
      });
      T.assertEquals(n, 0, 'data-slot / data-zoom / card-slot / zoom-btn 都是槽位，不是身份');
    });

    T.it('assertClean 返回布尔，且与 audit 一致', function () {
      var clean = withBoard(function (b) {
        b.innerHTML = '<div class="card" data-slot="0"></div>';
        return AR.assertClean(b);
      });
      T.assertEquals(clean, true);

      var dirty = withBoard(function (b) {
        b.innerHTML = '<div data-role="ai"></div>';
        return AR.assertClean(b);
      });
      T.assertEquals(dirty, false, '有泄露时必须返回 false，而不是抛异常');
    });

    T.it('★ 揭晓前 buildSlot 造不出带答案的节点', function () {
      /* 结构保证：buildSlot 收不到谜题、也收不到 isAI，所以它【写不出来】。
       * 这里用一道"两张都是 AI"的坏题来验证它不会顺手把 isAI 抄进 DOM。 */
      var host = g.document.createElement('div');
      g.document.body.appendChild(host);
      try {
        var node = AR.buildSlot({
          slot: 0,
          image: { src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', width: 1, height: 1, isAI: true },
          lang: 'nl'
        });
        host.appendChild(node);
        T.assertEquals(AR.audit(host).length, 0,
          'buildSlot 的输出里出现了答案线索 —— 结构保证被破坏了');
        T.assertEquals(host.querySelectorAll('[data-is-ai]').length, 0);
      } finally {
        host.remove();
      }
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
