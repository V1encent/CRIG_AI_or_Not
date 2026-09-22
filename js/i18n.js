/* i18n.js — 界面文案。NL + EN。
 *
 * ★ 边界（重要，避免以后混乱）：
 *   · 界面文案 → 在本文件里用 key 查。
 *   · 题目文案（线索、说明、prompt）→ 内联在题目对象上写 {nl, en}。
 *   理由：题目文案属于【内容】而非【界面】，它应该跟着题走，而不是散落在字典里。
 *   渲染时按 当前语言 → en → nl 回退（见 pick()）。
 *
 * ★ 纯函数。零 DOM。tests/test.i18n.js 会断言 nl 与 en 的 key 集合完全一致，
 *   专抓"漏翻译"这个经典 bug。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});

  var DICT = {
    nl: {
      'app.title': 'AI of niet AI?',
      'app.tagline': 'Twee beelden. Eén is echt, één is gemaakt door AI.',

      'attract.tap': 'Tik om te spelen',
      'attract.hint': 'Kijk goed. Vergroot als je twijfelt.',

      'menu.title': 'Kies je niveau',
      'menu.easy': 'Makkelijk',
      'menu.medium': 'Gemiddeld',
      'menu.hard': 'Moeilijk',
      'menu.adaptive': 'Klimmend',
      'menu.adaptive.hint': 'Wordt automatisch moeilijker',
      'menu.easy.hint': 'Grote fouten, snel te zien',
      'menu.medium.hint': 'Kleine fouten, even zoeken',
      'menu.hard.hint': 'Bijna geen fouten',
      'menu.start': 'Start',
      'menu.howto': 'Welk beeld is door AI gemaakt? Tik erop.',

      'hud.round': 'ronde',
      'hud.of': 'van',
      'hud.score': 'punten',
      'hud.streak': 'op rij',
      'hud.lang': 'Taal',
      'hud.langSwitch': '🌐 English',
      'hud.langName': 'Nederlands',
      'hud.sound': 'Geluid',
      'hud.menu': 'Menu',
      'hud.level': 'Niveau',
      'hud.deck': 'Deck',
      'hud.loupe': '🔍 Loep',
      'hud.loupeOn': '🔍 Loep: Aan',
      'hud.loupeOff': '🔍 Loep: Uit',
      'deck.title': 'Deck Manager (PPTX)',
      'deck.sub': '7 puzzels uit CRIG Ontdekt PPTX dia 2–8',
      'deck.tabDeck': 'PPTX-puzzels',
      'deck.tabAdd': 'Paar toevoegen',
      'deck.tabJson': 'JSON Im-/Export',
      'deck.playThis': 'Speel deze',
      'deck.close': 'Sluiten',
      'deck.real': 'Echt beeld',
      'deck.ai': 'AI-beeld',
      'deck.addBtn': 'Toevoegen en spelen',
      'deck.exportBtn': 'Exporteer JSON',
      'deck.importBtn': 'Importeer JSON',

      'error.title': 'Er ging iets mis',
      'error.retry': 'Opnieuw proberen',
      'error.noContent': 'Geen puzzels gevonden om te spelen.',

      'round.question': 'Welk beeld is door AI gemaakt?',
      'round.zoom': 'Vergroot',
      'round.zoomHint': 'Vergroot dit beeld',
      'round.pick': 'Kies deze',
      'round.close': 'Sluiten',
      'round.timeLeft': 'Resterende tijd',
      'round.timeUp': 'Tijd is om',

      'reveal.correct': 'Juist!',
      'reveal.wrong': 'Niet juist',
      'reveal.ai': 'AI',
      'reveal.real': 'ECHT',
      'reveal.thisIsAi': 'Dit beeld is door AI gemaakt.',
      'reveal.thisIsReal': 'Dit is een echte foto.',

      'teach.lookHere': 'Kijk hier',
      'teach.theTrick': 'De truc',
      'teach.remember': 'Onthoud',
      'teach.whyReal': 'Waarom de andere echt is',
      'teach.details': 'Meer details',
      'teach.prompt': 'Prompt',
      'teach.model': 'Model',
      'teach.credit': 'Foto',
      'teach.next': 'Volgende',
      'teach.finish': 'Bekijk resultaat',
      'teach.autoIn': 'automatisch verder',

      'summary.title': 'Klaar!',
      'summary.youGot': 'Je had',
      'summary.correct': 'goed',
      'summary.of': 'van',
      'summary.again': 'Nog een keer',
      'summary.menu': 'Terug naar menu',
      'summary.recap': 'Wat je deze ronde kon leren',

      'rank.rookie': 'Kijker',
      'rank.spotter': 'Speurder',
      'rank.detective': 'Detective',
      'rank.hunter': 'AI-jager',
      'rank.rookie.note': 'Blijf kijken naar handen en tekst.',
      'rank.spotter.note': 'Je ziet de grote fouten. Nu de kleine.',
      'rank.detective.note': 'Knap werk. Probeer het moeilijkste niveau.',
      'rank.hunter.note': 'Bijna niet te verslaan. Kom je terug?',

      'kid.level': 'Sterren',
      'kid.stars': 'sterren',

      'cue.hands': 'Handen',
      'cue.text': 'Tekst',
      'cue.background': 'Achtergrond',
      'cue.lighting': 'Licht en schaduw',
      'cue.perspective': 'Perspectief',
      'cue.physics': 'Natuurkunde',
      'cue.repetition': 'Herhaling',
      'cue.cell-structure': 'Celstructuur',
      'cue.staining': 'Kleuring',
      'cue.scale-bar': 'Schaalbalk',

      'alt.imageSlot': 'Afbeelding',
      'alt.imageA': 'Afbeelding A',
      'alt.imageB': 'Afbeelding B',

      'kiosk.attract': 'Tik om te beginnen',
      'kiosk.resetIn': 'Reset over',
      'note.placeholders': 'Demo-modus: de beelden zijn testbeelden, geen echte puzzels.'
    },

    en: {
      'app.title': 'AI or not AI?',
      'app.tagline': 'Two images. One is real, one was made by AI.',

      'attract.tap': 'Tap to play',
      'attract.hint': 'Look closely. Zoom in if you are unsure.',

      'menu.title': 'Pick your level',
      'menu.easy': 'Easy',
      'menu.medium': 'Medium',
      'menu.hard': 'Hard',
      'menu.adaptive': 'Climbing',
      'menu.adaptive.hint': 'Gets harder automatically',
      'menu.easy.hint': 'Big mistakes, easy to see',
      'menu.medium.hint': 'Small mistakes, look carefully',
      'menu.hard.hint': 'Almost no mistakes',
      'menu.start': 'Start',
      'menu.howto': 'Which image was made by AI? Tap it.',

      'hud.round': 'round',
      'hud.of': 'of',
      'hud.score': 'points',
      'hud.streak': 'in a row',
      'hud.lang': 'Language',
      'hud.langSwitch': '🌐 Nederlands',
      'hud.langName': 'English',
      'hud.sound': 'Sound',
      'hud.menu': 'Menu',
      'hud.level': 'Level',
      'hud.deck': 'Deck',
      'hud.loupe': '🔍 Loupe',
      'hud.loupeOn': '🔍 Loupe: On',
      'hud.loupeOff': '🔍 Loupe: Off',
      'deck.title': 'Deck Manager (PPTX)',
      'deck.sub': '7 puzzles from CRIG Ontdekt PPTX slides 2–8',
      'deck.tabDeck': 'PPTX Puzzles',
      'deck.tabAdd': 'Add Pair',
      'deck.tabJson': 'JSON Im-/Export',
      'deck.playThis': 'Play This',
      'deck.close': 'Close',
      'deck.real': 'Real Image',
      'deck.ai': 'AI Image',
      'deck.addBtn': 'Add & Play',
      'deck.exportBtn': 'Export JSON',
      'deck.importBtn': 'Import JSON',

      'error.title': 'Something went wrong',
      'error.retry': 'Try again',
      'error.noContent': 'No puzzles found to play.',

      'round.question': 'Which image was made by AI?',
      'round.zoom': 'Zoom',
      'round.zoomHint': 'Zoom into this image',
      'round.pick': 'Choose this one',
      'round.close': 'Close',
      'round.timeLeft': 'Time left',
      'round.timeUp': 'Time is up',

      'reveal.correct': 'Correct!',
      'reveal.wrong': 'Not correct',
      'reveal.ai': 'AI',
      'reveal.real': 'REAL',
      'reveal.thisIsAi': 'This image was made by AI.',
      'reveal.thisIsReal': 'This is a real photo.',

      'teach.lookHere': 'Look here',
      'teach.theTrick': 'The trick',
      'teach.remember': 'Remember',
      'teach.whyReal': 'Why the other one is real',
      'teach.details': 'More details',
      'teach.prompt': 'Prompt',
      'teach.model': 'Model',
      'teach.credit': 'Photo',
      'teach.next': 'Next',
      'teach.finish': 'See result',
      'teach.autoIn': 'continuing automatically',

      'summary.title': 'Done!',
      'summary.youGot': 'You got',
      'summary.correct': 'right',
      'summary.of': 'out of',
      'summary.again': 'Play again',
      'summary.menu': 'Back to menu',
      'summary.recap': 'What you could learn this round',

      'rank.rookie': 'Watcher',
      'rank.spotter': 'Spotter',
      'rank.detective': 'Detective',
      'rank.hunter': 'AI Hunter',
      'rank.rookie.note': 'Keep looking at hands and text.',
      'rank.spotter.note': 'You spot the big mistakes. Now the small ones.',
      'rank.detective.note': 'Nice work. Try the hardest level.',
      'rank.hunter.note': 'Almost impossible to beat. Coming back?',

      'kid.level': 'Stars',
      'kid.stars': 'stars',

      'cue.hands': 'Hands',
      'cue.text': 'Text',
      'cue.background': 'Background',
      'cue.lighting': 'Light and shadow',
      'cue.perspective': 'Perspective',
      'cue.physics': 'Physics',
      'cue.repetition': 'Repetition',
      'cue.cell-structure': 'Cell structure',
      'cue.staining': 'Staining',
      'cue.scale-bar': 'Scale bar',

      'alt.imageSlot': 'Image',
      'alt.imageA': 'Image A',
      'alt.imageB': 'Image B',

      'kiosk.attract': 'Tap to begin',
      'kiosk.resetIn': 'Resetting in',
      'note.placeholders': 'Demo mode: these are test images, not real puzzles.'
    }
  };

  var LANGS = ['nl', 'en'];

  /* 当前语言。优先 URL 参数与本地缓存，默认荷兰语（CRIG Ontdekt 当地公众日）。 */
  function detect() {
    var forced = AON.util && AON.util.query && AON.util.query('lang');
    if (forced && DICT[forced]) return forced;
    try {
      var saved = AON.util && AON.util.storage && AON.util.storage.get('aon.lang');
      if (saved && DICT[saved]) return saved;
      var nav = (g.navigator && (g.navigator.language || g.navigator.userLanguage)) || '';
      if (/^en/i.test(nav)) {
        // 如果浏览器明确为英语且未选择过，依然提供 nl 作为展台首选
      }
    } catch (e) { /* 忽略 */ }
    return 'nl';
  }

  var current = null;

  function t(key, lang) {
    var L = lang || current || (current = detect());
    var row = DICT[L] || DICT.en;
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    if (Object.prototype.hasOwnProperty.call(DICT.en, key)) return DICT.en[key];
    return key; // 缺 key 时回显 key，而不是静默变成空白——这样 bug 一眼可见
  }

  /**
   * 取题目内联的 {nl, en} 文本。回退顺序：当前语言 → en → nl。
   * 与 t() 分开，因为题目文案不该进字典（见文件头）。
   */
  function pick(obj, lang) {
    if (obj == null) return '';
    if (typeof obj === 'string') return obj;
    var L = lang || current || (current = detect());
    if (obj[L]) return obj[L];
    if (obj.en) return obj.en;
    if (obj.nl) return obj.nl;
    var ks = Object.keys(obj);
    return ks.length ? obj[ks[0]] : '';
  }

  AON.i18n = {
    LANGS: LANGS,
    DICT: DICT,
    t: t,
    pick: pick,
    detect: detect,
    get lang() { return current || (current = detect()); },
    set lang(v) { if (DICT[v]) current = v; },
    /** 测试用：某语言的 key 集合（用于断言 nl/en 对齐）。 */
    keysOf: function (lang) { return Object.keys(DICT[lang] || {}).sort(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
