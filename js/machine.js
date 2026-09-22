/* machine.js — 状态机。转移表是纯数据，与 DOM 副作用分离。
 *
 * ★ 纯函数。零 DOM。这是它能不靠浏览器测试的原因。
 * ★ 核心安全性质：未知事件是 no-op + 警告，【绝不改变状态】。
 *   展台上卡死的 FSM 是最糟的一类 bug——观众排队等着，屏幕不动。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});

  /* 屏幕：boot → attract → menu → round → reveal → teach → (round | summary) → attract/menu */
  var TRANSITIONS = {
    boot:      { LOADED: 'attract', ERROR: 'error' },
    attract:   { TAP: 'menu' },
    menu:      { START: 'round', ATTRACT: 'attract' },
    round:     { PICK: 'reveal', TIMEOUT: 'reveal', ATTRACT: 'attract', MENU: 'menu' },
    reveal:    { REVEALED: 'teach', ATTRACT: 'attract', MENU: 'menu' },
    teach:     { NEXT: 'round', LAST: 'summary', ATTRACT: 'attract', MENU: 'menu' },
    summary:   { AGAIN: 'round', MENU: 'menu', ATTRACT: 'attract' },
    error:     { RETRY: 'boot' }
  };

  function create(opts) {
    opts = opts || {};
    var state = opts.initial || 'boot';
    var listeners = [];
    var history = [state];

    function emit(from, to, event) {
      listeners.forEach(function (fn) { try { fn({ from: from, to: to, event: event }); } catch (e) { /* 监听器出错不能拖垮 FSM */ } });
    }

    return {
      get state() { return state; },
      get history() { return history.slice(); },

      can: function (event) {
        var row = TRANSITIONS[state];
        return !!(row && Object.prototype.hasOwnProperty.call(row, event));
      },

      /** 派发一个事件。未知事件不改变状态，只通知监听器（供 dev 期告警）。 */
      send: function (event) {
        var row = TRANSITIONS[state];
        if (!row || !Object.prototype.hasOwnProperty.call(row, event)) {
          listeners.forEach(function (fn) {
            try { fn({ from: state, to: state, event: event, rejected: true }); } catch (e) { /* 静默 */ }
          });
          return false;
        }
        var from = state;
        state = row[event];
        history.push(state);
        emit(from, state, event);
        return true;
      },

      onChange: function (fn) { listeners.push(fn); return function () {
        var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1);
      }; },

      /* 测试用 */
      _transitions: TRANSITIONS
    };
  }

  AON.machine = { create: create, TRANSITIONS: TRANSITIONS };
})(typeof window !== 'undefined' ? window : globalThis);
