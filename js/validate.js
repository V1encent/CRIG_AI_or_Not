/* validate.js — 题库与配对校验。
 *
 * ★ 纯函数。零 DOM、零 Math.random。
 * ★ 同一个模块被【游戏】和【工具】共用：构建时（tools/gen_manifest.py 的同名规则）
 *   与运行期（dev 模式打 console 警告）用同一套规则，逻辑不重复写两遍。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});

  var AXES = ['tells', 'subject', 'postprocessing'];

  function hasText(v) {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    // 题目文案是 {nl, en} 内联对象
    return hasText(v.nl) || hasText(v.en);
  }

  /**
   * 单题校验 → 问题码数组。空数组 = 通过。
   * 每个问题码都对应一个具体的失败类别，测试会逐条断言。
   */
  function puzzle(p) {
    var out = [];
    var push = function (c) { if (out.indexOf(c) < 0) out.push(c); };

    if (!p || typeof p !== 'object') return ['not-an-object'];
    if (!p.id) push('missing-id');

    var imgs = p.images;
    if (!Array.isArray(imgs) || imgs.length !== 2) {
      push('wrong-image-count');
    } else {
      var aiCount = 0, realCount = 0;
      imgs.forEach(function (im) {
        if (!im || typeof im.id !== 'string' || !im.id) push('image-missing-id');
        if (!im || typeof im.src !== 'string' || !im.src) push('image-missing-src');
        // ★ 路径必须是中性的。语义化命名只允许活在 CSV 里。
        if (im && typeof im.src === 'string' && /(^|\/)(ai|real)[\/_.-]/i.test(im.src)) push('image-path-leaks-answer');
        if (im && im.isAI === true) aiCount++;
        else if (im && im.isAI === false) realCount++;
        else push('image-missing-isai');
      });
      if (aiCount !== 1) push(aiCount === 0 ? 'no-ai-image' : 'multiple-ai-images');
      if (realCount !== 1) push(realCount === 0 ? 'no-real-image' : 'multiple-real-images');
    }

    // 三根轴必须都已评分，且在范围内
    var d = p.difficulty || {};
    AXES.forEach(function (axis) {
      var v = d[axis];
      if (typeof v !== 'number' || !isFinite(v)) push('axis-missing:' + axis);
      else if (v < g.AON_CONFIG.difficulty.axisRange.min || v > g.AON_CONFIG.difficulty.axisRange.max) {
        push('axis-out-of-range:' + axis);
      }
    });

    // 教学载荷 —— 这是游戏存在的理由，缺了就等于一道没有答案的题
    var t = p.teaching || {};
    if (!t.cue) push('missing-cue');
    if (!hasText(t.explanation)) push('missing-explanation');
    if (!hasText(t.kidLine)) push('missing-kidline');
    if (!hasText(t.rule)) push('missing-rule');
    if (!t.tellRegion) push('missing-tellregion');
    else {
      var r = t.tellRegion;
      var ok = typeof r.x === 'number' && typeof r.y === 'number' &&
               typeof r.w === 'number' && typeof r.h === 'number' &&
               r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && (r.x + r.w) <= 1.0001 && (r.y + r.h) <= 1.0001;
      if (!ok) push('tellregion-degenerate');
    }

    // AI 侧必须能说清是哪个模型生成的——否则无法记录生成器条款
    if (Array.isArray(imgs) && imgs.length === 2) {
      var ai = imgs.filter(function (x) { return x && x.isAI === true; })[0];
      if (ai) {
        var prov = ai.provenance || {};
        if (!prov.generator) push('missing-generator');
      }
    }

    // 授权闸门：公屏展示与衍生（我们要裁剪降质）总是必需；公网托管只在
    // 这道题真的要上公网时必需；伦理确认只在【人体材料】时必需。
    //
    // ★ 这里曾经写成"凡是 photo/microscopy 就三项全要 + 必须 ethicsCleared"。
    //   那等于逼着每一张实验照片都谎称"人体材料已获伦理批准"——而 schema.md
    //   写的是"人体组织/病理材料必须为 true"。字段一旦对所有人都恒为 true，
    //   它就再也不传递任何信息，真正需要它的那道题反而没人查。
    //   更直接的问题是：源 deck 的 7 张真图既没有公网授权也没有伦理批件，
    //   按旧规则它们全部通不过校验，一道题都上不了场。
    //
    // ★ 缺 scope 时按"需要公网"处理（fail closed）：宁可不发布，
    //   也不要因为字段忘了填就把未清权的图放上公网。
    var scope = (p && p.scope) || 'both';
    var needsWeb = scope !== 'kiosk';

    if (Array.isArray(imgs) && imgs.length === 2) {
      imgs.forEach(function (im) {
        var prov = (im && im.provenance) || {};
        if (prov.kind !== 'photo' && prov.kind !== 'microscopy') return;
        var pm = prov.permits || {};
        if (!pm.publicDisplay || !pm.derivatives) push('rights-not-cleared');
        if (needsWeb && !pm.web) push('rights-not-cleared-web');
        if (prov.humanMaterial === true && prov.ethicsCleared !== true) push('ethics-not-cleared');
      });
    }

    // 诚实护栏：hard 档必须有真人确认过破绽真的存在
    var tier = AON.difficulty.tier(d);
    if (tier === 'hard' && g.AON_CONFIG.difficulty.hardRequiresRealContent) {
      if (!p.meta || p.meta.verifiedSolution !== true) push('hard-unverified');
    }

    // 答案键必须有人工核验记录，不能是从格式推断的
    if (!p.meta || !p.meta.reviewer) push('missing-verifier');

    return out;
  }

  /**
   * 三册配对校验 —— 这是"后续引入的真图与【对应的】AI 图"那条结构要求的执行者。
   *
   * content: { real: [...], ai: [...], pairs: [...] }
   * 每册一行是一个对象，字段名与小写 CSV 表头一致。
   *
   * 最高价值的一条是 'ai-derived-mismatch'：它能抓到一个光看题目对象看不出来的
   * 错误类别——AI 图 X 本是照真图 Y 生成的，却被配到了真图 Z 上。
   */
  function content(content) {
    var out = [];
    var real = (content && content.real) || [];
    var ai = (content && content.ai) || [];
    var pairs = (content && content.pairs) || [];

    var byReal = {}, byAi = {};
    real.forEach(function (r) {
      if (!r.realId) { out.push({ code: 'real-missing-id', row: r }); return; }
      if (byReal[r.realId]) out.push({ code: 'duplicate-real-id', id: r.realId });
      byReal[r.realId] = r;
    });
    ai.forEach(function (a) {
      if (!a.aiId) { out.push({ code: 'ai-missing-id', row: a }); return; }
      if (byAi[a.aiId]) out.push({ code: 'duplicate-ai-id', id: a.aiId });
      byAi[a.aiId] = a;
    });

    var usedAi = {};
    pairs.forEach(function (p) {
      if (!byReal[p.realId]) out.push({ code: 'pair-missing-real', puzzleId: p.puzzleId, realId: p.realId });
      if (!byAi[p.aiId]) out.push({ code: 'pair-missing-ai', puzzleId: p.puzzleId, aiId: p.aiId });
      if (usedAi[p.aiId]) out.push({ code: 'ai-used-twice', aiId: p.aiId });
      usedAi[p.aiId] = 1;

      var a = byAi[p.aiId];
      if (a) {
        // ★ 反向引用必须对得上。这是"配错半边"的唯一检测手段。
        if (a.derivedFromRealId && a.derivedFromRealId !== p.realId) {
          out.push({
            code: 'ai-derived-mismatch',
            puzzleId: p.puzzleId,
            pairedWith: p.realId,
            actuallyDerivedFrom: a.derivedFromRealId
          });
        }
        if (!a.derivedFromRealId) out.push({ code: 'ai-missing-derived-from', aiId: p.aiId });
      }
    });

    return out;
  }

  /** 整个 manifest 校验。 */
  function manifest(puzzles) {
    var out = [];
    var seen = {};
    (puzzles || []).forEach(function (p) {
      if (p && p.id) {
        if (seen[p.id]) out.push({ id: p.id, code: 'duplicate-puzzle-id' });
        seen[p.id] = 1;
      }
      var probs = puzzle(p);
      if (probs.length) out.push({ id: (p && p.id) || '(no id)', codes: probs });
    });
    return out;
  }

  AON.validate = {
    puzzle: puzzle,
    content: content,
    manifest: manifest,
    hasText: hasText
  };
})(typeof window !== 'undefined' ? window : globalThis);
