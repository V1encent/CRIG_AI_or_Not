/* test.validate.js — 题库与配对校验。
 *
 * 后半部分（content / 配对完整性）是【你那条结构要求的执行者】：
 * "在结构上要能够区分后续引入的实际图片和对应的 AI 图片"。
 * 其中 'ai-derived-mismatch' 是唯一能抓到"配错半边"的检查——
 * AI 图 X 本是照真图 Y 生成的，却被配到了真图 Z 上。
 * 光看题目对象看不出来，只能靠 ai.csv 里的反向引用对得上才发现。
 */
(function (g) {
  'use strict';

  var T = g.AON_TEST, V = g.AON.validate, H = g.AON_HELPERS;

  var EASY = { tells: 1, subject: 1, postprocessing: 1 };
  var HARD = { tells: 5, subject: 5, postprocessing: 5 };

  function has(codes, code, why) {
    T.assert(codes.indexOf(code) >= 0,
      (why || '') + ' 期望问题码 ' + code + '，实际 [' + codes.join(', ') + ']');
  }
  function lacks(codes, code, why) {
    T.assert(codes.indexOf(code) < 0,
      (why || '') + ' 不应出现 ' + code + '，实际 [' + codes.join(', ') + ']');
  }
  /** 取真侧 / AI 侧的图，便于逐点破坏。 */
  function realOf(p) { return p.images.filter(function (i) { return i.isAI === false; })[0]; }
  function aiOf(p) { return p.images.filter(function (i) { return i.isAI === true; })[0]; }

  T.describe('validate.puzzle', function () {

    T.it('合规的题 → 零问题', function () {
      T.assertDeepEquals(V.puzzle(H.mkPuzzle('ok', EASY)), [],
        '基准题必须完全干净，否则后面所有断言都失去意义');
      T.assertDeepEquals(V.puzzle(H.mkPuzzle('okhard', HARD, { verifiedSolution: true })), []);
    });

    T.it('非对象', function () {
      T.assertDeepEquals(V.puzzle(null), ['not-an-object']);
      T.assertDeepEquals(V.puzzle(undefined), ['not-an-object']);
      T.assertDeepEquals(V.puzzle('x'), ['not-an-object']);
    });

    T.it('缺 id', function () {
      var p = H.mkPuzzle('x', EASY); delete p.id;
      has(V.puzzle(p), 'missing-id');
    });

    T.it('图片数量不是 2', function () {
      var p = H.mkPuzzle('x', EASY); p.images = [p.images[0]];
      T.assertDeepEquals(V.puzzle(p), ['wrong-image-count']);
      p = H.mkPuzzle('y', EASY); p.images.push(p.images[0]);
      has(V.puzzle(p), 'wrong-image-count');
    });

    T.it('两张都是 AI / 两张都是真图', function () {
      var p = H.mkPuzzle('x', EASY);
      p.images.forEach(function (i) { i.isAI = true; });
      var c1 = V.puzzle(p);
      has(c1, 'multiple-ai-images'); has(c1, 'no-real-image');

      var q = H.mkPuzzle('y', EASY);
      q.images.forEach(function (i) { i.isAI = false; });
      var c2 = V.puzzle(q);
      has(c2, 'no-ai-image'); has(c2, 'multiple-real-images');
    });

    T.it('缺 isAI（不能用真假值糊过去）', function () {
      var p = H.mkPuzzle('x', EASY); delete p.images[0].isAI;
      var c = V.puzzle(p);
      has(c, 'image-missing-isai');
      has(c, 'no-real-image');
    });

    T.it('缺 src / 缺 image id', function () {
      var p = H.mkPuzzle('x', EASY); p.images[0].src = '';
      has(V.puzzle(p), 'image-missing-src');
      var q = H.mkPuzzle('y', EASY); delete q.images[1].id;
      has(V.puzzle(q), 'image-missing-id');
    });

    T.it('★ 路径泄露答案 —— 这是最容易漏、且能绕过其它所有防护的一条', function () {
      var bad = ['assets/img/ai/1.webp', 'assets/img/real/2.webp',
                 'a/ai_1.webp', 'x/real-2.webp', 'ai/1.webp'];
      bad.forEach(function (src) {
        var p = H.mkPuzzle('x', EASY); p.images[0].src = src;
        has(V.puzzle(p), 'image-path-leaks-answer', src + ' 应被判为泄露');
      });

      var good = ['assets/img/p/p001/1.webp', 'assets/img/p/p001/2.webp',
                  'assets/img/plain/1.webp', 'assets/img/realistic/1.webp'];
      good.forEach(function (src) {
        var p = H.mkPuzzle('x', EASY); p.images[0].src = src;
        lacks(V.puzzle(p), 'image-path-leaks-answer', src + ' 是中性路径，不应误报');
      });
    });

    T.it('三根轴缺失 / 越界', function () {
      var p = H.mkPuzzle('x', EASY); delete p.difficulty.subject;
      has(V.puzzle(p), 'axis-missing:subject');

      var q = H.mkPuzzle('y', EASY); q.difficulty.postprocessing = 9;
      has(V.puzzle(q), 'axis-out-of-range:postprocessing');

      var r = H.mkPuzzle('z', EASY); r.difficulty.tells = 'hoog';
      has(V.puzzle(r), 'axis-missing:tells');
    });

    T.it('教学载荷缺失（缺了就等于一道没有答案的题）', function () {
      [['cue', 'missing-cue'], ['explanation', 'missing-explanation'],
       ['kidLine', 'missing-kidline'],
       ['tellRegion', 'missing-tellregion']].forEach(function (pair) {
        var p = H.mkPuzzle('x', EASY);
        delete p.teaching[pair[0]];
        has(V.puzzle(p), pair[1], '删掉 ' + pair[0]);
      });
      var p2 = H.mkPuzzle('x2', EASY);
      p2.teaching.rule = { nl: '', en: '' };
      has(V.puzzle(p2), 'missing-rule', '空 rule 报 missing-rule');
    });

    T.it('tellRegion 退化（越出画面或零面积）', function () {
      [{ x: 0.9, y: 0.1, w: 0.5, h: 0.2 },
       { x: 0.1, y: 0.9, w: 0.2, h: 0.5 },
       { x: 0, y: 0, w: 0, h: 0.2 },
       { x: -0.1, y: 0, w: 0.2, h: 0.2 },
       { x: 'a', y: 0, w: 0.2, h: 0.2 }].forEach(function (r) {
        var p = H.mkPuzzle('x', EASY); p.teaching.tellRegion = r;
        has(V.puzzle(p), 'tellregion-degenerate', JSON.stringify(r));
      });
    });

    T.it('AI 侧说不出生成器 → 无法记录生成条款', function () {
      var p = H.mkPuzzle('x', EASY); delete aiOf(p).provenance.generator;
      has(V.puzzle(p), 'missing-generator');
    });

    T.it('★ 公屏与衍生授权总是必需，缺一即不合格', function () {
      ['publicDisplay', 'derivatives'].forEach(function (k) {
        var p = H.mkPuzzle('x', EASY);
        realOf(p).provenance.permits[k] = false;
        has(V.puzzle(p), 'rights-not-cleared', '缺 ' + k + ' 授权');
      });
      var q = H.mkPuzzle('y', EASY);
      realOf(q).provenance.permits = {};
      has(V.puzzle(q), 'rights-not-cleared');
    });

    T.it('★ 公网授权只在真的上公网时才必需', function () {
      // scope=kiosk：只在展台屏幕上放，公网授权不适用 —— 不能因此判不合格。
      // 这正是源 deck 那批图的处境：现场公屏展示过，公网托管没确认。
      var kiosk = H.mkPuzzle('k', EASY);
      kiosk.scope = 'kiosk';
      realOf(kiosk).provenance.permits.web = false;
      T.assertDeepEquals(V.puzzle(kiosk), [], 'kiosk 题不该因为 permits.web=false 被拒');

      // scope=web / both：公网授权必需
      ['web', 'both'].forEach(function (s) {
        var p = H.mkPuzzle('s-' + s, EASY);
        p.scope = s;
        realOf(p).provenance.permits.web = false;
        has(V.puzzle(p), 'rights-not-cleared-web', 'scope=' + s + ' 缺公网授权');
      });

      // ★ 缺 scope 时按"需要公网"处理（fail closed）：
      //   宁可不发布，也不要把未清权的图放上公网。
      var noScope = H.mkPuzzle('n', EASY);
      delete noScope.scope;
      realOf(noScope).provenance.permits.web = false;
      has(V.puzzle(noScope), 'rights-not-cleared-web', '缺 scope ≠ 不需要公网授权');
    });

    T.it('★ 伦理确认只对【人体材料】必需', function () {
      // ★ 旧规则是"凡是 photo/microscopy 就必须 ethicsCleared=true"，
      //   那逼着每一张实验照片谎称已获伦理批准，等于让这个字段恒为 true。
      //   字段恒为 true 就不再传递信息，真正需要它的那道题反而没人查。
      var notHuman = H.mkPuzzle('x', EASY);
      notHuman.scope = 'kiosk';
      realOf(notHuman).provenance.ethicsCleared = false;
      T.assertDeepEquals(V.puzzle(notHuman), [],
        '非人体材料的照片不该被伦理闸门拦下');

      var human = H.mkPuzzle('h', EASY);
      human.scope = 'kiosk';
      realOf(human).provenance.humanMaterial = true;
      realOf(human).provenance.ethicsCleared = false;
      has(V.puzzle(human), 'ethics-not-cleared');

      var noField = H.mkPuzzle('h2', EASY);
      noField.scope = 'kiosk';
      realOf(noField).provenance.humanMaterial = true;
      delete realOf(noField).provenance.ethicsCleared;
      has(V.puzzle(noField), 'ethics-not-cleared', '缺字段 ≠ 已确认');

      // AI 图不受伦理闸门约束（它不来自人体材料）
      var r = H.mkPuzzle('z', EASY);
      r.scope = 'kiosk';
      T.assertDeepEquals(V.puzzle(r), []);
    });

    T.it('★ 诚实护栏：hard 档必须有人确认过破绽真的存在', function () {
      var unverified = H.mkPuzzle('h1', HARD, { verifiedSolution: false });
      T.assertDeepEquals(V.puzzle(unverified), ['hard-unverified']);

      var noFlag = H.mkPuzzle('h2', HARD);
      has(V.puzzle(noFlag), 'hard-unverified', '缺字段 ≠ 已确认');

      var ok = H.mkPuzzle('h3', HARD, { verifiedSolution: true });
      T.assertEquals(V.puzzle(ok).length, 0);
    });

    T.it('hard 之外不看 verifiedSolution', function () {
      var p = H.mkPuzzle('e', EASY, { verifiedSolution: false });
      T.assertDeepEquals(V.puzzle(p), [], 'easy 题不必人工核验破绽');
    });

    T.it('★ 答案键必须有人工核验人，不能从格式推断', function () {
      var p = H.mkPuzzle('x', EASY); delete p.meta.reviewer;
      has(V.puzzle(p), 'missing-verifier');
      var q = H.mkPuzzle('y', EASY); q.meta.reviewer = '';
      has(V.puzzle(q), 'missing-verifier', '空字符串不算核验人');
    });

    T.it('文案接受 {nl, en} 内联对象，任一语言有内容即算有', function () {
      var p = H.mkPuzzle('x', EASY);
      p.teaching.explanation = { nl: ' alleen nederlands ' };
      lacks(V.puzzle(p), 'missing-explanation');
      p.teaching.explanation = { nl: '   ', en: '' };
      has(V.puzzle(p), 'missing-explanation', '全空白字符串不算有内容');
    });
  });

  T.describe('validate.content（三册配对完整性）', function () {

    function mkContent(over) {
      over = over || {};
      return {
        real: over.real || [{ realId: 'r1' }, { realId: 'r2' }],
        ai: over.ai || [{ aiId: 'a1', derivedFromRealId: 'r1' },
                        { aiId: 'a2', derivedFromRealId: 'r2' }],
        pairs: over.pairs || [{ puzzleId: 'p1', realId: 'r1', aiId: 'a1' }]
      };
    }
    function codesOf(list) { return list.map(function (x) { return x.code; }); }

    T.it('合规内容 → 零问题', function () {
      T.assertDeepEquals(V.content(mkContent()), []);
    });

    T.it('★ 未配对的行合法存在 —— 半成品内容必须被容纳', function () {
      // r2 / a2 已登记但还没配对。这正是"内容后续填充"的结构支持。
      var c = mkContent();
      T.assertDeepEquals(V.content(c), [],
        '未配对的行不该报错：两路内容可以不对称地到达');
    });

    T.it('★ 一张真图派生多道题是合法的（内容量的乘数）', function () {
      var c = {
        real: [{ realId: 'r1' }],
        ai: [{ aiId: 'a1', derivedFromRealId: 'r1' },
             { aiId: 'a2', derivedFromRealId: 'r1' },
             { aiId: 'a3', derivedFromRealId: 'r1' }],
        pairs: [{ puzzleId: 'p-easy', realId: 'r1', aiId: 'a1' },
                { puzzleId: 'p-med', realId: 'r1', aiId: 'a2' },
                { puzzleId: 'p-hard', realId: 'r1', aiId: 'a3' }]
      };
      T.assertDeepEquals(V.content(c), [],
        '同一真图配多个 AI 变体是最主要的内容来源，必须合法');
    });

    T.it('★ 配错半边被抓住 —— 只有反向引用能发现这一类错误', function () {
      // a1 本是照 r2 生成的，却被配到了 r1 上。题目对象本身完全看不出来。
      var c = mkContent({
        ai: [{ aiId: 'a1', derivedFromRealId: 'r2' }, { aiId: 'a2', derivedFromRealId: 'r2' }],
        pairs: [{ puzzleId: 'p1', realId: 'r1', aiId: 'a1' }]
      });
      var codes = codesOf(V.content(c));
      T.assert(codes.indexOf('ai-derived-mismatch') >= 0,
        '★ 必须报 ai-derived-mismatch，实际 [' + codes.join(', ') + ']');

      var detail = V.content(c).filter(function (x) { return x.code === 'ai-derived-mismatch'; })[0];
      T.assertEquals(detail.pairedWith, 'r1');
      T.assertEquals(detail.actuallyDerivedFrom, 'r2');
    });

    T.it('反向引用缺失 → 报出（否则无从校验配对）', function () {
      var c = mkContent({ ai: [{ aiId: 'a1' }, { aiId: 'a2', derivedFromRealId: 'r2' }] });
      has(codesOf(V.content(c)), 'ai-missing-derived-from');
    });

    T.it('pair 引用了不存在的真图 / AI 图', function () {
      var c1 = mkContent({ pairs: [{ puzzleId: 'p1', realId: 'nope', aiId: 'a1' }] });
      has(codesOf(V.content(c1)), 'pair-missing-real');

      var c2 = mkContent({ pairs: [{ puzzleId: 'p1', realId: 'r1', aiId: 'nope' }] });
      has(codesOf(V.content(c2)), 'pair-missing-ai');
    });

    T.it('同一张 AI 图被配到两道题 → 报出（真图可以复用，AI 图不行）', function () {
      var c = mkContent({
        pairs: [{ puzzleId: 'p1', realId: 'r1', aiId: 'a1' },
                { puzzleId: 'p2', realId: 'r1', aiId: 'a1' }]
      });
      has(codesOf(V.content(c)), 'ai-used-twice');
    });

    T.it('id 重复', function () {
      var c1 = mkContent({ real: [{ realId: 'r1' }, { realId: 'r1' }] });
      has(codesOf(V.content(c1)), 'duplicate-real-id');

      var c2 = mkContent({ ai: [{ aiId: 'a1', derivedFromRealId: 'r1' },
                                { aiId: 'a1', derivedFromRealId: 'r1' }] });
      has(codesOf(V.content(c2)), 'duplicate-ai-id');
    });

    T.it('缺 id', function () {
      var c1 = mkContent({ real: [{ realId: '' }] });
      has(codesOf(V.content(c1)), 'real-missing-id');
      var c2 = mkContent({ ai: [{}] });
      has(codesOf(V.content(c2)), 'ai-missing-id');
    });

    T.it('空 / 缺失输入不抛异常', function () {
      T.assertDeepEquals(V.content(null), []);
      T.assertDeepEquals(V.content({}), []);
      T.assertDeepEquals(V.content({ real: [], ai: [], pairs: [] }), []);
    });
  });

  T.describe('validate.manifest', function () {

    T.it('干净题库 → 零问题', function () {
      var set = H.mkSet('m', 3, EASY);
      T.assertDeepEquals(V.manifest(set), []);
    });

    T.it('重复 puzzle id 被报出', function () {
      var set = H.mkSet('m', 2, EASY);
      set.push(H.mkPuzzle('m00', EASY));
      var out = V.manifest(set);
      has(out.map(function (x) { return x.code; }), 'duplicate-puzzle-id');
    });

    T.it('逐题聚合问题码，并带上 id 便于定位', function () {
      var bad = H.mkPuzzle('bad', EASY);
      delete bad.teaching.explanation;
      var out = V.manifest([H.mkPuzzle('good', EASY), bad]);
      T.assertEquals(out.length, 1, '只有一道题有问题');
      T.assertEquals(out[0].id, 'bad');
      has(out[0].codes, 'missing-explanation');
    });

    T.it('空题库 / null 不抛异常', function () {
      T.assertDeepEquals(V.manifest([]), []);
      T.assertDeepEquals(V.manifest(null), []);
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
