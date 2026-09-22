/* util.js — 小工具。无 DOM 依赖的部分也在这里，好让纯逻辑模块能共用。
 *
 * 约束：本文件不应触碰 DOM（storage 除外，它已做防御）。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }

  /* mulberry32 — 32 位种子 PRNG。
   * 用它而不是 Math.random 是为了让牌堆可由种子复现：
   * bug 可以工单化成"种子 12345，第 3 轮"，测试也不必 mock 全局。
   */
  function mulberry32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Fisher–Yates，要求注入 rng。 */
  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* localStorage 在 file:// 下不可靠：可能抛异常，且所有 file-origin 页面共享同一存储。
   * 所以一律经此包装，失败就退回一个内存对象——游戏必须照常运行。
   */
  var memStore = {};
  var storage = {
    available: (function () {
      try {
        var k = '__aon_probe__';
        g.localStorage.setItem(k, '1');
        g.localStorage.removeItem(k);
        return true;
      } catch (e) { return false; }
    })(),
    get: function (key) {
      try { return storage.available ? g.localStorage.getItem(key) : (key in memStore ? memStore[key] : null); }
      catch (e) { return key in memStore ? memStore[key] : null; }
    },
    set: function (key, val) {
      memStore[key] = String(val);
      try { if (storage.available) g.localStorage.setItem(key, String(val)); } catch (e) { /* 静默 */ }
    },
    remove: function (key) {
      delete memStore[key];
      try { if (storage.available) g.localStorage.removeItem(key); } catch (e) { /* 静默 */ }
    },
    /* kiosk 会话清除：只动我们自己的前缀，绝不碰别人的数据。 */
    clearPrefix: function (prefix) {
      var self = this;
      Object.keys(memStore).forEach(function (k) {
        if (k.indexOf(prefix) === 0) delete memStore[k];
      });
      try {
        if (!storage.available) return;
        var doomed = [];
        for (var i = 0; i < g.localStorage.length; i++) {
          var k = g.localStorage.key(i);
          if (k && k.indexOf(prefix) === 0) doomed.push(k);
        }
        doomed.forEach(function (k) { g.localStorage.removeItem(k); });
      } catch (e) { /* 静默 */ }
    }
  };

  /* 读 URL 查询参数。file:// 下 location.search 正常工作。 */
  function query(name) {
    try {
      var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(g.location.search);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }

  AON.util = {
    clamp: clamp,
    isFiniteNum: isFiniteNum,
    mulberry32: mulberry32,
    shuffle: shuffle,
    storage: storage,
    query: query,

    /* 创建元素的小助手。 */
    el: function (tag, attrs, children) {
      var n = g.document.createElement(tag);
      if (attrs) Object.keys(attrs).forEach(function (k) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
      });
      (children || []).forEach(function (c) { if (c) n.appendChild(c); });
      return n;
    },
    $: function (sel, root) { return (root || g.document).querySelector(sel); },
    $$: function (sel, root) { return Array.prototype.slice.call((root || g.document).querySelectorAll(sel)); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
