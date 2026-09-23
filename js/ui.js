/* ui.js — 五个屏幕的渲染。menu / round / reveal / teach / summary / hud 都在这里。
 *
 * 本来计划拆成 ui.menu.js / ui.round.js / ... 。合并的实际理由：
 * 它们共享同一份 app 状态和同一套 DOM 引用，拆开后每个文件都要
 * 重新声明一遍"app 里有什么"，那层间接一点价值都不产生，
 * 只是把一次改动变成四次跳转。等它真的长到读不动时再拆。
 *
 * ★ 本文件只读 app、只写 DOM，不决定任何流程。
 *   流程全部在 main.js 的状态机监听里。"什么时候显示什么"与
 *   "显示成什么样"分开，是这一层能被单独看懂的原因。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});
  var dom = AON.dom;

  function t(app, key) { return AON.i18n.t(key, app.lang); }
  function pick(app, obj) { return AON.i18n.pick(obj, app.lang); }

  function hasText(v) { return AON.validate.hasText(v); }

  // ── HUD ────────────────────────────────────────────────────────────

  function hud(app) {
    var s = app.session, el = app.el;
    el.hudRound.textContent = t(app, 'hud.round') + ' ' + s.roundIndex + ' ' +
      t(app, 'hud.of') + ' ' + s.total;
    var progCfg = (g.AON_CONFIG && g.AON_CONFIG.progressive) || {};
    if (progCfg.enabled) {
      el.hudScore.textContent = s.score + ' / ' + (s.total || progCfg.targetTotalScore || 12) + ' ' + t(app, 'hud.score');
      dom.show(el.hudLevel, false);
    } else {
      el.hudScore.textContent = s.score + ' ' + t(app, 'hud.score');
      el.hudLevel.textContent = t(app, 'hud.level') + ': ' + t(app, 'menu.' + (s.level || app.level));
      dom.show(el.hudLevel, true);
    }
    el.hudStreak.textContent = s.streak > 0 ? (s.streak + ' ' + t(app, 'hud.streak')) : '';
    var langText = t(app, 'hud.langSwitch');
    var langBtns = g.document ? g.document.querySelectorAll('[id^="btn-lang"]') : [];
    for (var i = 0; i < langBtns.length; i++) {
      langBtns[i].textContent = langText;
    }
    if (el.langBtn) el.langBtn.textContent = langText;
    el.soundBtn.textContent = t(app, 'hud.sound') + (AON.sound.isEnabled() ? ' ✓' : ' ✗');
    el.soundBtn.hidden = app.settings.isKiosk;   /* 展台上不给人关声音的开关（本来就静音） */
    dom.show(el.resetChip, false);
  }

  function renderDifficultyBar(app) {
    var bar = app.el.diffBar;
    var host = app.el.diffSteps;
    if (!bar || !host) return;

    var progCfg = (g.AON_CONFIG && g.AON_CONFIG.progressive) || {};
    if (!progCfg.enabled) {
      dom.show(bar, false);
      return;
    }
    dom.show(bar, true);

    var currentLevel = (app.current && app.current.puzzle && app.current.puzzle.level) || 1;
    var maxLvl = progCfg.maxLevel || 6;

    if (app.el.diffLevelTag) {
      dom.show(app.el.diffLevelTag, false);
    }

    dom.clear(host);
    for (var l = 1; l <= maxLvl; l++) {
      var cls = 'diff-step';
      if (l < currentLevel) cls += ' step-done';
      else if (l === currentLevel) cls += ' step-active';
      else cls += ' step-upcoming';

      var label = (l < currentLevel ? '✓' : String(l));
      var stepEl = dom.el('div', {
        'class': cls,
        'data-lvl': String(l),
        'aria-label': 'Level ' + l
      }, [
        dom.el('span', { 'class': 'step-num', text: label })
      ]);
      host.appendChild(stepEl);
    }
  }

  function setCountdown(app, msLeft) {
    if (msLeft == null) { dom.show(app.el.resetChip, false); return; }
    app.el.resetChip.textContent = t(app, 'kiosk.resetIn') + ' ' + Math.ceil(msLeft / 1000) + 's';
    dom.show(app.el.resetChip, true);
  }

  // ── 菜单 ───────────────────────────────────────────────────────────

  var LEVELS = ['easy', 'medium', 'hard', 'adaptive'];

  function menu(app) {
    var host = app.el.menuGrid;
    dom.clear(host);
    app.levelBtns = {};

    var progCfg = (g.AON_CONFIG && g.AON_CONFIG.progressive) || {};
    if (progCfg.enabled) {
      dom.show(host, false);
      return;
    }
    dom.show(host, true);

    LEVELS.forEach(function (lv) {
      var dots = dom.el('span', { 'class': 'level-dots', 'aria-hidden': 'true' });
      var n = lv === 'adaptive' ? 4 : (lv === 'easy' ? 1 : (lv === 'medium' ? 3 : 5));
      for (var i = 0; i < 5; i++) {
        dots.appendChild(dom.el('i', { 'class': i < n ? 'on' : '' }));
      }
      var btn = dom.el('button', {
        'class': 'level-btn',
        type: 'button',
        'data-level': lv,
        'aria-pressed': app.level === lv ? 'true' : 'false'
      }, [
        dom.el('span', { 'class': 'lv-name', text: t(app, 'menu.' + lv) }),
        dom.el('span', { 'class': 'lv-desc', text: t(app, lv === 'adaptive' ? 'menu.adaptive.hint' : 'menu.' + lv + '.hint') }),
        dots
      ]);
      app.levelBtns[lv] = btn;
      host.appendChild(btn);
    });
  }

  /* 只改菜单的选择，不动正在进行的会话——会话的档位是开局时定下的。 */
  function setLevel(app, lv) {
    app.level = lv;
    Object.keys(app.levelBtns || {}).forEach(function (k) {
      app.levelBtns[k].setAttribute('aria-pressed', k === lv ? 'true' : 'false');
    });
  }

  // ── 出题 ───────────────────────────────────────────────────────────

  function round(app) {
    var view = app.view;
    var board = app.el.board;
    dom.clear(board);
    dom.clear(app.el.teachWrap);
    if (app.el.notePopup) dom.show(app.el.notePopup, false);

    app.slotEls = view.order.map(function (img, i) {
      return AON.answerReveal.buildSlot({ slot: i, image: img, lang: app.lang });
    });
    app.slotEls.forEach(function (n) { board.appendChild(n); });

    /* ★ 自检：此刻的 DOM 里不得有任何东西能指出哪张是 AI。
     *   只在开发参数打开时跑，避免每次出题都遍历一遍子树。 */
    if (app.devAudit) AON.answerReveal.assertClean(board);

    startTimer(app);
    renderDifficultyBar(app);
    hud(app);
  }

  function reveal(app) {
    stopTimer(app);
    AON.answerReveal.reveal(app.slotEls, app.view, app.picked, app.lang);
    var s = app.session;
    var last = s.results[s.results.length - 1];
    if (last) last.correct = AON.answerReveal.isCorrect(app.picked, app.view.aiSlot);
    hud(app);
  }

  // ── 限时 ───────────────────────────────────────────────────────────
  /* 只作用于【作答】。一选立即停——否则"每题都教学"会被 20 秒吃掉。 */

  function startTimer(app) {
    stopTimer(app);
    var limit = app.settings.answerTimeLimitMs;
    var bar = app.el.timer;
    if (!limit) { dom.show(bar, false); return; }
    dom.show(bar, true);
    bar.removeAttribute('data-warn');
    var fill = bar.querySelector('i');
    var t0 = (g.performance || Date).now();
    app.timerRAF = null;

    function step() {
      var left = limit - ((g.performance || Date).now() - t0);
      if (left <= 0) { fill.style.transform = 'scaleX(0)'; app.onTimeout(); return; }
      fill.style.transform = 'scaleX(' + (left / limit) + ')';
      if (left <= app.settings.answerTimeWarnMs) bar.setAttribute('data-warn', '1');
      app.timerRAF = g.requestAnimationFrame(step);
    }
    step();
  }

  function stopTimer(app) {
    if (app.timerRAF) { g.cancelAnimationFrame(app.timerRAF); app.timerRAF = null; }
    if (app.el.timer) dom.show(app.el.timer, false);
  }

  // ── 弹出 Note 说明弹窗 ───────────────────────────────────────────────
  function showNotePopup(app) {
    if (!app.el.notePopup) return;
    if (app.cancelAutoAdvance) {
      app.cancelAutoAdvance();
    } else if (app.timers && app.timers.auto) {
      clearInterval(app.timers.auto);
      app.timers.auto = null;
    }
    app.autoCancelled = true;

    var p = app.current && app.current.puzzle;
    if (!p) return;

    var v = AON.answerReveal.verdictOf(app.picked, app.view.aiSlot);
    var isCorrect = (v === 'correct');

    if (app.el.noteVerdictBadge) {
      dom.clear(app.el.noteVerdictBadge);
      app.el.noteVerdictBadge.appendChild(dom.el('span', {
        'class': 'badge verdict-pill ' + (isCorrect ? 'badge-real' : 'badge-ai'),
        text: (isCorrect ? '✓ ' : '✗ ') + t(app, isCorrect ? 'reveal.correct' : (v === 'wrong' ? 'reveal.wrong' : 'round.timeUp'))
      }));
    }

    var s = app.session;
    if (app.el.noteLevelChip) {
      app.el.noteLevelChip.textContent = t(app, 'hud.round') + ' ' + (s ? s.roundIndex : 1) + ' / ' + (s ? s.total : 12);
    }

    var noteObj = p.note || (p.teaching && p.teaching.explanation) || '';
    var noteText = pick(app, noteObj);
    if (app.el.noteText) {
      app.el.noteText.textContent = noteText;
    }

    var ruleObj = (p.teaching && p.teaching.rule) || '';
    var ruleText = pick(app, ruleObj);
    if (app.el.noteRuleCard && app.el.noteRuleText) {
      if (ruleText) {
        app.el.noteRuleText.textContent = ruleText;
        dom.show(app.el.noteRuleCard, true);
      } else {
        dom.show(app.el.noteRuleCard, false);
      }
    }

    if (app.el.popupNextLabel) {
      app.el.popupNextLabel.textContent = nextLabel(app);
    }

    dom.show(app.el.notePopup, true);

    if (app.el.btnPopupNext) {
      app.el.btnPopupNext.focus();
    }
  }

  // ── 教学面板 ───────────────────────────────────────────────────────
  /* 玩家完成选择后：弹出该组图片的 note 说明，并在下方保留便捷操作栏 */

  function teach(app) {
    var view = app.view;
    var host = app.el.teachWrap;
    dom.clear(host);

    var correct = AON.answerReveal.verdictOf(app.picked, view.aiSlot);
    var isCorrect = (correct === 'correct');

    // 自动弹出对应题目的辨别 note
    showNotePopup(app);

    var verdictEl = dom.el('div', { 'class': 'simple-verdict' }, [
      dom.el('span', {
        'class': 'badge verdict-pill ' + (isCorrect ? 'badge-real' : 'badge-ai'),
        text: (isCorrect ? '✓ ' : '✗ ') + t(app, isCorrect ? 'reveal.correct' : (correct === 'wrong' ? 'reveal.wrong' : 'round.timeUp'))
      })
    ]);

    var panel = dom.el('div', { 'class': 'teach teach-compact' }, [
      verdictEl,
      dom.el('button', {
        'class': 'btn btn-show-note',
        type: 'button',
        'data-act': 'show-note',
        text: t(app, 'teach.showNote')
      }),
      dom.el('button', {
        'class': 'btn btn-primary btn-next',
        type: 'button',
        'data-act': 'next',
        text: nextLabel(app) + ' →'
      })
    ]);

    var progCfg = (g.AON_CONFIG && g.AON_CONFIG.progressive) || {};
    var allowAuto = (!progCfg.enabled || progCfg.autoAdvance);
    if (app.settings.teachAutoAdvanceMs > 0 && !app.autoCancelled && allowAuto) {
      panel.appendChild(autoRing(app));
    }

    host.appendChild(panel);
    host.scrollTop = 0;
  }

  function nextLabel(app) {
    var s = app.session;
    return t(app, s.roundIndex >= s.total ? 'teach.finish' : 'teach.next');
  }

  /** 聚焦到破绽的 AI 图 + 细环。环在【同一个被缩放的层】里，否则会指错位置。 */
  function focusFigure(app, image, region) {
    if (!image || !image.src) return null;
    var zoom = dom.el('div', { 'class': 'teach-zoom' });
    zoom.appendChild(dom.el('img', { src: image.src, alt: '', draggable: 'false' }));

    if (region && isFinite(region.x) && isFinite(region.y) && isFinite(region.w) && isFinite(region.h)) {
      zoom.appendChild(dom.el('span', {
        'class': 'ring',
        style: 'left:' + (region.x * 100) + '%;top:' + (region.y * 100) + '%;' +
               'width:' + (region.w * 100) + '%;height:' + (region.h * 100) + '%'
      }));
      /* 让该区域居中：把区域中心平移到盒子中心。
       * scale 取到"区域大致占满盒子"，并夹在 [1, 3] —— 超过 3× 会把
       * 图片本身的分辨率放大成马赛克，反而看不清。 */
      g.requestAnimationFrame(function () {
        var box = zoom.parentNode;
        if (!box) return;
        var k = Math.min(3, Math.max(1, 0.62 / Math.max(0.02, Math.max(region.w, region.h))));
        var cx = region.x + region.w / 2, cy = region.y + region.h / 2;
        zoom.style.transform = 'translate(' + ((0.5 - k * cx) * 100) + '%,' +
          ((0.5 - k * cy) * 100) + '%) scale(' + k + ')';
      });
    }
    return dom.el('figure', { 'class': 'teach-focus' }, [zoom]);
  }

  function details(app, view) {
    var ai = view.ai && view.ai.provenance;
    var real = view.real && view.real.provenance;
    var rows = [];

    if (ai && hasText(ai.prompt)) {
      rows.push(dom.el('div', { 'class': 'teach-block' }, [
        dom.el('span', { 'class': 'teach-label', text: t(app, 'teach.prompt') }),
        dom.el('p', { 'class': 'prompt', text: ai.prompt })
      ]));
    }
    var model = ai && [ai.generator, ai.model].filter(Boolean).join(' ');
    if (model) {
      rows.push(dom.el('div', { 'class': 'teach-block' }, [
        dom.el('span', { 'class': 'teach-label', text: t(app, 'teach.model') }),
        dom.el('p', { text: model })
      ]));
    }
    /* 真图出处只在 web 模式屏显。kiosk 上为了合规仍需展示，
     * 但印在机器旁边的实体牌上，不占教学面板。 */
    if (app.settings.showCredit && real && hasText(real.credit)) {
      rows.push(dom.el('div', { 'class': 'teach-block' }, [
        dom.el('span', { 'class': 'teach-label', text: t(app, 'teach.credit') }),
        dom.el('p', { text: real.credit + (real.licence ? ' · ' + real.licence : '') })
      ]));
    }
    if (!rows.length) return null;

    var el = dom.el('details', { 'class': 'teach-details' });
    var sum = dom.el('summary', {}, []);
    sum.textContent = t(app, 'teach.details');
    el.appendChild(sum);
    rows.forEach(function (r) { el.appendChild(r); });
    return el;
  }

  /** kiosk 的自动前进倒计时环。任何触摸永久取消（见 main.js）。 */
  function autoRing(app) {
    var total = app.settings.teachAutoAdvanceMs;
    var R = 13, C = 2 * Math.PI * R;
    var wrap = dom.el('div', { 'class': 'auto-ring' });
    var svg = g.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '34'); svg.setAttribute('height', '34');
    svg.setAttribute('viewBox', '0 0 34 34');
    svg.setAttribute('aria-hidden', 'true');
    var track = g.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('class', 'track');
    track.setAttribute('cx', '17'); track.setAttribute('cy', '17'); track.setAttribute('r', String(R));
    var fill = g.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    fill.setAttribute('class', 'fill');
    fill.setAttribute('cx', '17'); fill.setAttribute('cy', '17'); fill.setAttribute('r', String(R));
    fill.setAttribute('stroke-dasharray', String(C));
    fill.setAttribute('stroke-dashoffset', '0');
    svg.appendChild(track); svg.appendChild(fill);
    wrap.appendChild(svg);
    wrap.appendChild(dom.el('span', { 'class': 'visually-hidden', text: t(app, 'teach.autoIn') }));

    app.el.autoFill = fill;
    app.el.autoDash = C;
    return wrap;
  }

  function autoTick(app, msLeft) {
    if (!app.el.autoFill) return;
    var frac = msLeft / app.settings.teachAutoAdvanceMs;
    app.el.autoFill.setAttribute('stroke-dashoffset', String(app.el.autoDash * (1 - frac)));
  }

  // ── 总结 ───────────────────────────────────────────────────────────

  function summary(app) {
    var s = app.session;
    var r = AON.scoring.rank(s.correct, s.total);
    var host = app.el.summaryBody;
    dom.clear(host);

    var progCfg = (g.AON_CONFIG && g.AON_CONFIG.progressive) || {};
    var scoreStr = s.score + (progCfg.enabled ? (' / ' + (s.total || progCfg.targetTotalScore || 12)) : '') + ' ' + t(app, 'hud.score');

    host.appendChild(dom.el('p', { 'class': 'summary-score' }, [
      dom.el('span', { text: t(app, 'summary.youGot') + ' ' }),
      dom.el('b', { text: String(s.correct) }),
      dom.el('span', { text: ' ' + t(app, 'summary.of') + ' ' + s.total + ' ' + t(app, 'summary.correct') }),
      dom.el('span', { text: ' · ' + scoreStr })
    ]));

    var stars = dom.el('div', { 'class': 'stars', 'aria-hidden': 'true' });
    for (var i = 0; i < 3; i++) {
      stars.appendChild(dom.el('span', { 'class': i < r.stars ? 'on' : 'off', text: i < r.stars ? '★' : '☆' }));
    }
    host.appendChild(stars);
    host.appendChild(dom.el('h2', { text: t(app, 'rank.' + r.id) }));
    host.appendChild(dom.el('p', { 'class': 'summary-note', text: t(app, 'rank.' + r.id + '.note') }));

    /* 本局练过的线索。这是玩家真正带走的东西，所以列出来。 */
    var cues = [];
    s.results.forEach(function (x) {
      var c = x.puzzle && x.puzzle.teaching && x.puzzle.teaching.cue;
      if (c && cues.indexOf(c) < 0) cues.push(c);
    });
    if (cues.length) {
      var box = dom.el('div', { 'class': 'summary-recap' }, [
        dom.el('span', { 'class': 'teach-label', text: t(app, 'summary.recap') })
      ]);
      var row = dom.el('div', { 'class': 'row center' });
      cues.forEach(function (c) { row.appendChild(dom.el('span', { 'class': 'chip', text: t(app, 'cue.' + c) })); });
      box.appendChild(row);
      host.appendChild(box);
    }
    var langBtns = g.document ? g.document.querySelectorAll('[id^="btn-lang"]') : [];
    for (var j = 0; j < langBtns.length; j++) {
      langBtns[j].textContent = t(app, 'hud.langSwitch');
    }
  }

  // ── 错误 ───────────────────────────────────────────────────────────

  function error(app, detail) {
    app.el.errTitle.textContent = t(app, 'error.title');
    app.el.errDetail.textContent = detail || '';
  }

  AON.ui = {
    hud: hud,
    renderDifficultyBar: renderDifficultyBar,
    showNotePopup: showNotePopup,
    setCountdown: setCountdown,
    menu: menu,
    setLevel: setLevel,
    round: round,
    reveal: reveal,
    teach: teach,
    autoTick: autoTick,
    nextLabel: nextLabel,
    stopTimer: stopTimer,
    summary: summary,
    error: error,
    LEVELS: LEVELS
  };
})(typeof window !== 'undefined' ? window : globalThis);
