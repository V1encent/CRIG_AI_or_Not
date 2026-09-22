/* test.machine.js — 状态机。
 *
 * 最要紧的一条：未知事件必须是 no-op。展台上卡死的 FSM 是最糟的 bug 类型——
 * 观众排队等着，屏幕不动，而现场没有人会打开控制台。
 */
(function (g) {
  'use strict';

  var T = g.AON_TEST, M = g.AON.machine;

  T.describe('machine', function () {

    T.it('转移表逐行验证：每个合法事件都到达声明的状态', function () {
      var table = M.TRANSITIONS;
      Object.keys(table).forEach(function (from) {
        var row = table[from];
        Object.keys(row).forEach(function (event) {
          var m = M.create({ initial: from });
          var ok = m.send(event);
          T.assert(ok, from + ' + ' + event + ' 应被接受');
          T.assertEquals(m.state, row[event], from + ' + ' + event + ' → ' + row[event]);
        });
      });
    });

    T.it('未知事件是 no-op，且状态不变', function () {
      var table = M.TRANSITIONS;
      var allEvents = {};
      Object.keys(table).forEach(function (s) {
        Object.keys(table[s]).forEach(function (e) { allEvents[e] = 1; });
      });
      var events = Object.keys(allEvents).concat(['NOPE', 'pick', '', null, undefined]);

      Object.keys(table).forEach(function (from) {
        events.forEach(function (ev) {
          var m = M.create({ initial: from });
          if (m.can(ev)) return;              // 合法事件不在本用例范围内
          T.assertEquals(m.send(ev), false, 'from=' + from + ' ev=' + ev + ' 应被拒绝');
          T.assertEquals(m.state, from, '非法事件 ' + ev + ' 改变了状态（from=' + from + '）');
        });
      });
    });

    T.it('★ 非法事件之后 FSM 仍然完全可用（这才叫 no-op）', function () {
      // 只断言"状态没变"不够：若内部游标被写坏了，状态字段可能还是对的，
      // 但后续合法事件会走错。所以这里必须继续走完整一局。
      Object.keys(M.TRANSITIONS).forEach(function (from) {
        var m = M.create({ initial: from });
        for (var i = 0; i < 5; i++) {
          m.send('BOGUS');
          m.send(null);
        }
        T.assertEquals(m.state, from);
        T.assertEquals(m.history.length, 1, '非法事件不得进入 history');

        // 之后仍能正常转移
        var row = M.TRANSITIONS[from];
        var ev = Object.keys(row)[0];
        T.assert(m.send(ev), '非法事件之后 ' + ev + ' 应仍被接受');
        T.assertEquals(m.state, row[ev]);
      });
    });

    T.it('未知事件会通知监听器，并标记 rejected', function () {
      var m = M.create({ initial: 'round' });
      var seen = null;
      m.onChange(function (e) { seen = e; });
      m.send('BOGUS');
      T.assert(seen, '监听器应被调用（供 dev 期告警）');
      T.assert(seen.rejected === true, '应标记 rejected');
      T.assertEquals(seen.from, 'round');
      T.assertEquals(seen.to, 'round', 'from 与 to 必须相同');
    });

    T.it('合法事件的通知不带 rejected，且 from 是旧状态', function () {
      var m = M.create({ initial: 'menu' });
      var seen = null;
      m.onChange(function (e) { seen = e; });
      m.send('START');
      T.assert(seen);
      T.assert(!seen.rejected);
      T.assertEquals(seen.from, 'menu');
      T.assertEquals(seen.to, 'round');
    });

    T.it('can() 与 send() 一致', function () {
      var m = M.create({ initial: 'attract' });
      T.assert(m.can('TAP'));
      T.assert(!m.can('START'), 'attract 下不能直接 START');
      m.send('TAP');
      T.assert(m.can('START'));
      T.assert(!m.can('TAP'));
    });

    T.it('完整一局：boot → … → summary → attract', function () {
      var m = M.create();
      T.assertEquals(m.state, 'boot');
      ['LOADED', 'TAP', 'START', 'PICK', 'REVEALED', 'NEXT', 'PICK', 'REVEALED', 'LAST']
        .forEach(function (e) { T.assert(m.send(e), '事件 ' + e + ' 应被接受'); });
      T.assertEquals(m.state, 'summary');
      T.assert(m.send('ATTRACT'));
      T.assertEquals(m.state, 'attract');
      T.assert(m.send('TAP'));
      T.assertEquals(m.state, 'menu');
    });

    T.it('任何屏幕都能回到 attract（展台的生命线）', function () {
      ['menu', 'round', 'reveal', 'teach', 'summary'].forEach(function (from) {
        var m = M.create({ initial: from });
        T.assert(m.can('ATTRACT'), from + ' 必须能回 attract');
        m.send('ATTRACT');
        T.assertEquals(m.state, 'attract');
      });
    });

    T.it('history 记录路径，且是可复制的', function () {
      var m = M.create();
      m.send('LOADED'); m.send('TAP');
      T.assertDeepEquals(m.history, ['boot', 'attract', 'menu']);
      var h = m.history;
      h.push('垃圾');
      T.assertEquals(m.history.length, 3, '外部修改不得影响内部 history');
    });

    T.it('监听器抛异常不会拖垮 FSM', function () {
      var m = M.create({ initial: 'menu' });
      m.onChange(function () { throw new Error('监听器炸了'); });
      T.assert(m.send('START'), 'send 不应因监听器出错而失败');
      T.assertEquals(m.state, 'round');
    });

    T.it('onChange 返回的取消函数真的取消', function () {
      var m = M.create({ initial: 'menu' });
      var n = 0;
      var off = m.onChange(function () { n++; });
      m.send('START');
      off();
      m.send('ATTRACT');
      T.assertEquals(n, 1);
    });

    T.it('error 态可重试，且是死路之外唯一的出口', function () {
      var m = M.create({ initial: 'error' });
      T.assert(!m.can('TAP'), 'error 下不应能进菜单');
      T.assert(m.send('RETRY'));
      T.assertEquals(m.state, 'boot');
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
