/* test.modes.js — 模式解析与配置摊平。
 *
 * 这一组测试守的是一条很具体的要求：
 * 「kiosk 行为必须能在 http 下测」。如果模式是从协议硬推出来的，
 * 那么所有展台行为（空闲重置、清场、自动前进）在开发机上就永远测不到，
 * 只能等到活动当天在展台上现场发现 bug。
 */
(function (g) {
  'use strict';
  var T = g.AON_TEST;
  var M = g.AON.modes;
  var CFG = g.AON_CONFIG;

  T.describe('modes', function () {

    T.it('file:// 默认 kiosk，http 默认 web', function () {
      T.assertEquals(M.resolve({ protocol: 'file:' }), 'kiosk');
      T.assertEquals(M.resolve({ protocol: 'http:' }), 'web');
      T.assertEquals(M.resolve({ protocol: 'https:' }), 'web');
      T.assertEquals(M.resolve({ protocol: 'File:' }), 'kiosk', '协议大小写不该有影响');
    });

    T.it('★ ?mode= 能覆盖协议 —— kiosk 因此可以在 http 下测', function () {
      T.assertEquals(M.resolve({ forced: 'kiosk', protocol: 'http:' }), 'kiosk');
      T.assertEquals(M.resolve({ forced: 'web', protocol: 'file:' }), 'web');
    });

    T.it('无法识别的 mode 值退回协议默认，而不是当成 web', function () {
      T.assertEquals(M.resolve({ forced: 'kanban', protocol: 'file:' }), 'kiosk');
      T.assertEquals(M.resolve({ forced: '', protocol: 'http:' }), 'web');
      T.assertEquals(M.resolve({ forced: null, protocol: 'http:' }), 'web');
    });

    T.it('settings 把两个模式的差异摊平成一个对象', function () {
      var k = M.settings('kiosk', CFG, {});
      var w = M.settings('web', CFG, {});

      T.assertEquals(k.mode, 'kiosk');
      T.assertEquals(k.isKiosk, true);
      T.assertEquals(k.roundsPerSession, CFG.roundsPerSession.kiosk);
      T.assertEquals(k.teachAutoAdvanceMs, CFG.teachAutoAdvanceMs.kiosk);
      T.assertEquals(k.tapMin, CFG.kiosk.tapMin);
      T.assertEquals(k.sound, false, '展台默认静音');
      T.assertEquals(k.idleToAttractMs, CFG.kiosk.idleToAttractMs);

      T.assertEquals(w.isKiosk, false);
      T.assertEquals(w.roundsPerSession, CFG.roundsPerSession.web);
      T.assertEquals(w.teachAutoAdvanceMs, 0, 'web 上教学面板永远手动前进');
      T.assertEquals(w.sound, true);
      T.assertEquals(w.idleToAttractMs, 0, 'web 上不清场——公网上没人排队');
      T.assertEquals(w.showCredit, true, 'web 上屏显真图出处');
      T.assertEquals(k.showCredit, false, 'kiosk 上出处印在机器旁的实体牌上');
    });

    T.it('未知模式当成 web，而不是抛异常', function () {
      var s = M.settings('nonsense', CFG, {});
      T.assertEquals(s.mode, 'web');
      T.assertEquals(s.roundsPerSession, CFG.roundsPerSession.web);
    });

    T.it('缺配置字段时有兜底值，绝不产出 undefined', function () {
      var s = M.settings('web', {}, {});
      ['roundsPerSession', 'answerTimeLimitMs', 'teachAutoAdvanceMs', 'tapMin',
       'sound', 'showCredit', 'idleToAttractMs', 'idleCountdownMs'].forEach(function (k) {
        T.assert(s[k] !== undefined, k + ' 不该是 undefined');
        T.assert(s[k] !== null, k + ' 不该是 null');
      });
    });

    T.it('devOptions 解析 ?placeholder / ?autoplay / ?seed / ?level', function () {
      var q = { placeholder: '1', autoplay: '200', seed: '12345', level: 'HARD', mode: 'kiosk' };
      var d = M.devOptions(function (k) { return q[k] === undefined ? null : q[k]; });

      T.assertEquals(d.placeholder, true);
      T.assertEquals(d.autoplay, 200);
      T.assertEquals(d.seed, 12345);
      T.assertEquals(d.level, 'hard', 'level 大小写不敏感');
      T.assertEquals(d.mode, 'kiosk');
    });

    T.it('★ ?audit 三态：没写 / 开 / 明确关掉', function () {
      /* audit 守的是"揭晓前答案不进 DOM"这条最重要的规则，
       * 所以它自己必须被测——它曾经是唯一一个绕过这个解析器的开关。 */
      var q = function (v) { return M.devOptions(function (k) { return k === 'audit' ? v : null; }); };

      T.assertEquals(q(null).audit, null, '没写 = 由调用方决定');
      T.assertEquals(q('1').audit, true);
      T.assertEquals(q('ja').audit, true, '荷兰语');
      T.assertEquals(q('0').audit, false, '★ 明确关掉 ≠ 没写');
      T.assertEquals(q('nee').audit, false);
    });

    T.it('★ ?placeholder=0 与"没写"是两件事', function () {
      var none = M.devOptions(function () { return null; });
      var off = M.devOptions(function (k) { return k === 'placeholder' ? '0' : null; });

      T.assertEquals(none.placeholder, null, '没写 = 不干预');
      T.assertEquals(off.placeholder, false, '写了 0 = 明确禁止占位题');
    });

    T.it('devOptions 的坏输入不会产出 NaN', function () {
      var d = M.devOptions(function (k) {
        return { autoplay: 'veel', seed: 'abc', level: 'onmogelijk' }[k] || null;
      });
      T.assertEquals(d.autoplay, 0);
      T.assertEquals(d.seed, null);
      T.assertEquals(d.level, null);
    });

    T.it('autoplay 不接受负数', function () {
      var d = M.devOptions(function (k) { return k === 'autoplay' ? '-5' : null; });
      T.assertEquals(d.autoplay, 0);
    });

    T.it('shouldAutoAdvance：kiosk 会、web 不会、玩家碰过之后不会', function () {
      var k = M.settings('kiosk', CFG, {});
      var w = M.settings('web', CFG, {});
      T.assertEquals(M.shouldAutoAdvance(k, false), true);
      T.assertEquals(M.shouldAutoAdvance(k, true), false, '玩家一碰就永久取消');
      T.assertEquals(M.shouldAutoAdvance(w, false), false);
    });

    T.it('parseBool 认荷兰语', function () {
      T.assertEquals(M.parseBool('ja'), true);
      T.assertEquals(M.parseBool('nee'), false);
      T.assertEquals(M.parseBool('aan'), true);
      T.assertEquals(M.parseBool('uit'), false);
      T.assertEquals(M.parseBool('misschien'), null);
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
