/* main.js — 启动、状态机接线、一轮的生命周期。
 *
 * 这里是唯一知道"流程"的地方。ui.js 只负责"长什么样"，
 * 纯模块只负责"算出来是什么"。三者分开，所以每一层都能单独读。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});
  var dom = AON.dom;
  var util = AON.util;

  var app = {
    settings: null,
    lang: 'en',
    devAudit: false,
    /* 菜单里选中的档位。跨会话保留，所以它与 session.level 是两个东西：
     * session.level 是【这一局是怎么开的】，重开时不该被玩家中途改菜单影响。 */
    level: 'medium',
    /* 会话状态。全部在内存里，没有任何持久化——展台上换人即归零。 */
    session: null,
    pool: [],
    current: null,
    view: null,
    picked: null,
    slotEls: [],
    machine: null,
    deck: null,
    autoCancelled: false,
    kiosk: null,
    /* DOM 引用在 cacheEls() 里填。 */
    el: {},
    timers: {}
  };

  function blankSession(level) {
    var progCfg = (g.AON_CONFIG && g.AON_CONFIG.progressive) || {};
    return {
      level: level,
      kidLevel: g.AON_CONFIG.adapt.startLevel,
      roundIndex: 1,
      total: 0,
      correct: 0,
      score: 0,
      streak: 0,
      correctStreak: 0,
      pairsPerLevel: progCfg.pairsPerLevel || 1,
      maxLevel: progCfg.maxLevel || 4,
      results: []
    };
  }

  // ── 启动 ───────────────────────────────────────────────────────────

  function boot() {
    var dev = AON.modes.devOptions();
    var mode = AON.modes.resolve({ forced: dev.mode });
    var settings = AON.modes.settings(mode, g.AON_CONFIG, dev);

    app.settings = settings;
    app.lang = AON.i18n.lang;
    /* 每轮自动跑"答案没进 DOM"自检。?audit=0 可以明确关掉。
     * ★ 传了 ?mode= 也默认打开：已经在拧开发旋钮了，就顺手把关卡也打开。 */
    app.devAudit = dev.audit === false ? false : (dev.audit === true || dev.mode != null);

    g.document.body.setAttribute('data-mode', mode);

    cacheEls();
    AON.i18n.lang = app.lang;
    dom.applyI18n(g.document, app.lang);

    AON.sound.setEnabled(settings.sound);

    var built;
    try {
      built = AON.compose.build({
        mode: mode,
        includePlaceholder: false // 用户明确要求：不再需要填充图片，后续题源均来自 pics 文件夹
      });
    } catch (e) {
      return fail('compose.build 抛异常：' + (e && e.message ? e.message : String(e)));
    }

    var playable = built.puzzles.filter(function (p) {
      return AON.validate.puzzle(p).length === 0 &&
        !(p.meta && p.meta.tags && p.meta.tags.indexOf('placeholder') >= 0);
    });

    var dropped = built.puzzles.length - playable.length;
    if (dropped && g.console) {
      g.console.warn('[aon] ' + dropped + ' 道题未通过校验，已排除出题池。原因统计：',
        countCodes(built.puzzles));
    }

    if (!playable.length) return fail(AON.i18n.t('error.noContent', app.lang));

    app.pool = playable;
    app.level = settings.level || 'medium';
    app.session = blankSession(app.level);
    var progCfg = (g.AON_CONFIG && g.AON_CONFIG.progressive) || {};
    app.session.total = (progCfg.enabled ? (progCfg.maxLevel * (progCfg.pairsPerLevel || 1)) : settings.roundsPerSession);
    app.demoMode = built.isPlaceholderOnly && settings.forcePlaceholder !== false;
    dom.show(app.el.demoFlag, app.demoMode);

    warnEmptyTiers(playable);

    app.machine = AON.machine.create({ initial: 'boot' });
    app.machine.onChange(onState);
    wireInput();
    wireMenu();
    wireKiosk();

    if (AON.loupe) AON.loupe.init();
    if (AON.deckManager) AON.deckManager.init(app);
    updateLoupeBtn(false);

    app.machine.send('LOADED');
  }

  function fail(detail) {
    app.el.errDetail.textContent = detail;
    app.el.errTitle.textContent = AON.i18n.t('error.title', app.lang);
    if (g.console) g.console.error('[aon]', detail);
    if (app.machine) app.machine.send('ERROR');
    else g.document.body.setAttribute('data-screen', 'error');
  }

  function cacheEls() {
    var e = app.el;
    e.board = dom.$('#board');
    e.teachWrap = dom.$('#teach-wrap');
    e.menuGrid = dom.$('#menu-grid');
    e.summaryBody = dom.$('#summary-body');
    e.hudRound = dom.$('#hud-round');
    e.hudScore = dom.$('#hud-score');
    e.hudStreak = dom.$('#hud-streak');
    e.hudLevel = dom.$('#hud-level');
    e.timer = dom.$('#timer');
    e.langBtn = dom.$('#btn-lang');
    e.soundBtn = dom.$('#btn-sound');
    e.resetChip = dom.$('#reset-chip');
    e.demoFlag = dom.$('#demo-flag');
    e.errTitle = dom.$('#err-title');
    e.errDetail = dom.$('#err-detail');
    e.live = dom.$('#live');
    e.question = dom.$('#round-question');
    e.loupeBtn = dom.$('#btn-loupe');
  }

  // ── 状态机的反应 ───────────────────────────────────────────────────
  /* 所有"进入某屏要做什么"集中在这一个 switch 里。
   * 散落到各处的话，"屏幕上同时显示了两屏"这类 bug 会极难定位。 */

  function onState(ev) {
    if (ev.rejected) {
      if (g.console) g.console.warn('[aon] 非法事件被忽略：' + ev.event + '（当前 ' + ev.from + '）');
      return;
    }
    if (AON.loupe) AON.loupe.hide();
    g.document.body.setAttribute('data-screen', ev.to);
    /* 离开 teach 就一定要停掉自动前进，否则那个 interval 会在别的屏上
     * 继续跑，并在某一刻突然 goNext()——从总结页跳回出题页。 */
    cancelAutoAdvance();

    switch (ev.to) {
      case 'attract':  onAttract(); break;
      case 'menu':     AON.ui.menu(app); AON.ui.hud(app); break;
      case 'round':    onRound(); break;
      case 'reveal':   onReveal(); break;
      case 'teach':    onTeach(); break;
      case 'summary':  AON.ui.summary(app); break;
      case 'error':    break;
    }
    if (app.kiosk) app.kiosk.setScreen(ev.to);
    AON.ui.setCountdown(app, null);
  }

  function onAttract() {
    AON.kiosk && AON.kiosk.clearSession();
    app.session = blankSession(app.level);
    var progCfg = (g.AON_CONFIG && g.AON_CONFIG.progressive) || {};
    app.session.total = (progCfg.enabled ? (progCfg.maxLevel * (progCfg.pairsPerLevel || 1)) : app.settings.roundsPerSession);
    app.current = null;
    app.view = null;
    app.picked = null;
  }

  function newDeck() {
    var progCfg = (g.AON_CONFIG && g.AON_CONFIG.progressive) || {};
    if (progCfg.enabled && AON.selector.createProgressiveDeck) {
      return AON.selector.createProgressiveDeck({
        puzzles: app.pool,
        pairsPerLevel: progCfg.pairsPerLevel || 1,
        maxLevel: progCfg.maxLevel || 4,
        seed: app.settings.seed == null ? (Date.now() % 2147483647) : app.settings.seed,
        recentRealIds: app.recentRealIds || []
      });
    }
    return AON.selector.createDeck({
      puzzles: app.pool,
      count: app.settings.roundsPerSession,
      seed: app.settings.seed == null ? (Date.now() % 2147483647) : app.settings.seed,
      recentRealIds: app.recentRealIds || []
    });
  }

  function startSession() {
    app.session = blankSession(app.level);
    app.deck = newDeck();
    app.session.total = (app.deck && app.deck.count) || app.settings.roundsPerSession;
    app.autoCancelled = false;
    app.machine.send('START');
  }

  /**
   * 某个档位一道题都没有时，明确说出来。
   *
   * 这是阶段 1 的真实状态：占位题的 tells 最高只到 3，够不到 hard，
   * 而 hard 池按设计只接受 meta.verifiedSolution === true。
   * 不说的话，"选困难却拿到简单题"看起来就像难度菜单坏了。
   */
  /**
   * 统计每道题的问题码，并把最常见的那个原因单独说清楚。
   *
   * ★ hard-unverified 单独点名，因为它【不是缺陷】：占位图的 tells 最高只到 3，
   *   够不到 hard，而 hard 池按设计只接受人工确认过可解的题。
   *   混在一起报会让人以为题库坏了，而去修一个没坏的东西。
   */
  function countCodes(puzzles) {
    var byCode = {};
    puzzles.forEach(function (p) {
      AON.validate.puzzle(p).forEach(function (pr) {
        byCode[pr.code] = (byCode[pr.code] || 0) + 1;
      });
    });
    if (byCode['hard-unverified']) {
      byCode['hard-unverified (占位图到不了 hard，属预期)'] = byCode['hard-unverified'];
      delete byCode['hard-unverified'];
    }
    return byCode;
  }

  function warnEmptyTiers(pool) {
    var dcfg = g.AON_CONFIG.difficulty;
    ['easy', 'medium', 'hard'].forEach(function (tier) {
      var n = pool.filter(function (p) { return AON.difficulty.eligibleForTier(p, tier, dcfg); }).length;
      if (!n && g.console) {
        g.console.warn('[aon] ' + tier + ' 档暂无可用题（占位题够不到 hard 是设计如此）。' +
          '该档会自动放宽到最近的题，直到加入真实内容。');
      }
    });
  }

  /** 抽一道题并渲染。档位固定时按 tier，自适应时按连续分数，分级模式按阶梯预先序列。 */
  function onRound() {
    var s = app.session;
    var progCfg = (g.AON_CONFIG && g.AON_CONFIG.progressive) || {};
    var card;
    if (progCfg.enabled && app.deck && typeof app.deck.draw === 'function') {
      card = app.deck.draw();
    } else {
      var target = s.level === 'adaptive'
        ? AON.selector.targetForLevel(s.kidLevel)
        : { tier: s.level };
      card = app.deck.draw(target);
    }
    if (!card) return fail('牌堆已空：题库里没有可用于该档位的题。');

    app.current = card;
    app.view = AON.answerReveal.slots(card.puzzle, card.aiSlot);
    if (!app.view) return fail('题目 ' + card.puzzle.id + ' 不是恰好一张 AI + 一张真图。');

    app.picked = null;
    AON.ui.round(app);
  }

  function playSpecificPuzzle(puzzle) {
    if (!puzzle) return;
    if (app.machine.state === 'attract' || app.machine.state === 'boot') {
      app.machine.send('TAP');
    }
    if (!app.session) {
      app.session = blankSession(app.level || 'medium');
      app.session.total = app.settings.roundsPerSession;
    }
    app.autoCancelled = false;
    var realImg = (puzzle.images && puzzle.images.find(function (im) { return !im.isAI; })) || (puzzle.images && puzzle.images[0]);
    var aiSlot = (Math.random() < 0.5 ? 0 : 1);
    app.current = {
      puzzle: puzzle,
      puzzleId: puzzle.id,
      realId: (realImg && realImg.id) || puzzle.id,
      tier: 'medium',
      aiSlot: aiSlot
    };
    app.view = AON.answerReveal.slots(puzzle, aiSlot);
    app.picked = null;

    if (app.machine.state === 'round') {
      AON.ui.round(app);
    } else {
      if (app.machine.state === 'menu') app.machine.send('START');
      else if (app.machine.state === 'summary' || app.machine.state === 'teach') app.machine.send('NEXT');
      else app.machine.send('START');
      AON.ui.round(app);
    }
  }
  app.playSpecificPuzzle = playSpecificPuzzle;

  function onReveal() {
    AON.ui.reveal(app);
    /* 揭晓动画跑完再上教学面板。时长与 css/motion.css 的时间线对应。 */
    var wait = g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 620;
    app.timers.reveal = setTimeout(function () { app.machine.send('REVEALED'); }, wait);
  }

  function onTeach() {
    AON.ui.teach(app);
    say(announce());
    armAutoAdvance();
  }

  function announce() {
    var v = AON.answerReveal.verdictOf(app.picked, app.view.aiSlot);
    var head = v === 'correct' ? AON.i18n.t('reveal.correct', app.lang)
      : (v === 'wrong' ? AON.i18n.t('reveal.wrong', app.lang) : AON.i18n.t('round.timeUp', app.lang));
    return head + '. ' + AON.i18n.t('reveal.thisIsAi', app.lang);
  }

  function say(text) {
    if (app.el.live) app.el.live.textContent = text;
  }

  // ── 作答 ───────────────────────────────────────────────────────────

  function pick(slot) {
    if (app.machine.state !== 'round') return;
    if (app.picked !== null) return;          /* 双击不能变成两次作答 */
    app.picked = slot;
    scoreRound();
    AON.sound.play('tap');
    app.machine.send('PICK');
  }

  function onTimeout() {
    if (app.machine.state !== 'round') return;
    app.picked = null;
    scoreRound();
    AON.sound.play('timeout');
    app.machine.send('TIMEOUT');
  }

  /** 结算只做一次，且必须在进入 reveal 之前——reveal 要读结果来决定显示什么。 */
  function scoreRound() {
    var s = app.session;
    var correct = AON.answerReveal.isCorrect(app.picked, app.view.aiSlot);

    var round = {
      puzzle: app.current.puzzle,
      puzzleId: app.current.puzzle.id,
      realId: app.current.realId,
      tier: app.current.tier,
      picked: app.picked,
      correct: correct
    };
    s.results.push(round);

    if (correct) {
      s.correct += 1;
      /* roundPoints 读的是【作答前】的连击，所以先算分再自增。 */
      s.score += AON.scoring.roundPoints(round, s, g.AON_CONFIG.scoring);
      s.streak += 1;
    } else {
      s.streak = 0;
    }

    if (s.level === 'adaptive') AON.selector.adapt(s, correct);
  }

  function goNext() {
    var s = app.session;
    if (s.roundIndex >= s.total) { app.machine.send('LAST'); return; }
    s.roundIndex += 1;
    app.machine.send('NEXT');
  }

  // ── 教学面板的自动前进 ──────────────────────────────────────────────
  /* 任何触摸都【永久】取消——不是"暂停后重来"。
   * 一个人在读说明时被自动翻页推走，是最招人烦的一类交互。 */

  function armAutoAdvance() {
    if (!AON.modes.shouldAutoAdvance(app.settings, app.autoCancelled)) return;
    var total = app.settings.teachAutoAdvanceMs;
    var t0 = (g.performance || Date).now();
    app.timers.auto = setInterval(function () {
      var left = total - ((g.performance || Date).now() - t0);
      AON.ui.autoTick(app, Math.max(0, left));
      if (left <= 0) { cancelAutoAdvance(); if (app.machine.state === 'teach') goNext(); }
    }, 200);
  }

  function cancelAutoAdvance() {
    if (app.timers.auto) { clearInterval(app.timers.auto); app.timers.auto = null; }
    app.el.autoFill = null;
  }

  function userTouched() {
    if (!app.autoCancelled && app.timers.auto) {
      app.autoCancelled = true;
      cancelAutoAdvance();
      var ring = dom.$('.auto-ring', app.el.teachWrap);
      if (ring && ring.parentNode) ring.parentNode.removeChild(ring);
    }
  }

  // ── 输入接线 ───────────────────────────────────────────────────────

  function wireInput() {
    var d = g.document;

    /* 卡片选择，走委托：卡片每轮重建，逐元素绑定必然漏解绑。 */
    dom.on(app.el.board, 'click', '.card', function (ev) { pick(Number(this.getAttribute('data-slot'))); });

    dom.on(app.el.teachWrap, 'click', '[data-act="next"]', function () { goNext(); });

    /* 任何触摸都取消自动前进。 */
    d.addEventListener('pointerdown', userTouched, { capture: true, passive: true });
    d.addEventListener('keydown', userTouched, { capture: true });

    /* 键盘：1/2 或 ←/→ 选择，Esc 回菜单，Space/Enter 下一题。
     * 展台上键盘用不到，但公网版和评测都需要。 */
    d.addEventListener('keydown', function (ev) {
      var st = app.machine.state;
      if (AON.zoom.isOpen()) return;
      if (st === 'round') {
        if (ev.key === '1' || ev.key === 'ArrowLeft') { ev.preventDefault(); pick(0); }
        else if (ev.key === '2' || ev.key === 'ArrowRight') { ev.preventDefault(); pick(1); }
      } else if (st === 'teach') {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); goNext(); }
      } else if (st === 'menu') {
        if (ev.key === 'Enter') { ev.preventDefault(); startSession(); }
      } else if (st === 'attract') {
        app.machine.send('TAP');
      } else if (st === 'summary') {
        if (ev.key === 'Enter') { ev.preventDefault(); playAgain(); }
      }
      if (ev.key === 'Escape' && (st === 'round' || st === 'teach')) app.machine.send('ATTRACT');
      if (ev.key === 'm' || ev.key === 'M') {
        if (AON.loupe) {
          var on = AON.loupe.toggle();
          updateLoupeBtn(on);
        }
      }
    });

    /* attract 与 menu 的整屏点击。 */
    dom.on(dom.$('.screen[data-when="attract"]'), 'click', '*', function () {
      AON.kiosk.requestFullscreen();
      AON.sound.unlock();
      app.machine.send('TAP');
    });
  }

  function updateLoupeBtn(on) {
    if (!app.el.loupeBtn) return;
    app.el.loupeBtn.classList.toggle('btn-primary', !!on);
    app.el.loupeBtn.textContent = AON.i18n.t(on ? 'hud.loupeOn' : 'hud.loupeOff', app.lang);
  }

  function openZoom(slot) {
    var img = app.view.order[slot];
    if (!img) return;
    AON.zoom.open({
      src: img.src,
      alt: AON.i18n.t('round.zoom', app.lang),
      onPick: app.machine.state === 'round' ? function () { pick(slot); } : null
    });
  }

  function wireMenu() {
    dom.on(app.el.menuGrid, 'click', '.level-btn', function () {
      AON.ui.setLevel(app, this.getAttribute('data-level'));
      AON.sound.play('tap');
    });
    dom.on(dom.$('.screen[data-when="menu"]'), 'click', '#menu-start', function () {
      AON.sound.unlock();
      startSession();
    });

    dom.on(dom.$('.screen[data-when="summary"]'), 'click', '#btn-again', function () { playAgain(); });
    dom.on(dom.$('.screen[data-when="summary"]'), 'click', '#btn-tomenu', function () { app.machine.send('MENU'); });
    dom.on(dom.$('.screen[data-when="error"]'), 'click', '#btn-retry', function () { g.location.reload(); });

    if (app.el.loupeBtn) {
      app.el.loupeBtn.addEventListener('click', function () {
        if (AON.loupe) {
          var on = AON.loupe.toggle();
          updateLoupeBtn(on);
        }
      });
    }

    dom.on(g.document.body, 'click', '[id^="btn-deck"]', function () {
      if (AON.deckManager) AON.deckManager.open();
    });

    dom.on(g.document.body, 'click', '[id^="btn-lang"]', function () {
      var langs = AON.i18n.LANGS;
      app.lang = langs[(langs.indexOf(app.lang) + 1) % langs.length];
      AON.i18n.lang = app.lang;
      if (AON.util.storage) AON.util.storage.set('aon.lang', app.lang);
      relabel();
    });

    dom.on(g.document.body, 'click', '#btn-menu', function () {
      app.machine.send('MENU');
    });

    app.el.soundBtn.addEventListener('click', function () {
      var on = !AON.sound.isEnabled();
      AON.sound.setEnabled(on);
      AON.util.storage.set('aon.sound', on ? '1' : '0');
      AON.ui.hud(app);
      if (on) AON.sound.play('tap');
    });
  }

  /** 切换语言后重刷所有静态与动态文案。 */
  function relabel() {
    dom.applyI18n(g.document, app.lang);
    AON.zoom.relabel();
    var st = app.machine.state;
    if (st === 'menu') AON.ui.menu(app);
    if (st === 'summary') AON.ui.summary(app);
    if (st === 'teach') AON.ui.teach(app);
    AON.ui.hud(app);
    updateLoupeBtn(AON.loupe && AON.loupe.isEnabled && AON.loupe.isEnabled());
  }

  /**
   * 再玩一局。
   *
   * ★ 顺序很重要：AGAIN 事件一到就把屏幕切到 round，而那时会话还是旧的，
   *   于是会渲染上一局的最后一题。所以先把新会话和牌堆准备好，再发事件。
   *   另外把上一局见过的真图 id 传下去——展台上一家人连着玩两局，
   *   第二局不该原样重播同样的图。
   */
  function playAgain() {
    app.recentRealIds = (app.session.results || []).map(function (r) { return r.realId; });
    app.session = blankSession(app.level);
    app.deck = newDeck();
    app.session.total = (app.deck && app.deck.count) || app.settings.roundsPerSession;
    app.autoCancelled = false;
    app.machine.send('AGAIN');
  }

  function wireKiosk() {
    if (!app.settings.isKiosk) return;
    app.kiosk = AON.kiosk.create({
      settings: app.settings,
      onCountdown: function (ms) { AON.ui.setCountdown(app, ms); },
      onReset: function () { AON.kiosk.clearSession(); app.machine.send('ATTRACT'); }
    });
  }

  // ── 浸泡测试 ?autoplay=N ───────────────────────────────────────────
  /* 无人值守跑 N 轮，用来看内存是否增长、薄题池下会不会退化成可见重复循环。 */

  function autoplay(left) {
    if (left <= 0) return;
    var st = app.machine.state;
    if (st === 'attract') { app.machine.send('TAP'); return; }
    if (st === 'menu') { startSession(); return; }
    /* 走 onTimeout 而不是直接发事件：结算、音效、播报都在那里。 */
    if (st === 'round') { onTimeout(); return; }
    if (st === 'teach') { goNext(); return; }
    if (st === 'summary') { playAgain(); }
  }

  // ── 启动 ───────────────────────────────────────────────────────────

  function ready(fn) {
    if (g.document.readyState === 'loading') {
      g.document.addEventListener('DOMContentLoaded', fn);
    } else fn();
  }

  ready(function () {
    try {
      boot();
    } catch (e) {
      if (g.console) g.console.error('[aon] 启动失败', e);
      var d = g.document.getElementById('err-detail');
      if (d) d.textContent = (e && e.stack) ? e.stack : String(e);
      g.document.body.setAttribute('data-screen', 'error');
      return;
    }
    if (app.settings.autoplay > 0) {
      var n = app.settings.autoplay;
      var id = setInterval(function () {
        if (n-- <= 0) { clearInterval(id); return; }
        autoplay(1);
      }, 900);
    }
  });

  /* 给控制台与手动测试用的一点点接口。
   * 刻意不导出"哪张是 AI"——要查那个请直接看 data/manifest.js。 */
  g.AON.app = app;
})(typeof window !== 'undefined' ? window : globalThis);
