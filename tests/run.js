#!/usr/bin/env node
/* run.js — 无头跑测试。
 *
 *   node tests/run.js            跑全部
 *   node tests/run.js selector   只跑名字里含 "selector" 的文件
 *
 * ★ 为什么值得存在：js/ 里的纯逻辑模块刻意不碰 DOM、不用 Math.random，
 *   于是同一份文件既能在浏览器里 <script> 引入，也能在这里被求值。
 *   结果是【构建过程中我自己就能验证核心逻辑】，不必让人去点页面。
 *   浏览器那一侧跑 tests/run.html —— 两个入口，同一批测试文件。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const filter = process.argv[2] || '';

/* 顺序即依赖顺序，与 index.html / run.html 里的 <script> 顺序必须一致。 */
const SOURCES = [
  'js/config.js',
  'js/util.js',
  'js/difficulty.js',
  'js/i18n.js',
  'js/selector.js',
  'js/scoring.js',
  'js/machine.js',
  'js/validate.js',
  'js/placeholder.js',
  'js/modes.js',
  /* answer-reveal 的 DOM 那一半在 Node 里跑不了，但它的纯逻辑
   * （slots / isCorrect / verdictOf）是"谁是 AI、谁在左"的最后一道关口，
   * 恰恰最该被测。文件顶层不碰 document，所以能安全加载。 */
  'js/answer-reveal.js',
  /* ★ 生成物也要在这里加载。理由：题库是流水线【生成】的，而
   *   "生成的题库真的能通过 validate" 必须是自动化测试，不能靠人打开页面看。
   *   这条测试抓到的第一类 bug 就是答案键整体标反（14 张图全标错，
   *   游戏会告诉玩家"真照片是 AI"，而 manifest 里看不出任何异常）。
   *   两者都是 UMD 式收尾，所以能被 vm 直接求值。 */
  'data/manifest.js',
  'data/compose.js'
];

const FIXED_TESTS = [
  'tests/assert.js',
  'tests/helpers.js',
  'tests/fixture.difficulty.js'
];

/* test.dom.* 是【只在浏览器里跑】的用例（要 document）。
 * 这里静默跳过，但会把清单打出来——否则"Node 全绿"会被误读成"全都测过了"，
 * 而实际上一整类用例根本没跑。 */
function domOnlyFiles() {
  return fs.readdirSync(__dirname)
    .filter(f => /^test\.dom\..*\.js$/.test(f))
    .sort();
}

function testFiles() {
  return fs.readdirSync(__dirname)
    .filter(f => /^test\..*\.js$/.test(f))
    .filter(f => !/^test\.dom\./.test(f))
    .filter(f => !filter || f.indexOf(filter) >= 0)
    .sort()
    .map(f => 'tests/' + f);
}

function load(ctx, rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) throw new Error('找不到文件: ' + rel);
  vm.runInContext(fs.readFileSync(abs, 'utf8'), ctx, { filename: rel });
}

function main() {
  const tests = testFiles();
  if (!tests.length) {
    console.error('没有匹配 "' + filter + '" 的测试文件');
    process.exit(1);
  }

  // 只给 console —— 刻意不给 window / document / localStorage / navigator，
  // 这样任何意外触碰 DOM 的代码都会立刻暴露，而不是在 Node 里静默通过。
  const ctx = vm.createContext({ console });

  SOURCES.forEach(f => load(ctx, f));
  FIXED_TESTS.forEach(f => load(ctx, f));
  tests.forEach(f => load(ctx, f));

  console.log('运行 ' + tests.length + ' 个测试文件：' +
    tests.map(f => f.replace('tests/test.', '').replace('.js', '')).join(', ') + '\n');

  const domOnly = domOnlyFiles();
  if (domOnly.length && !filter) {
    console.log('以下 ' + domOnly.length + ' 个文件只在浏览器里跑（要 document），' +
      '请在浏览器打开 tests/run.html：');
    console.log('  ' + domOnly.join(', ') + '\n');
  }

  const failed = vm.runInContext('AON_TEST.report()', ctx);
  process.exit(failed ? 1 : 0);
}

try {
  main();
} catch (e) {
  console.error('\n加载阶段就失败了 —— 说明有模块在顶层抛异常：\n');
  console.error(e && e.stack ? e.stack : e);
  process.exit(2);
}
