/* ============================================
   图片放大查看器 — image-viewer.js
   - 点击正文图片全屏放大
   - 左右切换（按钮 / 方向键 / 触屏滑动）
   - 点图片在「适应屏幕」和「1:1 原始像素」之间切换
   - 右下角：保存 / 分享
   无任何依赖，defer 加载
   ============================================ */

(function () {
  'use strict';

  if (window.__imageViewerLoaded) return;
  window.__imageViewerLoaded = true;

  var CONTENT_SEL = '.post-content';
  var MIN_WIDTH = 300; // 小图标不参与放大
  var TOAST_MS = 1900;

  var ICON = {
    close:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    prev:
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    next:
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    save:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    share:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="10.51" x2="15.42" y2="6.49"/><line x1="8.59" y1="13.49" x2="15.42" y2="17.51"/></svg>'
  };

  var mask, stage, imgEl, counterEl, toastEl, closeBtn, prevBtn, nextBtn, saveBtn, shareBtn;
  var list = [];
  var cur = 0;
  var isActual = false;
  var isOpen = false;
  var lastFocus = null;
  var toastTimer = null;

  /* ---------------- DOM ---------------- */

  function mk(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  function build() {
    mask = mk('div', 'iv-mask');
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', '图片查看');
    mask.setAttribute('aria-hidden', 'true');

    stage = mk('div', 'iv-stage');

    imgEl = document.createElement('img');
    imgEl.className = 'iv-img';
    imgEl.decoding = 'async';
    imgEl.draggable = false;
    imgEl.addEventListener('load', function () {
      imgEl.classList.add('iv-ready');
    });

    counterEl = mk('div', 'iv-counter');

    closeBtn = mk('button', 'iv-btn iv-close', ICON.close);
    closeBtn.type = 'button';
    closeBtn.title = '关闭 (Esc)';
    closeBtn.setAttribute('aria-label', '关闭');

    prevBtn = mk('button', 'iv-btn iv-nav iv-prev', ICON.prev);
    prevBtn.type = 'button';
    prevBtn.title = '上一张 (←)';
    prevBtn.setAttribute('aria-label', '上一张');

    nextBtn = mk('button', 'iv-btn iv-nav iv-next', ICON.next);
    nextBtn.type = 'button';
    nextBtn.title = '下一张 (→)';
    nextBtn.setAttribute('aria-label', '下一张');

    saveBtn = mk('button', 'iv-btn iv-save', ICON.save + '<span>保存</span>');
    saveBtn.type = 'button';
    saveBtn.title = '保存这张图片';

    shareBtn = mk('button', 'iv-btn iv-share', ICON.share + '<span>分享</span>');
    shareBtn.type = 'button';
    shareBtn.title = '分享这张图片';

    var actions = mk('div', 'iv-actions');
    actions.appendChild(saveBtn);
    actions.appendChild(shareBtn);

    toastEl = mk('div', 'iv-toast');

    stage.appendChild(imgEl);
    mask.appendChild(stage);
    mask.appendChild(counterEl);
    mask.appendChild(closeBtn);
    mask.appendChild(prevBtn);
    mask.appendChild(nextBtn);
    mask.appendChild(actions);
    mask.appendChild(toastEl);

    // 任何按钮点击都不要冒泡到遮罩
    [closeBtn, prevBtn, nextBtn, saveBtn, shareBtn].forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    });

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', function () {
      go(-1);
    });
    nextBtn.addEventListener('click', function () {
      go(1);
    });
    saveBtn.addEventListener('click', doSave);
    shareBtn.addEventListener('click', doShare);

    // 点遮罩空白处关闭
    mask.addEventListener('click', function (e) {
      if (e.target === mask) close();
    });

    // 点舞台空白处关闭；点图片切换 1:1
    stage.addEventListener('click', function (e) {
      if (e.target === stage) close();
      else if (e.target === imgEl) setActual(!isActual);
    });

    // 触屏滑动切换（1:1 模式下让位给拖动看图）
    var sx = 0, sy = 0;
    stage.addEventListener(
      'touchstart',
      function (e) {
        if (e.touches.length === 1) {
          sx = e.touches[0].clientX;
          sy = e.touches[0].clientY;
        }
      },
      { passive: true }
    );
    stage.addEventListener(
      'touchend',
      function (e) {
        if (isActual) return;
        if (e.changedTouches.length !== 1) return;
        var dx = e.changedTouches[0].clientX - sx;
        var dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      },
      { passive: true }
    );

    document.body.appendChild(mask);
  }

  /* ---------------- 图片列表 ---------------- */

  function collect() {
    var nodes = document.querySelectorAll(CONTENT_SEL + ' img');
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.closest && n.closest('.iv-mask')) continue;
      var w = n.naturalWidth || 0;
      if (w && w < MIN_WIDTH) continue; // 已知尺寸且太小则跳过
      out.push(n);
    }
    return out;
  }

  function srcOf(img) {
    return img.currentSrc || img.src || img.getAttribute('data-src') || '';
  }

  /* ---------------- 打开 / 关闭 ---------------- */

  function openAt(nodes, index) {
    if (!mask) build();
    list = nodes;
    cur = index;
    lastFocus = document.activeElement;

    document.body.classList.add('iv-open');
    mask.classList.add('iv-show');
    mask.setAttribute('aria-hidden', 'false');
    isOpen = true;

    render();
    closeBtn.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    mask.classList.remove('iv-show');
    mask.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('iv-open');
    imgEl.classList.remove('iv-ready');
    imgEl.removeAttribute('src');
    setActual(false);
    hideToast();
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
  }

  function render() {
    var cur_img = list[cur];
    if (!cur_img) return;
    imgEl.classList.remove('iv-ready');
    imgEl.src = srcOf(cur_img);
    imgEl.alt = cur_img.alt || '';
    counterEl.textContent = cur + 1 + ' / ' + list.length;
    var many = list.length > 1;
    counterEl.style.display = many ? '' : 'none';
    prevBtn.style.display = many ? '' : 'none';
    nextBtn.style.display = many ? '' : 'none';
    setActual(false);
  }

  function go(delta) {
    if (list.length < 2) return;
    cur = (cur + delta + list.length) % list.length;
    render();
  }

  function setActual(on) {
    isActual = !!on;
    stage.classList.toggle('iv-actual', isActual);
  }

  /* ---------------- 保存 ---------------- */

  function filenameOf(url) {
    var clean = String(url).split('#')[0].split('?')[0];
    var base = clean.substring(clean.lastIndexOf('/') + 1);
    try {
      base = decodeURIComponent(base);
    } catch (e) {}
    if (!base) base = 'image';
    if (!/\.[a-z0-9]{2,5}$/i.test(base)) base += '.jpg';
    return base;
  }

  function sameOrigin(url) {
    try {
      var a = document.createElement('a');
      a.href = url;
      return a.origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }

  function doSave() {
    var url = imgEl.src;
    if (!url) return;
    var name = filenameOf(url);

    if (sameOrigin(url)) {
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('已开始下载：' + name);
    } else {
      // 跨域（比如以后换了图床）download 属性会被忽略，退回新窗口打开
      window.open(url, '_blank', 'noopener');
      toast('已在新标签页打开，右键「图片另存为」');
    }
  }

  /* ---------------- 分享 ---------------- */

  // 只有真正的移动端才走系统分享面板。
  // 桌面端（尤其是 Windows）navigator.share 可能弹不出面板、Promise 也不 resolve，
  // 会让按钮看起来“点了没反应”，所以桌面一律直接复制链接，反馈确定。
  function useNativeShare() {
    if (!navigator.share) return false;
    var ua = navigator.userAgent || '';
    var mobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua);
    var touch = (navigator.maxTouchPoints || 0) > 1;
    return mobile || touch;
  }

  function doShare() {
    var url = imgEl.src;
    if (!url) return;

    if (useNativeShare()) {
      navigator
        .share({ title: document.title || '图片', url: url })
        .catch(function (err) {
          // 用户主动取消就不打扰；其他失败退回复制链接
          if (err && err.name === 'AbortError') return;
          copyLink(url);
        });
    } else {
      copyLink(url);
    }
  }

  function copyLink(url) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(
        function () {
          toast('图片链接已复制');
        },
        function () {
          legacyCopy(url);
        }
      );
    } else {
      legacyCopy(url);
    }
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    ta.remove();
    toast(ok ? '图片链接已复制' : '复制失败，请手动保存图片');
  }

  /* ---------------- 轻提示 ---------------- */

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('iv-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, TOAST_MS);
  }

  function hideToast() {
    if (!toastEl) return;
    toastEl.classList.remove('iv-show');
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
  }

  /* ---------------- 事件绑定 ---------------- */

  // 点击正文图片 → 打开（capture 抢先，避免被主题其他处理拦截）
  document.addEventListener(
    'click',
    function (e) {
      var t = e.target;
      if (!t || t.tagName !== 'IMG') return;
      if (t.closest && (t.closest('.iv-mask') || !t.closest(CONTENT_SEL))) return;

      var nodes = collect();
      var i = nodes.indexOf(t);
      if (i < 0) return;

      e.preventDefault();
      openAt(nodes, i);
    },
    true
  );

  // 键盘（Esc 始终可用；没打开时方向键不动页面）
  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    }
  });
})();
