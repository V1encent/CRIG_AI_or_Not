/* dom.js — 薄薄的 DOM 辅助层。
 *
 * ★ 本文件【只在浏览器里加载】，不进 tests/run.js 的 SOURCES：
 *   Node 侧的测试刻意不提供 document，好让任何意外的 DOM 耦合立刻暴露。
 *   所以这里放的都是"本来就该碰 DOM"的东西，不假装自己是纯函数。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});
  var d = g.document;

  function $(sel, root) { return (root || d).querySelector(sel); }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || d).querySelectorAll(sel));
  }

  function el(tag, attrs, children) {
    var n = d.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'dataset') Object.keys(v).forEach(function (dk) { n.dataset[dk] = v[dk]; });
      else n.setAttribute(k, v);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  /**
   * 把静态 HTML 里的 data-i18n 标记填上当前语言的文案。
   *
   * 为什么用属性标记而不是"JS 生成整棵树"：
   *   整棵树用 JS 生成会让 index.html 变成一个空壳，SEO / 无脚本降级全没了，
   *   而且 CSS 类名与 JS 里的字符串会慢慢分叉。
   *   静态骨架 + 属性标记让 HTML 仍然是可读的、真实的文档。
   *
   *   data-i18n="key"        → textContent
   *   data-i18n-aria="key"   → aria-label
   *   data-i18n-title="key"  → title
   *   data-i18n-ph="key"     → placeholder
   */
  function applyI18n(root, lang) {
    var i18n = AON.i18n;
    root = root || d;
    $$('[data-i18n]', root).forEach(function (n) {
      n.textContent = i18n.t(n.getAttribute('data-i18n'), lang);
    });
    $$('[data-i18n-aria]', root).forEach(function (n) {
      n.setAttribute('aria-label', i18n.t(n.getAttribute('data-i18n-aria'), lang));
    });
    $$('[data-i18n-title]', root).forEach(function (n) {
      n.setAttribute('title', i18n.t(n.getAttribute('data-i18n-title'), lang));
    });
    $$('[data-i18n-ph]', root).forEach(function (n) {
      n.setAttribute('placeholder', i18n.t(n.getAttribute('data-i18n-ph'), lang));
    });
  }

  /**
   * ★ kiosk 会话清除的核心一步：释放已解码的位图。
   *
   * 只把元素移出 DOM 是不够的——浏览器会把解码后的位图留在缓存里，
   * 在展台那种一整天不停换人的场景下，这是唯一会真正累积的内存。
   * 必须先把 src 清空，让浏览器有机会回收。
   */
  function releaseMedia(root) {
    $$('img', root).forEach(function (img) {
      img.removeAttribute('src');
      img.removeAttribute('srcset');
      /* 从 DOM 里摘掉。留在文档里的话，某些浏览器会重新发起请求。 */
      if (img.parentNode) img.parentNode.removeChild(img);
    });
    /* 放大浮层与教学聚焦图用的是 background-image，同样要清。 */
    $$('[style*="background-image"]', root).forEach(function (n) {
      n.style.backgroundImage = '';
    });
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function show(node, on) {
    if (!node) return;
    if (on) node.removeAttribute('hidden');
    else node.setAttribute('hidden', '');
  }

  /* 事件委托。用委托而不是逐元素绑定，是因为卡片每轮重建——
   * 逐元素绑定需要成对的解绑，漏一处就是一个内存泄漏。 */
  function on(root, type, selector, fn, opts) {
    function handler(ev) {
      var t = ev.target;
      /* ★ 必须【走到 root 本身】再停，不能"到 root 就停"（`while (t && t !== root)`）。
       *
       *   attract 屏的"整屏点击"就挂在那块 section 上，而那一屏几乎整页都是空白：
       *   点空白处时 ev.target 正是 section 自己。把 root 排除在外，
       *   玩家点在文字以外的地方就完全没有反应——而代码逐行读起来毫无问题，
       *   测试也不报错（autoplay 直接调函数，从不派发点击）。
       *
       *   对其它监听点无副作用：root 是 #board / #teach-wrap / 各屏 section，
       *   它们本来就不匹配 .card / .zoom-btn / #menu-start。 */
      while (t) {
        if (t.matches && t.matches(selector)) { fn.call(t, ev, t); return; }
        if (t === root) return;
        t = t.parentNode;
      }
    }
    root.addEventListener(type, handler, opts);
    return function () { root.removeEventListener(type, handler, opts); };
  }

  AON.dom = {
    $: $, $$: $$, el: el,
    applyI18n: applyI18n,
    releaseMedia: releaseMedia,
    clear: clear,
    show: show,
    on: on,
    /** 当前可见的屏幕 section（调试与自检用）。 */
    activeScreen: function () { return $('.screen:not([hidden])'); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
