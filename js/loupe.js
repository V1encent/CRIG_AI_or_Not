/* loupe.js — 双模图像微观探查工具（原位高清 Canvas 放大透镜）
 *
 * 专为桌面端与鼠标用户设计：
 * 在不打断主视图、不弹出全屏浮层的情况下，光标悬浮至卡片 A 或 B 上即可直接
 * 呼出原位 3.0x 高清放大镜，利用 Canvas 从 WebP 原图的 naturalWidth/Height 像素进行
 * 极清重绘与十字准星对准，让研究者与公众能即时对比微观噪点、文字边缘和细胞伪影。
 * 
 * 触摸屏端：自动避让，由全屏 pan/zoom 浮层承载触摸手势。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});

  var LOUPE_SIZE = 220;
  var DEFAULT_ZOOM = 3.0;

  var canvas = null;
  var ctx = null;
  var hud = null;
  var tag = null;
  var enabled = false;
  var currentZoom = DEFAULT_ZOOM;
  var active = false;

  function init() {
    if (canvas || !g.document) return;

    canvas = g.document.createElement('canvas');
    canvas.id = 'board-loupe-canvas';
    canvas.width = LOUPE_SIZE;
    canvas.height = LOUPE_SIZE;
    canvas.className = 'board-loupe-canvas';
    canvas.style.display = 'none';

    hud = g.document.createElement('div');
    hud.id = 'board-loupe-hud';
    hud.className = 'board-loupe-hud';
    hud.style.width = LOUPE_SIZE + 'px';
    hud.style.height = LOUPE_SIZE + 'px';
    hud.style.display = 'none';

    tag = g.document.createElement('span');
    tag.className = 'board-loupe-tag';
    tag.textContent = currentZoom.toFixed(1) + 'x NATIVE';
    hud.appendChild(tag);

    g.document.body.appendChild(canvas);
    g.document.body.appendChild(hud);

    ctx = canvas.getContext('2d');

    bindEvents();
  }

  function hide() {
    active = false;
    if (canvas) canvas.style.display = 'none';
    if (hud) hud.style.display = 'none';
  }

  function render(ev, targetImg) {
    if (!enabled || !targetImg || !targetImg.complete || !targetImg.naturalWidth) {
      hide();
      return;
    }

    // 仅针对鼠标或精确指针，触摸屏自动隐藏避让
    if (ev.pointerType && ev.pointerType !== 'mouse') {
      hide();
      return;
    }

    var rect = targetImg.getBoundingClientRect();
    var cx = ev.clientX;
    var cy = ev.clientY;

    if (cx < rect.left || cx > rect.right || cy < rect.top || cy > rect.bottom) {
      hide();
      return;
    }

    var normX = (cx - rect.left) / rect.width;
    var normY = (cy - rect.top) / rect.height;

    var natX = normX * targetImg.naturalWidth;
    var natY = normY * targetImg.naturalHeight;

    var srcW = (LOUPE_SIZE / currentZoom) * (targetImg.naturalWidth / rect.width);
    var srcH = (LOUPE_SIZE / currentZoom) * (targetImg.naturalHeight / rect.height);
    var srcX = natX - srcW / 2;
    var srcY = natY - srcH / 2;

    var posX = cx - LOUPE_SIZE / 2;
    var posY = cy - LOUPE_SIZE / 2;

    canvas.style.display = 'block';
    canvas.style.left = posX + 'px';
    canvas.style.top = posY + 'px';

    hud.style.display = 'block';
    hud.style.left = posX + 'px';
    hud.style.top = posY + 'px';

    ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();
    ctx.beginPath();
    ctx.arc(LOUPE_SIZE / 2, LOUPE_SIZE / 2, LOUPE_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    try {
      ctx.drawImage(targetImg, srcX, srcY, srcW, srcH, 0, 0, LOUPE_SIZE, LOUPE_SIZE);
    } catch (e) {
      // 跨源容错
    }
    ctx.restore();

    active = true;
  }

  function bindEvents() {
    var board = g.document.getElementById('board');
    if (!board) return;

    board.addEventListener('pointermove', function (ev) {
      if (!enabled) return;
      var target = ev.target;
      var card = target ? target.closest('.card') : null;
      if (!card) {
        hide();
        return;
      }
      var img = card.querySelector('img');
      if (img) render(ev, img);
      else hide();
    });

    board.addEventListener('pointerleave', hide);
    g.addEventListener('pointerdown', function () {
      // 作答点击瞬间短暂收起，避免挡住徽标弹出
      hide();
    });
  }

  var api = {
    init: init,
    toggle: function () {
      enabled = !enabled;
      if (!enabled) hide();
      return enabled;
    },
    setEnabled: function (v) {
      enabled = !!v;
      if (!enabled) hide();
    },
    isEnabled: function () {
      return enabled;
    },
    setZoom: function (factor) {
      currentZoom = Math.max(1.5, Math.min(6.0, factor));
      if (tag) tag.textContent = currentZoom.toFixed(1) + 'x NATIVE';
    },
    hide: hide
  };

  AON.loupe = api;
})(typeof window !== 'undefined' ? window : globalThis);
