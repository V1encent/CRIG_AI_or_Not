/* fixture.difficulty.js — 难度的黄金用例表。
 *
 * ★ 这张表被【两处】使用：
 *   1. tests/test.difficulty.js（JS 实现）
 *   2. tools/verify_assets.py（约 15 行 Python 重实现，阶段 5）
 *   两边必须得出相同结果。否则你调参时看的统计报告，描述的题
 *   和游戏实际出的题不是同一批——这是最难发现的一类错误。
 *
 *   字段：d = 三轴输入；score = 归一化分数；tier = 期望档位；why = 这个用例在测什么
 */
(function (g) {
  'use strict';

  g.AON_FIXTURES = {
    /**
     * 专供边界测试的配置。全部取值为二进制精确（0.5 / 0.25），
     * 于是"落在阈值上"这件事可以被精确断言。
     * ★ 只改权重与阈值，轴范围与 kidLevels 保持与生产一致，
     *   否则测的就不是同一套语义了。
     */
    exactCfg: {
      axisWeights: { tells: 0.5, subject: 0.25, postprocessing: 0.25 },
      axisRange: { min: 1, max: 5 },
      tierThresholds: { easy: 0.25, medium: 0.5 },
      kidLevels: 5,
      hardRequiresRealContent: true
    },

    // 权重：tells 0.45 / subject 0.30 / postprocessing 0.25（和为 1）
    cases: [
      { d: { tells: 1, subject: 1, postprocessing: 1 }, score: 0.0, tier: 'easy',
        why: '三轴全 1 → 下界' },
      { d: { tells: 2, subject: 2, postprocessing: 2 }, score: 0.25, tier: 'easy',
        why: '全 2 → 仍在 easy（阈值 0.34）' },
      { d: { tells: 3, subject: 3, postprocessing: 3 }, score: 0.5, tier: 'medium',
        why: '全 3 → 正中 medium' },
      { d: { tells: 4, subject: 4, postprocessing: 4 }, score: 0.75, tier: 'hard',
        why: '全 4 → 已过 0.66' },
      { d: { tells: 5, subject: 5, postprocessing: 5 }, score: 1.0, tier: 'hard',
        why: '三轴全 5 → 上界' },

      // ★ 两条轴互相抵消 —— 这是三轴模型存在的理由。
      //   单一 hard 标签无法区分这两种题，而它们是同一档。
      { d: { tells: 5, subject: 1, postprocessing: 1 }, score: 0.45, tier: 'medium',
        why: '简单场景里的细微错误 → medium' },
      { d: { tells: 1, subject: 5, postprocessing: 5 }, score: 0.55, tier: 'medium',
        why: '复杂场景里的明显错误 → 也是 medium' },

      // 单轴拉动
      { d: { tells: 3, subject: 1, postprocessing: 1 }, score: 0.225, tier: 'easy',
        why: '只有 tells 拉到 3，不足以进 medium' },
      { d: { tells: 1, subject: 3, postprocessing: 1 }, score: 0.15, tier: 'easy',
        why: '只有 subject 拉到 3' },

      // 越界必须 clamp，而不是溢出
      { d: { tells: 99, subject: -5, postprocessing: 3 }, score: 0.575, tier: 'medium',
        why: '越界输入：tells→1.0, subject→0, pp→0.5' },

      // 缺轴：计入分母但不计入分子 → 比"重新归一化"更容易，而不是更难
      { d: { tells: 5 }, score: 0.45, tier: 'medium',
        why: '缺轴不得被 renormalize（那会得到 1.0 → hard，是更糟的失败方向）' },
      { d: {}, score: 0.0, tier: 'easy',
        why: '完全没有评分 → 最容易，而不是 NaN' },
      { d: { tells: 'x', subject: null, postprocessing: undefined }, score: 0.0, tier: 'easy',
        why: '非数值轴按缺失处理，不得产生 NaN' }
    ],

    // ── 阈值边界 ────────────────────────────────────────────────────
    // ★ 用【二进制精确】的权重与阈值，而不是去凑 0.34 / 0.66 这两个小数。
    //
    //   第一版是拿 tells=4.0222222 之类的值硬凑 0.34 的。那是错的：
    //   3.64-1 在 double 里是 2.6400000000000001243，除以 4 后【略高于】0.66，
    //   于是"恰好落在边界上"这条断言会随最后一位浮点误差随机翻档。
    //   边界语义（≤ 即含）必须用精确值测，否则测的是浮点噪声。
    //
    //   这里 0.5 / 0.25 与阈值 0.25 / 0.5 在二进制里都是精确的。
    boundaries: [
      { cfg: 'exact', d: { tells: 3, subject: 1, postprocessing: 1 }, score: 0.25, tier: 'easy',
        why: '恰好落在 easy 上界，且 ≤ 是含的' },
      { cfg: 'exact', d: { tells: 3.5, subject: 1, postprocessing: 1 }, score: 0.3125, tier: 'medium',
        why: '刚过 easy 上界' },
      { cfg: 'exact', d: { tells: 5, subject: 1, postprocessing: 1 }, score: 0.5, tier: 'medium',
        why: '恰好落在 medium 上界，且 ≤ 是含的' },
      { cfg: 'exact', d: { tells: 5, subject: 2, postprocessing: 1 }, score: 0.5625, tier: 'hard',
        why: '刚过 medium 上界' }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
