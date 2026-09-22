/* assert.js — 极简测试框架。零依赖，浏览器与 Node 双跑。
 *
 * 之所以自己写而不引框架：整个项目零依赖、零构建（见 DESIGN.md §2.1），
 * 而这里需要的功能不到 80 行。
 */
(function (g) {
  'use strict';

  var suite = '';
  var results = [];

  function describe(name, fn) {
    var prev = suite;
    suite = prev ? prev + ' › ' + name : name;
    try { fn(); } catch (e) {
      results.push({ suite: suite, name: '(suite 本身抛错)', ok: false, err: e });
    }
    suite = prev;
  }

  function it(name, fn) {
    var rec = { suite: suite, name: name, ok: true };
    try { fn(); } catch (e) { rec.ok = false; rec.err = e; }
    results.push(rec);
  }

  function fail(msg) { throw new Error(msg); }

  function assert(cond, msg) {
    if (!cond) fail(msg || '断言失败');
  }

  function assertEquals(actual, expected, msg) {
    if (actual !== expected) {
      fail((msg ? msg + ': ' : '') + '期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual));
    }
  }

  function assertClose(actual, expected, tol, msg) {
    var t = (tol == null) ? 1e-9 : tol;
    if (typeof actual !== 'number' || !isFinite(actual) || Math.abs(actual - expected) > t) {
      fail((msg ? msg + ': ' : '') + '期望 ' + expected + ' ±' + t + '，实际 ' + actual);
    }
  }

  function assertDeepEquals(actual, expected, msg) {
    var a = JSON.stringify(actual), b = JSON.stringify(expected);
    if (a !== b) fail((msg ? msg + ': ' : '') + '期望 ' + b + '，实际 ' + a);
  }

  function assertThrows(fn, msg) {
    try { fn(); } catch (e) { return e; }
    fail((msg ? msg + ': ' : '') + '期望抛出异常但没有');
  }

  /** 统计并（在浏览器里）渲染横幅。返回失败数。 */
  function report() {
    var failed = results.filter(function (r) { return !r.ok; });
    var total = results.length;
    var lines = [];

    results.forEach(function (r) {
      if (!r.ok) lines.push('✗ ' + r.suite + ' › ' + r.name + '\n    ' + (r.err && r.err.message));
    });

    var summary = (total - failed.length) + '/' + total + ' 通过' +
      (failed.length ? '，' + failed.length + ' 失败' : ' ✓');

    if (typeof console !== 'undefined') {
      lines.forEach(function (l) { console.log(l); });
      console.log('\n' + summary);
    }

    if (g.document) {
      var box = g.document.getElementById('results');
      if (box) {
        box.innerHTML = '';
        var banner = g.document.createElement('div');
        banner.className = 'banner ' + (failed.length ? 'bad' : 'good');
        banner.textContent = summary;
        box.appendChild(banner);
        lines.forEach(function (l) {
          var pre = g.document.createElement('pre');
          pre.className = 'fail';
          pre.textContent = l;
          box.appendChild(pre);
        });
      }
    }
    return failed.length;
  }

  g.AON_TEST = {
    describe: describe, it: it,
    assert: assert, assertEquals: assertEquals, assertClose: assertClose,
    assertDeepEquals: assertDeepEquals, assertThrows: assertThrows,
    report: report,
    get results() { return results.slice(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
