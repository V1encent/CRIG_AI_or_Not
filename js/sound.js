/* sound.js — WebAudio 合成的音效。零素材、零文件、零体积。
 *
 * kiosk 默认静音（config.js 的 kiosk.sound=false）：展厅里同时在放别的东西，
 * 而且一台不停地"叮"的机器会让人想躲开。
 */
(function (g) {
  'use strict';
  var AON = (g.AON = g.AON || {});

  var ctx = null;
  var enabled = false;

  function ensure() {
    if (ctx) return ctx;
    var AC = g.AudioContext || g.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }

  /* 一次极短的音符。gain 压得很低——展台上音效是提示，不是表演。 */
  function tone(freq, at, dur, type, peak) {
    if (!ctx) return;
    var t0 = ctx.currentTime + at;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak == null ? 0.07 : peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  var CUES = {
    tap:     [[880, 0, 0.05, 'triangle', 0.03]],
    correct: [[523.25, 0, 0.14], [659.25, 0.09, 0.14], [783.99, 0.18, 0.22]],
    wrong:   [[392, 0, 0.16], [311.13, 0.12, 0.26]],
    timeout: [[330, 0, 0.14], [247, 0.13, 0.3]],
    finish:  [[523.25, 0, 0.12], [659.25, 0.1, 0.12], [783.99, 0.2, 0.12], [1046.5, 0.3, 0.36]]
  };

  function play(name) {
    if (!enabled) return;
    if (!ensure()) { enabled = false; return; }
    /* 自动播放策略：上下文在用户手势之前是 suspended 的。
     * 这里 resume() 一次即可，失败就静默放弃——音效永远不能拖垮游戏。 */
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* 静默 */ } }
    var cue = CUES[name];
    if (!cue) return;
    cue.forEach(function (n) { tone(n[0], n[1], n[2], n[3], n[4]); });
  }

  AON.sound = {
    setEnabled: function (v) { enabled = !!v; if (enabled) ensure(); },
    isEnabled: function () { return enabled; },
    /* 第一次真实手势时调用，把上下文解锁。 */
    unlock: function () { if (enabled) { ensure(); if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } } },
    play: play
  };
})(typeof window !== 'undefined' ? window : globalThis);
