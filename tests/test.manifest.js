/* test.manifest.js — 校验【生成出来的】题库。
 *
 * ★ 为什么这组用例比其它任何一组都重要：
 *
 *   其它测试都在测"函数给定输入会返回什么"。这一组测的是"流水线真的
 *   产出了一份能玩的题库吗"——它跨越了 Python 与 JS 的边界，而那条边界
 *   正是本项目最危险的缝：CSV 里的语义要靠 tools/gen_manifest.py 传达给
 *   js/ 里的运行时，中间没有任何东西保证两边理解一致。
 *
 *   它抓到的第一类真实 bug 就是答案键整体标反：make_webp 把 AI 图放在
 *   编号为 aiSlot 的槽位，而 gen_manifest 把 isAI 标到了另一侧。14 张图
 *   全部标错，游戏会理直气壮地告诉玩家"真照片是 AI"，而 manifest 里
 *   看不出任何异常——难度对、教学齐全、授权齐备、校验全绿。
 *
 * ★ 关于那条 bug 的防线分工（别搞混，两处各管一半）：
 *   · gen_manifest.py 生成时逐张与 data/crops.json 的 kind 对账，
 *     不一致就报 answer-key-inverted 并把该题降为 review。这是主防线。
 *   · 本文件在 Node 里没有 fs，读不到 crops.json，所以【不做】那条对账。
 *     它管的是另一半：生成物本身是不是一份合规、可玩、可发布的题库。
 *   · tools/verify_assets.py 会重新做一次 crops.json 对账，用来抓
 *     "manifest.js 是旧的、crops.json 是新的"这种时间差。
 *
 * ★ 这组用例在题库为空时【跳过而不是失败】：内容还没填是合法状态
 *   （半成品合法存在，见 data/schema.md），不是构建错误。
 */
