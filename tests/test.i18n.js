/* test.i18n.js — 界面文案。
 *
 * 最高价值的一条是 key 集合对齐：漏翻译是这类项目最常见、也最难在评审时
 * 发现的一类 bug（荷兰语界面上冒出一句英文，或者更糟——一个裸露的 key）。
 */
(function (g) {
  'use strict';

  var T = g.AON_TEST, I = g.AON.i18n;

  /* cue 枚举。与 data/schema.md 里的教学线索清单必须一致。
   * 这里的每一条都必须在两种语言里都有文案，否则教学面板会显示裸 key。 */
  var CUES = ['hands', 'text', 'background', 'lighting', 'perspective',
              'physics', 'repetition', 'cell-structure', 'staining', 'scale-bar'];

  T.describe('i18n', function () {

    T.it('★ nl 与 en 的 key 集合完全一致（专抓漏翻译）', function () {
      var nl = I.keysOf('nl'), en = I.keysOf('en');
      var onlyNl = nl.filter(function (k) { return en.indexOf(k) < 0; });
      var onlyEn = en.filter(function (k) { return nl.indexOf(k) < 0; });
      T.assertDeepEquals(onlyNl, [], '这些 key 只有荷兰语');
      T.assertDeepEquals(onlyEn, [], '这些 key 只有英语');
      T.assertDeepEquals(nl, en);
    });

    T.it('没有任何一条文案是空字符串', function () {
      I.LANGS.forEach(function (lang) {
        Object.keys(I.DICT[lang]).forEach(function (k) {
          var v = I.DICT[lang][k];
          T.assert(typeof v === 'string' && v.trim().length > 0,
            lang + ' 的 ' + k + ' 是空的');
        });
      });
    });

    T.it('★ cue 枚举在两种语言里都有文案', function () {
      // 少一条，教学面板就会把 'cue.staining' 这样的裸 key 显示给观众
      CUES.forEach(function (cue) {
        I.LANGS.forEach(function (lang) {
          T.assert(I.DICT[lang]['cue.' + cue], lang + ' 缺 cue.' + cue);
          T.assertEquals(I.t('cue.' + cue, lang), I.DICT[lang]['cue.' + cue]);
        });
      });
    });

    T.it('cue 枚举里没有多余的、无人使用的文案', function () {
      // 反向检查：字典里的 cue.* 都应该在枚举里
      I.LANGS.forEach(function (lang) {
        Object.keys(I.DICT[lang]).forEach(function (k) {
          if (k.indexOf('cue.') !== 0) return;
          T.assert(CUES.indexOf(k.slice(4)) >= 0, '字典里有未登记的 cue: ' + k);
        });
      });
    });

    T.it('alt 文案存在且不泄露答案', function () {
      // 揭晓前用的通用 alt。绝不能是 "AI 图" 之类。
      I.LANGS.forEach(function (lang) {
        var slot = I.t('alt.imageSlot', lang);
        T.assert(slot && slot.length > 0);
        T.assert(!/AI/i.test(slot), '通用 alt 不得出现 "AI"：' + slot);
      });
    });

    T.it('★ t() 缺 key 时回显 key，而不是静默变空白', function () {
      // 静默空白会让漏翻译在评审时完全看不见
      T.assertEquals(I.t('this.key.does.not.exist'), 'this.key.does.not.exist');
      T.assertEquals(I.t('cue.hands', 'de'), I.DICT.en['cue.hands'],
        '未知语言应回退到 en，而不是崩掉');
    });

    T.it('LANGS 与 DICT 一致', function () {
      T.assertDeepEquals(I.LANGS.slice().sort(), Object.keys(I.DICT).sort());
    });

    T.it('detect() 总是返回一个受支持的语言', function () {
      T.assert(I.LANGS.indexOf(I.detect()) >= 0, 'detect 返回了未支持的语言');
    });

    T.it('hud.langSwitch 提示文案在 nl 和 en 下正确互换', function () {
      T.assertEquals(I.t('hud.langSwitch', 'nl'), '🌐 English');
      T.assertEquals(I.t('hud.langSwitch', 'en'), '🌐 Nederlands');
    });

    T.it('setter 只接受受支持的语言', function () {
      var before = I.lang;
      I.lang = 'de';
      T.assertEquals(I.lang, before, '不应接受未支持的语言');
      I.lang = 'nl';
      T.assertEquals(I.lang, 'nl');
      I.lang = 'en';
      T.assertEquals(I.lang, 'en');
    });

    T.describe('pick（题目内联文案的回退）', function () {

      T.it('按当前语言取', function () {
        I.lang = 'nl';
        T.assertEquals(I.pick({ nl: 'hallo', en: 'hello' }), 'hallo');
        I.lang = 'en';
        T.assertEquals(I.pick({ nl: 'hallo', en: 'hello' }), 'hello');
      });

      T.it('当前语言缺失 → 回退 en → 再退 nl', function () {
        I.lang = 'nl';
        T.assertEquals(I.pick({ en: 'only english' }), 'only english');
        I.lang = 'en';
        T.assertEquals(I.pick({ nl: 'alleen nederlands' }), 'alleen nederlands');
      });

      T.it('空对象回退到第一个非空值，而不是崩掉', function () {
        T.assertEquals(typeof I.pick({ fr: 'bonjour' }), 'string');
        T.assertEquals(I.pick({ fr: 'bonjour' }), 'bonjour');
        T.assertEquals(I.pick({}), '');
      });

      T.it('null / undefined → 空字符串（教学面板不会显示 "undefined"）', function () {
        T.assertEquals(I.pick(null), '');
        T.assertEquals(I.pick(undefined), '');
      });

      T.it('字符串直接透传', function () {
        T.assertEquals(I.pick('al klaar'), 'al klaar');
      });

      T.it('显式传语言时不受当前语言影响', function () {
        I.lang = 'nl';
        T.assertEquals(I.pick({ nl: 'a', en: 'b' }, 'en'), 'b');
      });
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
