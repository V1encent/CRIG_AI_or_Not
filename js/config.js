/* config.js — 全部可调参数的唯一真源。
 *
 * 改这里，不要改题库数据。
 * 难度曲线、题量、时限、节奏全部在此，因为这些是【策略】而不是【内容】。
 */
(function (g) {
  'use strict';

  g.AON_CONFIG = {
    schemaVersion: 1,

    /* ─── 难度：三条独立轴如何合成为一个档位 ─────────────────────────── */
    difficulty: {
      // 权重和为 1。改变它们即改变整条难度曲线，无需触碰任何一道题。
      axisWeights: { tells: 0.45, subject: 0.30, postprocessing: 0.25 },

      // 每根轴的取值范围。1 = 全年龄一眼可见，5 = 只有专家看得出。
      axisRange: { min: 1, max: 5 },

      // 归一化分数 [0,1] 的上界（含）。故意不对称：easy 窄、hard 宽。
      tierThresholds: { easy: 0.34, medium: 0.66 },

      // 儿童语域不用 easy/medium/hard 三档，而是一个更细的 1..5 阶梯（显示为星星）。
      kidLevels: 5,

      // 占位图在 tells:5 时并非真的可解（见 DESIGN.md §9），
      // 所以 hard 池只接受 meta.verifiedSolution === true 的题。
      hardRequiresRealContent: true
    },

    /* ─── 一局题量 ──────────────────────────────────────────────────
     * ★ 这是最常改的一个值。kiosk（排队换人快）与 web（坐下来慢慢玩）分开。
     *   改这里即可，不需要动任何其它文件。
     */
    roundsPerSession: { kiosk: 5, web: 8 },

    /* ─── 作答限时 ──────────────────────────────────────────────────
     * 设为 0 即整体关闭限时，让观众有充裕时间细致观察。
     */
    answerTimeLimitMs: 0,

    // 最后 5 秒进度条转为强调色。
    answerTimeWarnMs: 5000,

    /* ─── 分级阶梯爬升模式（100分制） ───────────────────────────── */
    progressive: {
      enabled: true,
      pairsPerLevel: 1,           // 每级抽题数，默认 1 题；后续素材扩充可设为 3 或 4
      targetTotalScore: 100,      // 总积分固定为 100 分
      maxLevel: 4
    },

    /* ─── 教学面板自动前进 ──────────────────────────────────────────
     * kiosk 上自动前进以维持吞吐（按钮带可见倒计时环，任何触摸永久取消）；
     * web 上永远手动。
     */
    teachAutoAdvanceMs: { kiosk: 9000, web: 0 },

    /* ─── 抽题 ──────────────────────────────────────────────────── */
    selector: {
      // 最近 N 轮内不重复。按 realId 计数，不按 puzzleId——见 DESIGN.md §4。
      noRepeatWindow: 3,
      // AI 不得连续同侧超过这么多轮。这一条使"永远选左边"失效。
      avoidSameAiSideRun: 2,
      // 严格池为空/耗尽时的放宽步长与上限。
      poolWidenStep: 0.10,
      poolWidenMax: 0.40
    },

    /* ─── 自适应 ────────────────────────────────────────────────── */
    adapt: {
      startLevel: 2,
      upAfterCorrectStreak: 2,
      downAfterWrongStreak: 1,
      // 自适应按【连续分数】选池，而非按档位。这是它能平滑升降的前提。
      window: 0.15
    },

    /* ─── 计分 ──────────────────────────────────────────────────── */
    scoring: {
      base: { easy: 10, medium: 20, hard: 30 },
      streakStep: 0.10,
      // 连击上限是必需的：无上限的乘数会让一个运气好的孩子在共享展台上刷出无法超越的分数。
      streakCap: 5
    },

    /* ─── 各模式的差异 ──────────────────────────────────────────────
     * ★ UI 层绝不出现散落的 `if (kiosk)`。所有差异都从这里读。
     */
    kiosk: {
      idleToAttractMs: 45000,
      idleCountdownMs: 12000,
      tapMin: 88,
      sound: false,
      showCredit: false
    },
    web: {
      tapMin: 64,
      sound: true,
      showCredit: true
    },

    /* ─── 开发开关 ──────────────────────────────────────────────────
     * 发布构建里由一行 location.search 检查剥除，避免展台被乱输入的 URL 打进调试模式。
     */
    dev: {
      forcePlaceholder: null, // ?placeholder=1 强制全占位 / =0 禁止占位
      autoplay: 0             // ?autoplay=N 无人值守跑 N 轮（浸泡测试）
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
