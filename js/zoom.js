/* zoom.js — 全屏查看一张图。
 *
 * ★ 为什么是独立浮层，而不是卡片上的手势：
 *   "点选作答"和"平移缩放"如果共用同一个面，就必然要用手势去区分它们，
 *   而手势区分在全年龄触摸场景下是最容易出错的东西——老人和小孩会误触、
 *   会双指乱划。做成浮层后两个面【永不重叠】，这一整类问题就不存在了。
 *
 * 浮层里带一个"选这张"，所以误触放大不付出任何代价。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});
  var dom = AON.dom;

  var overlay, stage, imgEl, loupe, onClose = null, opener = null;
  var scale = 1, tx = 0, ty = 0, baseW = 0, baseH = 0;
  var pointers = {}, pinchStart = null, lastTap = 0, built = false;

  var MAX_SCALE = 6;

  /* 放大镜的显隐用内联 display 控制，不用 hidden 属性也不用 class：
   * hidden 会被 CSS 里的 display:block 盖掉，而 class 切换又要和
   * @media (hover:hover) 的规则打架。内联样式没有这些歧义。 */
  function loupeOn(on) { if (loupe) loupe.style.display = on ? 'block' : 'none'; }

  function t(key) { return AON.i18n.t(key); }

  function build() {
    if (built) return;
    var close = dom.el('button', { 'class': 'btn', type: 'button', 'data-zoom-close': '1' }, []);
    close.textContent = t('round.close');

    var pick = dom.el('button', { 'class': 'btn btn-primary', type: 'button', 'data-zoom-pick': '1' }, []);
    pick.textContent = t('round.pick');

    stage = dom.el('div', { 'class': 'zoom-stage' });
    imgEl = dom.el('img', { alt: '', draggable: 'false' });
    loupe = dom.el('div', { 'class': 'loupe', 'aria-hidden': 'true' });
    stage.appendChild(imgEl);
    stage.appendChild(loupe);

    overlay = dom.el('div', {
      'class': 'zoom-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('round.zoom'),
      hidden: ''
    }, [
      stage,
      dom.el('div', { 'class': 'zoom-bar' }, [close, dom.el('div', { 'class': 'spacer' }), pick])
    ]);

    g.document.body.appendChild(overlay);

    close.addEventListener('click', api.close);
    pick.addEventListener('click', function () {
      var cb = api._onPick;
      api.close();
      if (cb) cb();
    });

    /* 点浮层的空白处也关闭。但点在图上不关——那多半是误触。 */
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay || ev.target === stage) api.close();
    });

    bindGestures();
    built = true;
  }

  function clampPan() {
    var sw = stage.clientWidth, sh = stage.clientHeight;
    var w = baseW * scale, h = baseH * scale;
    tx = (w <= sw) ? (sw - w) / 2 : Math.min(0, Math.max(sw - w, tx));
    ty = (h <= sh) ? (sh - h) / 2 : Math.min(0, Math.max(sh - h, ty));
  }

  function apply() {
    clampPan();
    imgEl.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
  }

  /* 把图缩放到恰好铺满 stage（cover），作为 1× 的基准。 */
  function fit() {
    var iw = imgEl.naturalWidth || 1200, ih = imgEl.naturalHeight || 800;
    var sw = stage.clientWidth || 1, sh = stage.clientHeight || 1;
    baseW = Math.max(sw, sh * (iw / ih));
    baseH = baseW * (ih / iw);
    imgEl.style.width = baseW + 'px';
    imgEl.style.height = baseH + 'px';
    scale = 1;
    tx = (sw - baseW) / 2;
    ty = (sh - baseH) / 2;
    apply();
  }

  function zoomAt(cx, cy, next) {
    var s2 = Math.min(MAX_SCALE, Math.max(1, next));
    /* 让光标下的那一点保持不动——否则缩放会"跑"，玩家会失去位置感。 */
    tx = cx - (cx - tx) * (s2 / scale);
    ty = cy - (cy - ty) * (s2 / scale);
    scale = s2;
    apply();
  }

  function bindGestures() {
    stage.addEventListener('pointerdown', function (ev) {
      stage.setPointerCapture(ev.pointerId);
      pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      stage.classList.add('dragging');

      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinchStart = {
          d: Math.hypot(a.x - b.x, a.y - b.y),
          scale: scale
        };
      }
    });

    stage.addEventListener('pointermove', function (ev) {
      if (pointers[ev.pointerId]) {
        var p = pointers[ev.pointerId];
        var ids = Object.keys(pointers);

        if (ids.length === 2 && pinchStart) {
          pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
          var a = pointers[ids[0]], b = pointers[ids[1]];
          var d = Math.hypot(a.x - b.x, a.y - b.y);
          var r = stage.getBoundingClientRect();
          var mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
          zoomAt(mx, my, pinchStart.scale * (d / Math.max(1, pinchStart.d)));
        } else if (ids.length === 1 && scale > 1) {
          tx += ev.clientX - p.x;
          ty += ev.clientY - p.y;
          pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
          apply();
        } else {
          pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
        }
      }
      updateLoupe(ev);
    });

    function release(ev) {
      delete pointers[ev.pointerId];
      if (Object.keys(pointers).length < 2) pinchStart = null;
      if (!Object.keys(pointers).length) stage.classList.remove('dragging');
    }
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
    stage.addEventListener('pointerleave', function () { loupeOn(false); });

    /* 双击 / 双击触摸：1× ↔ 2.5× */
    stage.addEventListener('pointerup', function (ev) {
      if (ev.pointerType === 'mouse') return;
      var now = Date.now();
      if (now - lastTap < 320) {
        var r = stage.getBoundingClientRect();
        zoomAt(ev.clientX - r.left, ev.clientY - r.top, scale > 1.05 ? 1 : 2.5);
        lastTap = 0;
      } else lastTap = now;
    });

    stage.addEventListener('dblclick', function (ev) {
      var r = stage.getBoundingClientRect();
      zoomAt(ev.clientX - r.left, ev.clientY - r.top, scale > 1.05 ? 1 : 2.5);
    });

    stage.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var r = stage.getBoundingClientRect();
      zoomAt(ev.clientX - r.left, ev.clientY - r.top, scale * (ev.deltaY < 0 ? 1.18 : 1 / 1.18));
    }, { passive: false });
  }

  /* 桌面端跟随光标的圆形放大镜。只在 1×（未手动放大）时出现，
   * 否则会和"已经放大了"这件事重复。 */
  function updateLoupe(ev) {
    if (ev.pointerType !== 'mouse' || scale > 1.02 || !imgEl.src) { loupeOn(false); return; }
    var r = stage.getBoundingClientRect();
    var x = ev.clientX - r.left, y = ev.clientY - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) { loupeOn(false); return; }
    var R = 95, Z = 2.4;
    var px = (x - tx) / scale, py = (y - ty) / scale;   /* stage 坐标 → 底图坐标 */
    var k = baseW / (imgEl.naturalWidth || baseW);
    loupe.style.backgroundImage = 'url("' + imgEl.src + '")';
    loupe.style.backgroundSize = (baseW * Z) + 'px ' + (baseH * Z) + 'px';
    loupe.style.backgroundPosition = (-(px * k * Z) + R) + 'px ' + (-(py * k * Z) + R) + 'px';
    loupe.style.left = (x - R) + 'px';
    loupe.style.top = (y - R) + 'px';
    loupeOn(true);
  }

  var api = {
    open: function (opts) {
      build();
      api._onPick = opts.onPick || null;
      onClose = opts.onClose || null;
      opener = g.document.activeElement;
      imgEl.alt = opts.alt || '';
      imgEl.src = opts.src;
      dom.show(overlay, true);
      fit();
      /* 图片尺寸已知后重新 fit 一次——否则第一帧用的是 1200×800 的兜底值。 */
      if (!imgEl.complete) imgEl.addEventListener('load', fit, { once: true });
      var btn = overlay.querySelector('[data-zoom-close]');
      if (btn) btn.focus();
    },
    close: function () {
      if (!built || overlay.hasAttribute('hidden')) return;
      dom.show(overlay, false);
      dom.releaseMedia(stage);
      /* 焦点还给打开它的那个按钮——键盘用户不能掉在文档开头。 */
      if (opener && opener.focus) opener.focus();
      opener = null;
      var cb = onClose; onClose = null;
      if (cb) cb();
    },
    isOpen: function () { return built && !overlay.hasAttribute('hidden'); },
    /* 语言切换后重刷浮层里那两个按钮 */
    relabel: function () {
      if (!built) return;
      var c = overlay.querySelector('[data-zoom-close]');
      var p = overlay.querySelector('[data-zoom-pick]');
      if (c) c.textContent = t('round.close');
      if (p) p.textContent = t('round.pick');
      overlay.setAttribute('aria-label', t('round.zoom'));
    },
    _onPick: null
  };

  /* Esc 关闭。挂在 document 上，因为焦点可能在浮层内任何地方。 */
  g.document && g.document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && api.isOpen()) { ev.preventDefault(); api.close(); }
    /* 焦点陷阱：把 Tab 关在浮层里。 */
    if (ev.key === 'Tab' && api.isOpen()) {
      var f = dom.$$('button, [tabindex]:not([tabindex="-1"])', overlay);
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && g.document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && g.document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });

  g.addEventListener && g.addEventListener('resize', function () { if (api.isOpen()) fit(); });

  AON.zoom = api;
})(typeof window !== 'undefined' ? window : globalThis);
