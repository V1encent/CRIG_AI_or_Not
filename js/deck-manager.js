/* deck-manager.js — 内置轻量化展台应急配题与题库管理面板（建议4）
 *
 * 功能：
 * 1. 浏览全部从 PPTX（slides 2–8）提取的 7 道真实生物医学显微/实验题，随时可点击一键即时测试任意一道题；
 * 2. 现场免代码应急配题：支持拖拽/选择真实照片与 AI 生成照片，现场录入破绽提示并即刻开局；
 * 3. 题库 JSON 导出与导入，方便布展团队在不同终端间即时分发题库配置。
 */
(function (g) {
  'use strict';

  var AON = (g.AON = g.AON || {});
  var dom = AON.dom;

  var modal = null;
  var appRef = null;
  var activeTab = 'deck'; // 'deck' | 'add' | 'json'

  function t(key) {
    return AON.i18n.t(key, (appRef && appRef.lang) || 'nl');
  }

  function createModal() {
    if (modal) return modal;

    modal = dom.el('div', {
      id: 'deck-manager-modal',
      'class': 'deck-modal-backdrop',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Deck Manager',
      hidden: ''
    });

    modal.innerHTML = [
      '<div class="deck-modal-sheet">',
      '  <div class="deck-modal-header">',
      '    <div>',
      '      <h2 class="deck-modal-title" id="deck-modal-title">' + t('deck.title') + '</h2>',
      '      <p class="deck-modal-sub" id="deck-modal-sub">' + t('deck.sub') + '</p>',
      '    </div>',
      '    <button type="button" class="btn btn-ghost deck-close-btn" data-deck-close="1" aria-label="' + t('deck.close') + '">✕</button>',
      '  </div>',
      '  <div class="deck-tabs">',
      '    <button type="button" class="deck-tab-btn active" data-tab="deck">' + t('deck.tabDeck') + '</button>',
      '    <button type="button" class="deck-tab-btn" data-tab="add">' + t('deck.tabAdd') + '</button>',
      '    <button type="button" class="deck-tab-btn" data-tab="json">' + t('deck.tabJson') + '</button>',
      '  </div>',
      '  <div class="deck-modal-body">',
      '    <div id="deck-tab-content-deck" class="deck-tab-content">',
      '      <div id="deck-puzzles-list" class="deck-puzzles-list"></div>',
      '    </div>',
      '    <div id="deck-tab-content-add" class="deck-tab-content" style="display:none;">',
      '      <form id="deck-add-form" class="deck-add-form">',
      '        <div class="deck-form-grid">',
      '          <div class="deck-dropzone">',
      '            <label class="deck-dropzone-label">',
      '              <span>📷 ' + t('deck.real') + '</span>',
      '              <input type="file" id="deck-input-real" accept="image/*" required />',
      '              <img id="deck-preview-real" class="deck-preview-thumb" style="display:none;" />',
      '            </label>',
      '          </div>',
      '          <div class="deck-dropzone">',
      '            <label class="deck-dropzone-label">',
      '              <span>🤖 ' + t('deck.ai') + '</span>',
      '              <input type="file" id="deck-input-ai" accept="image/*" required />',
      '              <img id="deck-preview-ai" class="deck-preview-thumb" style="display:none;" />',
      '            </label>',
      '          </div>',
      '        </div>',
      '        <div class="deck-form-row">',
      '          <label>题目标题 / Subject Title:',
      '            <input type="text" id="deck-input-title" class="deck-input" placeholder="e.g. Zebrafish Fin Alignment" required />',
      '          </label>',
      '        </div>',
      '        <div class="deck-form-row">',
      '          <label>破绽教学提示 / Tell Clue (Explanation):',
      '            <textarea id="deck-input-clue" class="deck-input deck-textarea" rows="2" placeholder="Explain the flaw in the AI image..." required></textarea>',
      '          </label>',
      '        </div>',
      '        <div class="deck-form-row">',
      '          <label>难度档位 / Difficulty Tier:',
      '            <select id="deck-input-tier" class="deck-input">',
      '              <option value="easy">Easy (Makkelijk)</option>',
      '              <option value="medium" selected>Medium (Gemiddeld)</option>',
      '              <option value="hard">Hard (Moeilijk)</option>',
      '            </select>',
      '          </label>',
      '        </div>',
      '        <button type="submit" class="btn btn-primary btn-deck-submit">' + t('deck.addBtn') + '</button>',
      '      </form>',
      '    </div>',
      '    <div id="deck-tab-content-json" class="deck-tab-content" style="display:none;">',
      '      <div class="deck-json-actions">',
      '        <button type="button" class="btn" id="deck-btn-export">' + t('deck.exportBtn') + '</button>',
      '        <label class="btn btn-primary" style="cursor:pointer;">' + t('deck.importBtn'),
      '          <input type="file" id="deck-input-import" accept=".json" style="display:none;" />',
      '        </label>',
      '      </div>',
      '      <textarea id="deck-json-editor" class="deck-json-editor" readonly spellcheck="false"></textarea>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');

    g.document.body.appendChild(modal);
    bindModalEvents();
    return modal;
  }

  function bindModalEvents() {
    modal.addEventListener('click', function (ev) {
      if (ev.target === modal || ev.target.closest('[data-deck-close]')) {
        close();
      }
    });

    var tabBtns = modal.querySelectorAll('.deck-tab-btn');
    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        switchTab(btn.getAttribute('data-tab'));
      });
    });

    // 快速添加表单处理
    var form = modal.querySelector('#deck-add-form');
    var inputReal = modal.querySelector('#deck-input-real');
    var inputAi = modal.querySelector('#deck-input-ai');
    var prevReal = modal.querySelector('#deck-preview-real');
    var prevAi = modal.querySelector('#deck-preview-ai');

    inputReal.addEventListener('change', function () {
      if (inputReal.files && inputReal.files[0]) {
        prevReal.src = URL.createObjectURL(inputReal.files[0]);
        prevReal.style.display = 'block';
      }
    });

    inputAi.addEventListener('change', function () {
      if (inputAi.files && inputAi.files[0]) {
        prevAi.src = URL.createObjectURL(inputAi.files[0]);
        prevAi.style.display = 'block';
      }
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!inputReal.files[0] || !inputAi.files[0]) return;

      var realUrl = URL.createObjectURL(inputReal.files[0]);
      var aiUrl = URL.createObjectURL(inputAi.files[0]);
      var title = modal.querySelector('#deck-input-title').value.trim();
      var clue = modal.querySelector('#deck-input-clue').value.trim();
      var tier = modal.querySelector('#deck-input-tier').value;

      var newId = 'custom_' + Date.now();
      var newPuzzle = {
        id: newId,
        schemaVersion: 1,
        status: 'ready',
        scope: 'both',
        difficulty: {
          tells: tier === 'easy' ? 1 : (tier === 'hard' ? 5 : 3),
          subject: 3,
          postprocessing: 2
        },
        images: [
          {
            id: newId + '-1',
            src: realUrl,
            width: 1200,
            height: 800,
            isAI: false,
            provenance: {
              subject: { nl: title, en: title }
            }
          },
          {
            id: newId + '-2',
            src: aiUrl,
            width: 1200,
            height: 800,
            isAI: true,
            provenance: {
              generator: 'Custom Ingest'
            }
          }
        ],
        teaching: {
          cue: 'text',
          explanation: { nl: clue, en: clue },
          rule: {
            nl: 'Kijk altijd kritisch naar de details in beeld.',
            en: 'Always inspect image details critically.'
          }
        }
      };

      if (appRef && appRef.pool) {
        appRef.pool.unshift(newPuzzle);
        close();
        if (appRef.playSpecificPuzzle) {
          appRef.playSpecificPuzzle(newPuzzle);
        }
      }
    });

    // 导出 JSON
    modal.querySelector('#deck-btn-export').addEventListener('click', function () {
      var pool = (appRef && appRef.pool) || g.PUZZLES || [];
      var dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(pool, null, 2));
      var dl = document.createElement('a');
      dl.setAttribute('href', dataStr);
      dl.setAttribute('download', 'crig_deck_manifest.json');
      dl.click();
    });

    // 导入 JSON
    modal.querySelector('#deck-input-import').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var parsed = JSON.parse(e.target.result);
          if (Array.isArray(parsed) && parsed.length && appRef) {
            appRef.pool = parsed;
            renderPuzzlesList();
            renderJsonPreview();
            alert('题库导入成功！共 ' + parsed.length + ' 道题。');
          }
        } catch (err) {
          alert('JSON 解析失败：' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  function switchTab(tab) {
    activeTab = tab;
    var tabs = ['deck', 'add', 'json'];
    tabs.forEach(function (tName) {
      var el = modal.querySelector('#deck-tab-content-' + tName);
      if (el) el.style.display = tName === tab ? 'block' : 'none';
    });
    if (tab === 'deck') renderPuzzlesList();
    if (tab === 'json') renderJsonPreview();
  }

  function renderPuzzlesList() {
    var container = modal.querySelector('#deck-puzzles-list');
    if (!container) return;
    container.innerHTML = '';

    var puzzles = (appRef && appRef.pool) || g.PUZZLES || [];

    if (!puzzles.length) {
      container.innerHTML = '<p class="deck-empty-tip">题池当前为空。</p>';
      return;
    }

    puzzles.forEach(function (p, index) {
      var card = dom.el('div', { 'class': 'deck-item-card' });
      var realImg = p.images.find(function (im) { return !im.isAI; }) || p.images[0];
      var aiImg = p.images.find(function (im) { return im.isAI; }) || p.images[1];

      var slideLabel = p.level ? ('Level ' + p.level) : (p.slide ? ('Slide ' + p.slide) : ('#' + (index + 1)));
      var title = (p.images[0] && p.images[0].provenance && p.images[0].provenance.subject && (p.images[0].provenance.subject.nl || p.images[0].provenance.subject.en)) || p.pairKey || p.id;
      var clueText = (p.note && (p.note.nl || p.note.en)) || (p.teaching && p.teaching.explanation && (p.teaching.explanation.nl || p.teaching.explanation.en)) || '';

      card.innerHTML = [
        '<div class="deck-item-top">',
        '  <span class="deck-slide-badge">' + slideLabel + ' · ' + (p.pairKey ? (p.pairKey + ' · ') : '') + p.id + '</span>',
        '  <span class="deck-cue-tag">' + ((p.teaching && p.teaching.cue) || 'visual') + '</span>',
        '  <span class="spacer"></span>',
        '  <button type="button" class="btn btn-primary btn-play-puzzle" data-pid="' + p.id + '">' + t('deck.playThis') + ' ▶</button>',
        '</div>',
        '<div class="deck-thumbs-row">',
        '  <div class="deck-thumb-box">',
        '    <img src="' + (p.images[0].src || '') + '" alt="Slot 1" />',
        '    <span class="thumb-lbl">' + (p.images[0].isAI ? 'AI 🤖' : 'Real 📷') + '</span>',
        '  </div>',
        '  <div class="deck-thumb-box">',
        '    <img src="' + (p.images[1].src || '') + '" alt="Slot 2" />',
        '    <span class="thumb-lbl">' + (p.images[1].isAI ? 'AI 🤖' : 'Real 📷') + '</span>',
        '  </div>',
        '  <div class="deck-item-desc">',
        '    <p class="deck-item-title">' + title + '</p>',
        '    <p class="deck-item-clue">' + clueText + '</p>',
        '  </div>',
        '</div>'
      ].join('\n');

      var playBtn = card.querySelector('.btn-play-puzzle');
      playBtn.addEventListener('click', function () {
        close();
        if (appRef && appRef.playSpecificPuzzle) {
          appRef.playSpecificPuzzle(p);
        }
      });

      container.appendChild(card);
    });
  }

  function renderJsonPreview() {
    var editor = modal.querySelector('#deck-json-editor');
    if (!editor) return;
    var pool = (appRef && appRef.pool) || g.PUZZLES || [];
    editor.value = JSON.stringify(pool, null, 2);
  }

  function open() {
    createModal();
    renderPuzzlesList();
    dom.show(modal, true);
    switchTab('deck');
  }

  function close() {
    if (modal) dom.show(modal, false);
  }

  var api = {
    init: function (app) {
      appRef = app;
      createModal();

      // 全局热键 'D' 快速呼出
      g.document.addEventListener('keydown', function (ev) {
        if (ev.key === 'd' || ev.key === 'D') {
          // 仅当用户不在 input/textarea 里时
          var tag = (ev.target && ev.target.tagName) || '';
          if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
            ev.preventDefault();
            if (api.isOpen()) close();
            else open();
          }
        }
      });
    },
    open: open,
    close: close,
    isOpen: function () {
      return modal && !modal.hasAttribute('hidden');
    }
  };

  AON.deckManager = api;
})(typeof window !== 'undefined' ? window : globalThis);
