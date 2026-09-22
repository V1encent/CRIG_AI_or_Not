/* modes.js — kiosk / web 的配置层。
 *
 * ★ 模式由【配置】决定，不由协议决定：`?mode=kiosk` 必须能在 http 下跑起来。
 *   否则 kiosk 的行为只有在展台现场才测得到——而展台是最不方便调试的地方。
 *   协议只贡献【默认值】。
 *
 * ★ UI 层绝不出现散落的 `if (kiosk)`。所有模式差异都从这里读，
 *   这是"一份代码活两处"能成立的原因。
 *
 * 纯函数 + 注入式 query。零 DOM，可 headless 测。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});

  var MODES = ['kiosk', 'web'];

  function normalise(mode) {
    return MODES.indexOf(mode) >= 0 ? mode : null;
  }

  /**
   * 解析当前模式。
   * opts: { forced, protocol, cfg }
   *   forced   —— 已解析出的 ?mode= 值（未解析就传 undefined）
   *   protocol —— 例如 'file:'。默认取 g.location.protocol
   */
  function resolve(opts) {
    opts = opts || {};
    var forced = normalise(opts.forced);
    if (forced) return forced;
    var proto = opts.protocol != null
      ? opts.protocol
      : ((g.location && g.location.protocol) || '');
    /* file:// 默认 kiosk —— 展台就是双击 index.html 启动的。 */
    return String(proto).toLowerCase() === 'file:' ? 'kiosk' : 'web';
  }

  /** '0' / 'false' / 'nee' → false；'1' / 'true' / 'ja' → true；其余 null。 */
  function parseBool(v) {
    if (v == null) return null;
    var s = String(v).trim().toLowerCase();
    if (s === '' || s === '1' || s === 'true' || s === 'yes' || s === 'ja' || s === 'aan') return true;
    if (s === '0' || s === 'false' || s === 'no' || s === 'nee' || s === 'uit') return false;
    return null;
  }

  function parseLevel(v) {
    var s = v && String(v).trim().toLowerCase();
    return (s === 'easy' || s === 'medium' || s === 'hard' || s === 'adaptive') ? s : null;
  }

  function intOr(v, fallback) {
    var n = parseInt(v, 10);
    return isFinite(n) ? n : fallback;
  }

  /**
   * 把 config.js 摊平成一个 UI 直接可用的对象。
   * 这样 UI 模块永远不需要知道"kiosk 和 web 在哪里不同"。
   */
  function settings(mode, cfg, dev) {
    cfg = cfg || g.AON_CONFIG;
    dev = dev || {};
    var m = normalise(mode) || 'web';
    var sm = cfg[m] || {};
    var rounds = (cfg.roundsPerSession || {})[m];
    var autoAdvance = (cfg.teachAutoAdvanceMs || {})[m];

    return {
      mode: m,
      isKiosk: m === 'kiosk',

      roundsPerSession: rounds == null ? 8 : rounds,

      /* 0 = 不限时。限时只作用于【作答】，选完立即停。 */
      answerTimeLimitMs: cfg.answerTimeLimitMs || 0,
      answerTimeWarnMs: cfg.answerTimeWarnMs || 0,

      /* 0 = 教学面板永远手动前进。 */
      teachAutoAdvanceMs: autoAdvance || 0,

      tapMin: sm.tapMin || 64,
      sound: sm.sound === true,
      showCredit: sm.showCredit === true,

      /* 空闲回 attract。web 下是 0，也就是永不清场——公网上没人排队。 */
      idleToAttractMs: m === 'kiosk' ? (sm.idleToAttractMs || 45000) : 0,
      idleCountdownMs: m === 'kiosk' ? (sm.idleCountdownMs || 12000) : 0,

      /* 开发开关 ?placeholder=0|1 —— 发布时把这一段连同 config.dev 一起剥掉。 */
      forcePlaceholder: dev.placeholder == null ? null : dev.placeholder,
      autoplay: dev.autoplay || 0,
      seed: dev.seed,
      level: dev.level
    };
  }

  /**
   * 解析开发用查询参数。
   * read 是一个 `name → value | null` 的函数（默认 AON.util.query）。
   * 注入它是为了能 headless 测——Node 里没有 location。
   */
  function devOptions(read) {
    read = read || AON.util.query;
    var auto = read('autoplay');
    var seed = read('seed');
    return {
      placeholder: parseBool(read('placeholder')),
      autoplay: auto == null ? 0 : Math.max(0, intOr(auto, 0)),
      seed: seed == null ? null : intOr(seed, null),
      level: parseLevel(read('level')),
      mode: read('mode'),
      /* 三态，不是布尔：null = 没写（由调用方决定默认），true/false = 明确开关。
       * ★ 全部 dev 开关都必须走这个解析器。曾经 audit 是在 main.js 里直接读的，
       *   于是它是唯一一个没有测试覆盖、也没写进 README 的开关——
       *   而恰恰是它在守"答案不进 DOM"这条最重要的规则。 */
      audit: parseBool(read('audit'))
    };
  }

  /* 教学面板的自动前进：任何一次触摸都会永久取消它（见 ui.teach.js）。
   * 这里只描述"应该多久"，"是否已被取消"是运行期状态。 */
  function shouldAutoAdvance(s, cancelled) {
    return !cancelled && s.teachAutoAdvanceMs > 0;
  }

  AON.modes = {
    MODES: MODES,
    normalise: normalise,
    resolve: resolve,
    settings: settings,
    devOptions: devOptions,
    shouldAutoAdvance: shouldAutoAdvance,
    parseBool: parseBool,
    parseLevel: parseLevel
  };
})(typeof window !== 'undefined' ? window : globalThis);
