/* test.dom.events.js — 【只在浏览器里跑】AON.dom.on 委托语义的守卫。
 *
 * ★ 为什么必须有这个文件：
 *   attract 屏的"整屏点击"挂在 <section> 自己身上（dom.on(section,'click','*',…)），
 *   而那一屏几乎整页都是空白 —— 玩家点在文字以外的地方，ev.target 正是 section 本身。
 *   委托循环当时写的是 `while (t && t !== root)`，【永远不检查 root 自己】，
 *   于是点空白处毫无反应。而代码逐行读起来完全合理：
 *     循环遍历祖先链，命中选择器就调用 —— 谁会想到"起点"被排除在外了？
 *   更麻烦的是它躲过了所有既有测试：autoplay 直接调 startSession()，从不派发点击；
 *   --dump-dom 只看 body[data-screen]，那个属性确实变了。整整一层输入路径无人覆盖。
 *
 * ★ 两个方向都要守，缺一不可：
 *   漏掉 root 自己 → 点空白处没反应（实际发生的 bug）。
 *   越过 root 往上找 → 外层元素会误触发内层 root 的委托，是"修过头"。
 *   只测第一个方向的话，把循环改成 `while (t)` 也能全绿，而那是错的。
 *
 * ★ 本文件【只覆盖 DOM 事件层】。同批修掉的另外三条是样式层的，这里测不到：
 *     · .attract 的 display 与 .screen 打平（components.css）
 *     · 作者样式的 display 压过 UA 的 [hidden]（base.css）
 *     · 答题屏高度与面板收缩（base.css / layout.css）
 *   它们要么靠计算样式、要么靠真实布局，而这个测试页并不加载项目 CSS。
 *   在这里塞一份 CSS 规则的副本去测，测到的是副本而不是真货 —— 那是假的安全感。
 *   这三条由浏览器里的真实点击验收覆盖（见 README 的手工验收清单）。
 *
 * 文件名里的 .dom. 是约定：tests/run.js 会跳过 test.dom.*（Node 里没有 document），
 * run.html 会加载它。
 */
(function (g) {
  'use strict';
  var T = g.AON_TEST;
  var dom = g.AON.dom;

  /* 每个用例自己搭一棵树，跑完就拆 —— 避免用例之间互相污染。 */
  function withTree(html, fn) {
    var box = g.document.createElement('div');
    box.innerHTML = html;
    g.document.body.appendChild(box);
    try { return fn(box); } finally { box.remove(); }
  }

  T.describe('dom.on · 事件委托', function () {

    T.it('点击 root 本身且 root 匹配选择器 → 触发（回归：这条曾经不触发）', function () {
      withTree('<section class="attract"></section>', function (box) {
        var root = box.firstChild;
        var hits = [];
        dom.on(root, 'click', '*', function (ev, t) { hits.push(t); });
        root.click();
        T.assertEquals(hits.length, 1, '点在 root 自己身上也应当触发');
        T.assertEquals(hits[0], root, '回调收到的应当是 root 自己');
      });
    });

    T.it('点击后代且后代匹配选择器 → 触发，回调拿到的是那个后代', function () {
      withTree('<div class="root"><button class="btn">x</button></div>', function (box) {
        var root = box.firstChild, btn = root.firstChild;
        var hits = [];
        dom.on(root, 'click', '.btn', function (ev, t) { hits.push(t); });
        btn.click();
        T.assertEquals(hits.length, 1);
        T.assertEquals(hits[0], btn);
      });
    });

    T.it('点在更深的子节点上 → 向上找到匹配的祖先', function () {
      withTree('<div class="root"><button class="btn"><span>deep</span></button></div>', function (box) {
        var root = box.firstChild, btn = root.firstChild, span = btn.firstChild;
        var hits = [];
        dom.on(root, 'click', '.btn', function (ev, t) { hits.push(t); });
        span.click();
        T.assertEquals(hits.length, 1);
        T.assertEquals(hits[0], btn, '应当是向上找到的 .btn，而不是 span');
      });
    });

    T.it('root 内没有任何元素匹配 → 不触发', function () {
      withTree('<div class="root"><span class="plain">x</span></div>', function (box) {
        var root = box.firstChild;
        var n = 0;
        dom.on(root, 'click', '.btn', function () { n++; });
        root.firstChild.click();
        T.assertEquals(n, 0, '.plain 不该触发 .btn 的委托');
      });
    });

    /* ★ 反方向：修过头的样子。去掉 `if (t === root) return;` 改成 `while (t)`，
     *   循环会越过 root 继续往上爬，匹配到外层祖先 —— 外层元素的点击就会
     *   误触发挂在内层 root 上的处理器。这条用例专门钉住这个边界。 */
    T.it('选择器只匹配 root 的【祖先】→ 不触发（不许越过 root 往上找）', function () {
      withTree('<div class="outer"><div class="root"><span>x</span></div></div>', function (box) {
        var outer = box.firstChild, root = outer.firstChild;
        var n = 0;
        dom.on(root, 'click', '.outer', function () { n++; });
        root.firstChild.click();
        T.assertEquals(n, 0, '委托的视野只到 root 为止；越过 root 会误伤外层');
      });
    });

    T.it('回调同时拿到事件对象与命中的元素', function () {
      withTree('<div class="root"><button class="btn">x</button></div>', function (box) {
        var root = box.firstChild, btn = root.firstChild;
        var seen = null;
        dom.on(root, 'click', '.btn', function (ev, t) { seen = { ev: ev, t: t }; });
        btn.click();
        T.assert(seen !== null, '回调应当被调用');
        T.assert(!!seen.ev && seen.ev.type === 'click', '第一个参数应当是 click 事件');
        T.assertEquals(seen.t, btn, '第二个参数应当是被委托命中的元素');
        T.assertEquals(seen.ev.target, btn, '事件目标应当还是真正被点的那个');
      });
    });

    T.it('返回的函数能解绑', function () {
      withTree('<div class="root"><button class="btn">x</button></div>', function (box) {
        var root = box.firstChild, btn = root.firstChild;
        var n = 0;
        var off = dom.on(root, 'click', '.btn', function () { n++; });
        btn.click();
        T.assertEquals(n, 1, '解绑前应当触发一次');
        off();
        btn.click();
        T.assertEquals(n, 1, '解绑后不该再触发');
      });
    });

  });
})(typeof window !== 'undefined' ? window : globalThis);
