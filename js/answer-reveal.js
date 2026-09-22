/* answer-reveal.js — 答案进出 DOM 的唯一通道。
 *
 * ★ 这个文件的存在理由只有一个：
 *   「揭晓前 DOM 里没有任何东西能指出哪张是 AI」这条要求，
 *   如果分散在渲染层各处，就迟早会被某一次"顺手加个 class"破坏。
 *   集中到一处，它才是可检验的——见 assertClean()。
 *
 * ★ 两条落地规则：
 *   1. 卡片元素上不写任何答案相关的属性。真相只在揭晓时以 data-role 出现。
 *   2. 徽标【揭晓时才创建】，不是先建好再隐藏。DOM 里不存在的东西，
 *      DevTools 看不见，读屏读不到，CSS 选择器也匹配不到。
 *
 * 纯逻辑部分（slots / isCorrect / verdictOf）零 DOM，可 headless 测。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});

  /**
   * 把题目解成"左槽放什么、右槽放什么"。
   *
   * aiSlot：0 = AI 在左，1 = AI 在右。
   * ★ aiSlot 由 selector 决定，不由题目数据决定——题目数据里
   *   images 的顺序不携带任何信息（见 selector.sidesOf 的注释）。
   */
  function slots(puzzle, aiSlot) {
    var s = AON.selector.sidesOf(puzzle);
    if (!s.ai || !s.real) return null;
    var slot = aiSlot === 1 ? 1 : 0;
    var order = slot === 1 ? [s.real, s.ai] : [s.ai, s.real];
    return {
      aiSlot: slot,
      ai: s.ai,
      real: s.real,
      order: order,
      /* 便于断言：left/right 是显示位置，不是身份。 */
      left: order[0],
      right: order[1]
    };
  }

  function isCorrect(pickedSlot, aiSlot) {
    return pickedSlot === 0 || pickedSlot === 1 ? pickedSlot === aiSlot : false;
  }

  /** 'correct' | 'wrong' | null（没作答 = 超时，不判错也不判对） */
  function verdictOf(pickedSlot, aiSlot) {
    if (pickedSlot !== 0 && pickedSlot !== 1) return null;
    return isCorrect(pickedSlot, aiSlot) ? 'correct' : 'wrong';
  }

  // ─────────────────────────────────────────────────────────────────
  // 以下需要 DOM
  // ─────────────────────────────────────────────────────────────────

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function iconMagnifier() {
    var svg = g.document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var c = g.document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', '10.5'); c.setAttribute('cy', '10.5'); c.setAttribute('r', '6.5');
    c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'currentColor'); c.setAttribute('stroke-width', '2');
    var l = g.document.createElementNS(SVG_NS, 'line');
    l.setAttribute('x1', '15.4'); l.setAttribute('y1', '15.4');
    l.setAttribute('x2', '21'); l.setAttribute('y2', '21');
    l.setAttribute('stroke', 'currentColor'); l.setAttribute('stroke-width', '2');
    l.setAttribute('stroke-linecap', 'round');
    svg.appendChild(c); svg.appendChild(l);
    return svg;
  }

  /**
   * 建一个卡槽（卡片 + 浮在上面的放大按钮）。
   *
   * ★ 这里【故意】不接收 puzzle、不接收 isAI。
   *   它能拿到的只有一张图的 src 与尺寸，所以它在结构上就【无法】泄露答案——
   *   不是靠自觉，是靠它根本不知道。
   *
   * opts: { slot, image, lang, onZoom }
   */
  function buildSlot(opts) {
    var dom = AON.dom, i18n = AON.i18n;
    var img = opts.image;
    var slot = opts.slot;

    var pic = dom.el('img', {
      src: img.src,
      /* alt 只说"这是哪一张"，绝不说它是什么。见 DESIGN.md §7：
       * 这是反作弊要求与无障碍要求同向的唯一一处，也最容易写错。 */
      alt: i18n.t(slot === 0 ? 'alt.imageA' : 'alt.imageB', opts.lang),
      width: img.width || 1200,
      height: img.height || 800,
      draggable: 'false',
      decoding: 'async'
    });

    var label = dom.el('span', {
      'class': 'slot-label',
      'aria-hidden': 'true',
      text: slot === 0 ? 'A' : 'B'
    });

    var card = dom.el('button', {
      'class': 'card',
      type: 'button',
      'data-slot': String(slot),
      'aria-describedby': 'round-question'
    }, [pic, label]);

    return dom.el('div', { 'class': 'card-slot', 'data-slot': String(slot) }, [card]);
  }

  /** 从卡槽里取卡片按钮。 */
  function cardOf(slotEl) {
    return slotEl && slotEl.querySelector('.card');
  }

  function badgeFor(role, lang) {
    return AON.dom.el('span', {
      'class': 'badge card-badge ' + (role === 'ai' ? 'badge-ai' : 'badge-real'),
      text: AON.i18n.t(role === 'ai' ? 'reveal.ai' : 'reveal.real', lang)
    });
  }

  /**
   * 揭晓。
   *
   * slotEls：长度 2 的 .card-slot 数组，索引即槽位。
   * pickedSlot：0 / 1 / null（超时未作答）。
   *
   * 返回一段可被读屏播报的文案（调用方负责塞进 aria-live 节点）。
   */
  function reveal(slotEls, view, pickedSlot, lang, opts) {
    opts = opts || {};
    var i18n = AON.i18n;

    slotEls.forEach(function (slotEl, i) {
      var card = cardOf(slotEl);
      if (!card) return;
      var role = (i === view.aiSlot) ? 'ai' : 'real';

      card.setAttribute('data-role', role);
      if (i === pickedSlot) card.setAttribute('data-picked', '1');

      var v = verdictOf(pickedSlot, view.aiSlot);
      if (v && i === pickedSlot) {
        card.setAttribute('data-verdict', v);
        card.appendChild(AON.dom.el('span', {
          'class': 'verdict',
          'aria-hidden': 'true',       /* 播报文案由 aria-live 负责，避免重复读两遍 */
          text: v === 'correct' ? '✓' : '✗'
        }));
      }

      /* ★ 徽标此刻才被创建。 */
      card.appendChild(badgeFor(role, lang));

      /* 卡片不再可点。用 disabled 而不是 removal：读屏用户需要
       * 知道"这两张还在，只是不能再选了"。 */
      card.disabled = true;
    });

    /* 读屏播报：先判对错，再说明哪张是 AI。
     * 超时不判"错"——展台上 20 秒本来就紧，说"错了"不公道。 */
    var v = verdictOf(pickedSlot, view.aiSlot);
    var said = v === 'correct' ? i18n.t('reveal.correct', lang)
      : (v === 'wrong' ? i18n.t('reveal.wrong', lang) : i18n.t('round.timeUp', lang));
    return said + ' ' + i18n.t('reveal.thisIsAi', lang);
  }

  /** 清掉所有揭晓痕迹，让卡片回到可作答的中性状态。 */
  function reset(slotEls) {
    (slotEls || []).forEach(function (slotEl) {
      var card = cardOf(slotEl);
      if (!card) return;
      card.removeAttribute('data-role');
      card.removeAttribute('data-picked');
      card.removeAttribute('data-verdict');
      card.disabled = false;
      AON.dom.$$('.card-badge, .verdict', card).forEach(function (n) {
        n.parentNode.removeChild(n);
      });
    });
  }

  /**
   * ★ 开发期自检：一个正处于【作答中】的 DOM 子树里，
   *   不得有任何东西能指出哪张是 AI。
   *
   * 检查的是属性与类名，不是文本——因为文本检查会误报
   * （比如界面文案里本来就有 "AI" 两个字）。
   * 这正是 README 手动清单第 5 条要跑的东西。
   */
  var LEAKY_ATTR = /^(data-is-ai|data-ai|data-real|data-answer|data-role|data-verdict|data-picked)$/i;
  var LEAKY_CLASS = /(^|[\s-])(ai|real|echt|fake|answer|solution)($|[\s-])/i;

  function audit(root) {
    var problems = [];
    AON.dom.$$('*', root).forEach(function (n) {
      Array.prototype.slice.call(n.attributes || []).forEach(function (a) {
        if (LEAKY_ATTR.test(a.name)) {
          problems.push({ node: n, why: 'attribute:' + a.name });
        }
      });
      var cls = n.getAttribute && n.getAttribute('class');
      if (cls && LEAKY_CLASS.test(cls)) problems.push({ node: n, why: 'class:' + cls });
      /* 放大按钮的 data-zoom / 卡片的 data-slot 是槽位，不是身份——不违规。 */
    });
    return problems;
  }

  function assertClean(root) {
    var problems = audit(root);
    if (problems.length && g.console && g.console.error) {
      g.console.error('[aon] 揭晓前 DOM 里出现了答案线索：', problems);
    }
    return problems.length === 0;
  }

  AON.answerReveal = {
    /* 纯逻辑 */
    slots: slots,
    isCorrect: isCorrect,
    verdictOf: verdictOf,
    /* DOM */
    buildSlot: buildSlot,
    cardOf: cardOf,
    reveal: reveal,
    reset: reset,
    audit: audit,
    assertClean: assertClean
  };
})(typeof window !== 'undefined' ? window : globalThis);
