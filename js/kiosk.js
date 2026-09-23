/* kiosk.js — 展台行为：空闲回 attract、换人时清场、全屏。
 *
 * 只在 mode === 'kiosk' 时启用（main.js 负责判断）。
 * web 下 idleToAttractMs 是 0，整套计时器不会启动。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});

  function create(opts) {
    var s = opts.settings;
    var idleTimer = null, countTimer = null, tickTimer = null;
    var screen = 'attract';

    function cancel() {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      if (countTimer) { clearTimeout(countTimer); countTimer = null; }
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    }

    function beginCountdown() {
      var left = s.idleCountdownMs;
      if (opts.onCountdown) opts.onCountdown(left);
      tickTimer = setInterval(function () {
        left -= 250;
        if (opts.onCountdown) opts.onCountdown(Math.max(0, left));
      }, 250);
      countTimer = setTimeout(function () {
        cancel();
        if (opts.onCountdown) opts.onCountdown(null);
        if (opts.onReset) opts.onReset();
      }, s.idleCountdownMs);
    }

    function arm() {
      cancel();
      if (!s.idleToAttractMs) return;
      /* attract / boot / error 屏上本来就没人玩，不需要"回"到 attract。 */
      if (screen === 'attract' || screen === 'boot' || screen === 'error') return;
      /* 正在放大看图不算空闲——那正是最投入的时刻。 */
      if (AON.zoom && AON.zoom.isOpen()) return;
      /* 正在查看 Note 说明弹窗不算空闲 */
      var popup = g.document && g.document.getElementById('note-popup');
      if (popup && !popup.hidden) return;
      idleTimer = setTimeout(beginCountdown, s.idleToAttractMs);
    }

    /* 任何输入都重置空闲计时。capture 阶段监听，免得被 stopPropagation 挡掉。 */
    ['pointerdown', 'keydown', 'wheel', 'scroll'].forEach(function (type) {
      g.document.addEventListener(type, arm, { capture: true, passive: true });
    });

    return {
      setScreen: function (st) { screen = st; arm(); },
      /* 浮层关闭等"不是输入但仍应重新计时"的场合。 */
      poke: arm,
      stop: cancel
    };
  }

  /** 全屏。必须由用户手势触发，所以在 attract 的第一次点击时请求。 */
  function requestFullscreen() {
    var el = g.document.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) return;
    try {
      var r = fn.call(el);
      if (r && r.catch) r.catch(function () { /* 用户拒绝或被策略拦下，静默 */ });
    } catch (e) { /* 静默 */ }
  }

  /**
   * ★ 会话清除必须是真的清除。
   *
   * 只把屏幕切走是不够的：上一位玩家的分数、图片、教学文案都还在 DOM 里，
   * 后一位玩家（或一个好奇的少年）往回按就能看到。
   * 所以这里清 DOM、清位图、清浮层、清我们自己前缀下的存储。
   */
  function clearSession() {
    if (AON.zoom && AON.zoom.isOpen()) AON.zoom.close();
    var board = g.document.getElementById('board');
    if (board) AON.dom.releaseMedia(board);
    var teach = g.document.getElementById('teach-wrap');
    if (teach) { AON.dom.releaseMedia(teach); AON.dom.clear(teach); }
    AON.util.storage.clearPrefix('kiosk.');
    g.scrollTo(0, 0);
  }

  AON.kiosk = {
    create: create,
    requestFullscreen: requestFullscreen,
    clearSession: clearSession
  };
})(typeof window !== 'undefined' ? window : globalThis);