(function (g) {
  'use strict';

  var T = g.AON_TEST;
  var V = g.AON.validate;
  var C = g.AON.compose;

  /* 生成物可能不存在或为空数组 —— 那是合法状态。 */
  function puzzles() {
    return Array.isArray(g.PUZZLES) ? g.PUZZLES : [];
  }

  T.describe('manifest › 生成的题库', function () {

    T.it('加载不抛异常，且是数组', function () {
      T.assert(Array.isArray(g.PUZZLES),
        'window.PUZZLES 不是数组 —— data/manifest.js 可能没生成或被手工改坏了');
    });

    T.it('★ 每一道题都通过 validate.puzzle（零问题码）', function () {
      var bad = [];
      puzzles().forEach(function (p) {
        var probs = V.puzzle(p);
        if (probs.length) bad.push((p && p.id) + ': ' + probs.join(', '));
      });
      T.assert(bad.length === 0,
        '生成物里有 ' + bad.length + ' 道题通不过校验 —— 它们会在 main.js 里被静默剔除，' +
        '于是"内容明明做了却不出现在游戏里"。明细：\n     ' + bad.join('\n     '));
    });

    T.it('★ 每一道 ready 题都恰好一张 AI、一张真图', function () {
      puzzles().forEach(function (p) {
        if (p.status !== 'ready') return;
        var ai = p.images.filter(function (i) { return i.isAI === true; }).length;
        T.assertEquals(ai, 1, p.id + ' 的 AI 图数量');
      });
    });

    T.it('★ 图片路径不泄露答案', function () {
      puzzles().forEach(function (p) {
        p.images.forEach(function (im) {
          T.assert(!/(^|\/)(ai|real)[\/_.-]/i.test(im.src),
            p.id + ' 的路径 ' + im.src + ' 里有 ai/real —— 路径会出现在 URL、DOM 和 ' +
            'DevTools 里，是最容易漏且能绕过其它所有防护的一条');
        });
      });
    });

    T.it('★ AI 在左右两侧都出现过（否则"永远选左"又能通关）', function () {
      var slots = { 1: 0, 2: 0 };
      puzzles().forEach(function (p) {
        p.images.forEach(function (im, i) {
          if (im.isAI === true) slots[i + 1]++;
        });
      });
      if (slots[1] + slots[2] < 2) return;   // 只有一道题时无从谈起
      T.assert(slots[1] > 0 && slots[2] > 0,
        'AI 全在 ' + (slots[1] ? '左' : '右') + '侧（' + JSON.stringify(slots) +
        '）—— 源 deck 就是这么被一条"永远选左"通关的');
    });

    T.it('教学载荷的 cue 必须是 i18n 里存在的 key', function () {
      var missing = [];
      /* 界面文案一律走 i18n，缺 key 会渲染成 key 本身 —— 玩家会看到
       * "cue.cell-structure" 这种字面量。i18n 没有 has()，
       * 只有 keysOf()，所以取 key 集合来查。 */
      var known = {};
      g.AON.i18n.keysOf('nl').forEach(function (k) { known[k] = 1; });
      puzzles().forEach(function (p) {
        var cue = p.teaching && p.teaching.cue;
        if (!cue) return;
        if (!known['cue.' + cue]) missing.push(p.id + ': cue.' + cue);
      });
      T.assert(missing.length === 0, 'i18n 里没有这些 key：' + missing.join(', '));
    });

    T.it('★ 每道题的两张图尺寸完全一致', function () {
      puzzles().forEach(function (p) {
        var a = p.images[0], b = p.images[1];
        T.assertEquals(a.width + 'x' + a.height, b.width + 'x' + b.height,
          p.id + ' 两侧尺寸不同 —— 卡片在页面上大小会不一样，那本身就是提示');
      });
    });

    T.it('kiosk 题不该带公网授权，web 题必须带', function () {
      puzzles().forEach(function (p) {
        var real = p.images.filter(function (i) { return i.isAI === false; })[0];
        if (!real || !real.provenance || !real.provenance.permits) return;
        if (p.scope === 'kiosk') return;
        T.assert(real.provenance.permits.web === true,
          p.id + ' 的 scope=' + p.scope + ' 却没有公网授权 —— 它会被 validate 标为 ' +
          'rights-not-cleared-web，然后被 main.js 悄悄剔出题池');
      });
    });

    T.it('tellRegion 已换算到裁剪后坐标且在 [0,1] 内', function () {
      puzzles().forEach(function (p) {
        var r = p.teaching.tellRegion;
        if (!r) return;
        T.assert(r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 &&
          r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001,
          p.id + ' 的 tellRegion 越界：' + JSON.stringify(r) +
          '（常见原因是 gen_manifest 取错了裁剪记录的那一侧）');
      });
    });
  });

  T.describe('compose › scope 过滤', function () {

    T.it('★ kiosk 题不出现在 web 牌堆里', function () {
      var built = C.build({ mode: 'web', includePlaceholder: false });
      built.puzzles.forEach(function (p) {
        T.assert(p.scope !== 'kiosk',
          p.id + ' 是 kiosk 题却出现在 web 牌堆 —— 那正是"公屏展示有授权、' +
          '公网托管没有"的图被发上公网的方式');
      });
    });

    T.it('kiosk 模式下 kiosk 题能出来', function () {
      var all = C.servable(C.realPuzzles());
      if (!all.length) return;              // 题库为空时无从谈起
      var kiosk = all.filter(function (p) { return p.scope === 'kiosk'; });
      if (!kiosk.length) return;
      var built = C.build({ mode: 'kiosk', includePlaceholder: false });
      T.assertEquals(built.puzzles.length, kiosk.length,
        'kiosk 模式下应当拿到全部 kiosk 题');
    });

    T.it('省略 mode 时不过滤（工具与测试用）', function () {
      var built = C.build({ includePlaceholder: false });
      T.assertEquals(built.puzzles.length, C.servable(C.realPuzzles()).length);
    });

    T.it('★ 被 scope 挡掉的题要能被算出来，不是无声消失', function () {
      var built = C.build({ mode: 'web', includePlaceholder: false });
      var all = C.servable(C.realPuzzles());
      T.assertEquals(built.realCount + built.outOfScopeCount, all.length,
        'realCount + outOfScopeCount 应当等于全部可服务题数 —— ' +
        '否则"web 版怎么一道真题都没有"就无法一眼诊断（那通常是授权问题，不是 bug）');
    });

    T.it('缺 scope 字段的题处处可用（占位题就是这么来的）', function () {
      T.assert(C.matchesScope({ id: 'x' }, 'kiosk'));
      T.assert(C.matchesScope({ id: 'x' }, 'web'));
      T.assert(C.matchesScope({ id: 'x', scope: 'both' }, 'web'));
      T.assert(!C.matchesScope({ id: 'x', scope: 'kiosk' }, 'web'));
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
