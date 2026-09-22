/* test.placeholder.js — 占位图生成器。
 *
 * ★ 这里的断言比"没有图也能跑"强得多：占位图必须让难度分档【真的可测】，
 *   否则阶段 1 的评审关卡就是假的 —— 我们会以为自己验证了三轴梯度，
 *   实际上只验证了三根数字。
 */
(function (g) {
  'use strict';

  var T = g.AON_TEST, P = g.AON.placeholder, V = g.AON.validate, D = g.AON.difficulty;

  /** data: URI → 原始 SVG 文本，供结构性断言。 */
  function svgOf(uri) {
    return decodeURIComponent(String(uri).replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
  }
  function ellipses(svg) { return (svg.match(/<ellipse/g) || []).length; }
  function byId(set, id) {
    return set.filter(function (p) { return p.id === id; })[0];
  }

  T.describe('placeholder', function () {

    var SET = P.makePuzzles({ perTier: 5 });

    T.it('三档 × perTier 道题', function () {
      T.assertEquals(SET.length, 15);
      T.assertEquals(SET.filter(function (p) { return /^ph-easy-/.test(p.id); }).length, 5);
      T.assertEquals(SET.filter(function (p) { return /^ph-medium-/.test(p.id); }).length, 5);
      T.assertEquals(SET.filter(function (p) { return /^ph-hard-/.test(p.id); }).length, 5);
    });

    T.it('★ id 上的档位标签与实际算出的档位一致', function () {
      // 第一版这里就错了：[3,1,1] 与 [2,2,3] 被放进 medium，实际是 easy。
      // 若不一致，难度菜单就是假的，而且从界面上完全看不出来。
      SET.forEach(function (p) {
        var label = p.id.split('-')[1];
        T.assertEquals(D.tier(p.difficulty), label,
          p.id + ' 的 id 说它是 ' + label + '，实际算出来是 ' + D.tier(p.difficulty));
      });
    });

    T.it('★ 每道题都恰好一真一 AI，且过 validate', function () {
      SET.forEach(function (p) {
        var probs = V.puzzle(p);
        var expected = (D.tier(p.difficulty) === 'hard') ? ['hard-unverified'] : [];
        T.assertDeepEquals(probs, expected, p.id + ' 的校验结果不符');
      });
    });

    T.it('★ hard 占位题被诚实标记为未核验 —— 管道通，但进不了 hard 池', function () {
      var hard = SET.filter(function (p) { return D.tier(p.difficulty) === 'hard'; });
      T.assert(hard.length > 0, '应当生成了 hard 占位题');
      hard.forEach(function (p) {
        T.assert(p.meta.verifiedSolution === false,
          p.id + ' 不该声称破绽已被人工核验');
        T.assert(!D.eligibleForTier(p, 'hard', g.AON_CONFIG.difficulty),
          p.id + ' 必须被排除在 hard 池之外');
      });
      // 反过来：easy / medium 必须可用
      SET.filter(function (p) { return D.tier(p.difficulty) !== 'hard'; })
        .forEach(function (p) {
          T.assert(p.meta.verifiedSolution === true, p.id + ' 应当可用');
        });
    });

    T.it('tells 被封在诚实上限内（超出就不画破绽了）', function () {
      SET.forEach(function (p) {
        T.assert(p.difficulty.tells <= P.MAX_HONEST_TELLS,
          p.id + ' 的 tells=' + p.difficulty.tells + ' 超过诚实上限，两张图会一模一样');
      });
    });

    T.it('★ tellRegion 恒在画面内（越界会让聚焦环对不准破绽）', function () {
      SET.forEach(function (p) {
        var r = p.teaching.tellRegion;
        T.assert(r, p.id + ' 缺 tellRegion');
        T.assert(r.x >= 0 && r.y >= 0, p.id + ' 区域起点为负');
        T.assert(r.w > 0 && r.h > 0, p.id + ' 区域零面积');
        T.assert(r.x + r.w <= 1.0001, p.id + ' 区域右边越界: ' + (r.x + r.w));
        T.assert(r.y + r.h <= 1.0001, p.id + ' 区域下边越界: ' + (r.y + r.h));
      });
    });

    T.it('★ 两张图不是同一张 —— AI 侧真的被改了', function () {
      SET.forEach(function (p) {
        var real = p.images.filter(function (i) { return i.isAI === false; })[0];
        var ai = p.images.filter(function (i) { return i.isAI === true; })[0];
        T.assert(real.src !== ai.src, p.id + ' 的两侧完全相同，等于没有破绽');
        T.assert(real.src.indexOf('data:image/svg+xml') === 0, p.id + ' 真侧不是内联 SVG');
        T.assert(ai.src.indexOf('data:image/svg+xml') === 0, p.id + ' AI 侧不是内联 SVG');
      });
    });

    T.it('tells 1 的破绽是"多一个核"（结构性可验证）', function () {
      var p = byId(SET, 'ph-easy-01');   // combos[0] = [1,1,1] → tells 1
      T.assertEquals(p.difficulty.tells, 1, '前置条件：这道题的 tells 应为 1');
      var real = svgOf(p.images.filter(function (i) { return i.isAI === false; })[0].src);
      var ai = svgOf(p.images.filter(function (i) { return i.isAI === true; })[0].src);
      T.assertEquals(ellipses(ai), ellipses(real) + 1,
        'tells 1 的 AI 侧应恰好比真侧多一个椭圆（多出来的那个核）');
    });

    T.it('tells 3 的破绽是"比例尺被改短 + 标签镜像"（结构性可验证）', function () {
      var p = byId(SET, 'ph-medium-01');   // combos[0] = [3,2,2] → tells 3
      T.assertEquals(p.difficulty.tells, 3, '前置条件：这道题的 tells 应为 3');
      var real = svgOf(p.images.filter(function (i) { return i.isAI === false; })[0].src);
      var ai = svgOf(p.images.filter(function (i) { return i.isAI === true; })[0].src);
      // 比例尺画在 y=740（H-60）。带上 y2 以免与血管的 <line> 撞上。
      T.assert(real.indexOf('x2="190" y2="740"') >= 0,
        '真侧应有完整长度(130)的比例尺');
      T.assert(ai.indexOf('x2="106" y2="740"') >= 0,
        'AI 侧的比例尺应被改短(46) —— 与同一张图上的细胞尺寸自相矛盾');
      T.assert(real.indexOf('200 µm') >= 0, '真侧标签应为正向');
      T.assert(ai.indexOf('mµ 002') >= 0,
        'AI 侧标签应被镜像（"200 µm" → "mµ 002"）—— 这是外行也能一眼看出的破绽');
    });

    T.it('★ 两侧共享同一个场景（只有破绽不同）', function () {
      // 背景色、细胞数、血管数都应一致，否则玩家能靠"构图不同"猜，与破绽无关
      SET.forEach(function (p) {
        var real = svgOf(p.images.filter(function (i) { return i.isAI === false; })[0].src);
        var ai = svgOf(p.images.filter(function (i) { return i.isAI === true; })[0].src);
        var bg = function (s) { var m = /<rect width="1200" height="800" fill="(#[0-9A-Fa-f]{6})"/.exec(s); return m && m[1]; };
        T.assertEquals(bg(ai), bg(real), p.id + ' 两侧背景色不同 —— 这本身就是线索');
        var lines = function (s) { return (s.match(/<line /g) || []).length; };
        T.assertEquals(lines(ai), lines(real), p.id + ' 两侧血管数不同');
      });
    });

    T.it('★ postprocessing 对两侧同等施加 —— 降质不得成为线索', function () {
      // 这是这条轴的全部意义：模糊与噪声若只加在 AI 侧，玩家就在读噪声而不是读破绽。
      SET.filter(function (p) { return p.difficulty.postprocessing >= 2; }).forEach(function (p) {
        var real = svgOf(p.images.filter(function (i) { return i.isAI === false; })[0].src);
        var ai = svgOf(p.images.filter(function (i) { return i.isAI === true; })[0].src);
        var blur = function (s) { var m = /feGaussianBlur stdDeviation="([\d.]+)"/.exec(s); return m && m[1]; };
        var noise = function (s) { var m = /feTurbulence[^>]*seed="(\d+)"/.exec(s); return m && m[1]; };
        T.assertEquals(blur(ai), blur(real), p.id + ' 两侧模糊量不同');
        T.assertEquals(noise(ai), noise(real), p.id + ' 两侧噪声 seed 不同');
      });
    });

    T.it('postprocessing = 1 时完全不降质', function () {
      var p = byId(SET, 'ph-easy-01');   // [1,1,1]
      var svg = svgOf(p.images[0].src);
      T.assert(svg.indexOf('feGaussianBlur') < 0, 'pp=1 不应有模糊');
      T.assert(svg.indexOf('feTurbulence') < 0, 'pp=1 不应有噪声');
    });

    T.it('种子可复现：同样的调用得到同样的图', function () {
      var a = P.makePair(4242, { tells: 2, subject: 3, postprocessing: 2 });
      var b = P.makePair(4242, { tells: 2, subject: 3, postprocessing: 2 });
      T.assertEquals(a.ai, b.ai);
      T.assertEquals(a.real, b.real);
      T.assertDeepEquals(a.tellRegion, b.tellRegion);

      var other = P.makePair(4243, { tells: 2, subject: 3, postprocessing: 2 });
      T.assert(other.real !== a.real, '不同种子应得到不同场景');
    });

    T.it('makePair 容忍缺参数（退回最简档）', function () {
      var a = P.makePair(1, null);
      T.assertEquals(a.width, 1200);
      T.assertEquals(a.height, 800);
      T.assert(a.tellRegion && a.tellRegion.w > 0);
    });

    T.it('占位题对象与真实题对象形状一致（引擎分辨不出）', function () {
      var p = SET[0];
      ['id', 'status', 'difficulty', 'images', 'teaching', 'meta'].forEach(function (k) {
        T.assert(p[k] !== undefined, '占位题缺字段 ' + k);
      });
      T.assertDeepEquals(Object.keys(p.difficulty).sort(),
        ['postprocessing', 'subject', 'tells']);
      // 引擎业务逻辑绝不读 placeholder 这个字段
      T.assertEquals(typeof p.placeholder, 'boolean');
    });

    T.it('src 是中性路径或 data URI，绝不泄露哪张是 AI', function () {
      // data URI 里不能出现裸的 /ai/ 或 /real/
      SET.forEach(function (p) {
        p.images.forEach(function (im) {
          T.assert(im.src.indexOf('/ai/') < 0 && im.src.indexOf('/real/') < 0,
            p.id + ' 的图片路径泄露了答案');
        });
      });
    });

    T.it('经 encodeURIComponent 后不含裸斜杠（否则会误触路径泄露检查）', function () {
      // validate.js 的 image-path-leaks-answer 规则靠 (^|\/)(ai|real)[\/_.-] 匹配。
      // 若某天改了编码方式（比如换成 base64 之外的手工拼接）而留下裸斜杠，
      // 每个占位题的 src 都会被误判为泄露答案。
      var pair = P.makePair(7, { tells: 1, subject: 1, postprocessing: 1 });
      var PREFIX = 'data:image/svg+xml;charset=utf-8,';
      [pair.real, pair.ai].forEach(function (uri) {
        T.assert(uri.indexOf(PREFIX) === 0, 'data URI 前缀变了');
        var body = uri.slice(PREFIX.length);
        T.assert(body.indexOf('/') < 0, '编码后仍含裸斜杠');
        T.assert(body.indexOf(' ') < 0, '编码后仍含裸空格');
      });
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
