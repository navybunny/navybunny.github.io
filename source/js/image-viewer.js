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

  var UA = navigator.userAgent || '';
  var IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(UA);
  var IS_WECHAT = /MicroMessenger/i.test(UA);
  // QQ 内置浏览器 / QQ 客户端：UA 里带 " QQ/" 或 MQQBrowser
  var IS_QQ = /\sQQ\/|MQQBrowser|QQBrowser/i.test(UA);
  var IS_ANDROID = /Android/i.test(UA);
  var IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/i.test(UA) && (navigator.maxTouchPoints || 0) > 1);
  // 移动端才有可用的系统分享面板
  var CAN_NATIVE_SHARE = IS_MOBILE && typeof navigator.share === 'function';

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
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="10.51" x2="15.42" y2="6.49"/><line x1="8.59" y1="13.49" x2="15.42" y2="17.51"/></svg>',
    wechat:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 13.2c1.9-1 3.1-2.7 3.1-4.6 0-3.2-3.1-5.7-6.9-5.7S5.8 5.4 5.8 8.6c0 1 .3 2 .9 2.8"/><path d="M4 14.2c0 2.5 2.5 4.6 5.6 4.6.7 0 1.4-.1 2-.3l2.3 1.3-.6-2c1.2-.9 1.9-2.2 1.9-3.6 0-2.5-2.5-4.6-5.6-4.6S4 11.7 4 14.2z"/></svg>',
    qq:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-3 0-5 2.2-5 5.2 0 .9-.4 1.7-1 2.6-.7 1-1 1.9-1 2.7 0 .7.4 1.1 1 1.1.5 0 .9-.3 1.2-.8"/><path d="M12 3c3 0 5 2.2 5 5.2 0 .9.4 1.7 1 2.6.7 1 1 1.9 1 2.7 0 .7-.4 1.1-1 1.1-.5 0-.9-.3-1.2-.8"/><path d="M7.4 15.4C8.5 18 10.1 20 12 20s3.5-2 4.6-4.6"/><path d="M9.5 8.6h.01M14.5 8.6h.01"/></svg>',
    link:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.4 4.5"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L12.6 19.5"/></svg>'
  };

  var mask, stage, imgEl, counterEl, toastEl, closeBtn, prevBtn, nextBtn, saveBtn, shareBtn, shareMenu;
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

    // 分享菜单：顺序固定为 QQ / 微信 / 链接
    shareMenu = mk('div', 'iv-share-menu');
    shareMenu.setAttribute('role', 'menu');

    var menuItems = [
      { act: 'qq', icon: ICON.qq, text: '分享到 QQ' },
      { act: 'wechat', icon: ICON.wechat, text: '分享到微信' },
      { act: 'copy', icon: ICON.link, text: '复制链接' }
    ];

    menuItems.forEach(function (item) {
      var b = mk('button', 'iv-menu-item', item.icon + '<span>' + item.text + '</span>');
      b.type = 'button';
      b.setAttribute('data-act', item.act);
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (item.act === 'qq') shareQQ();
        else if (item.act === 'wechat') shareWechat();
        else shareCopy();
      });
      shareMenu.appendChild(b);
    });

    toastEl = mk('div', 'iv-toast');

    stage.appendChild(imgEl);
    mask.appendChild(stage);
    mask.appendChild(counterEl);
    mask.appendChild(closeBtn);
    mask.appendChild(prevBtn);
    mask.appendChild(nextBtn);
    mask.appendChild(actions);
    mask.appendChild(shareMenu);
    mask.appendChild(toastEl);

    // 任何按钮点击都不要冒泡到遮罩
    [closeBtn, prevBtn, nextBtn, saveBtn, shareBtn].forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    });

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', function () {
      closeShareMenu();
      go(-1);
    });
    nextBtn.addEventListener('click', function () {
      closeShareMenu();
      go(1);
    });
    saveBtn.addEventListener('click', doSave);
    shareBtn.addEventListener('click', function () {
      toggleShareMenu();
    });

    // 点遮罩空白处关闭
    mask.addEventListener('click', function (e) {
      if (e.target === mask) close();
    });

    // 点舞台空白处关闭；点图片切换 1:1
    stage.addEventListener('click', function (e) {
      // 菜单开着时，点画面任何地方先收起菜单
      if (shareMenu && shareMenu.classList.contains('iv-show')) {
        closeShareMenu();
        return;
      }
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
    closeShareMenu();
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
    closeShareMenu();
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

  // 已知的图片扩展名白名单。不在名单里的一律按 .jpg 处理，
  // 避免出现 .php / .ashx / 无扩展名之类的怪名字。
  var KNOWN_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'];

  function filenameOf(url) {
    var clean = String(url).split('#')[0].split('?')[0];
    var base = clean.substring(clean.lastIndexOf('/') + 1);
    try {
      base = decodeURIComponent(base);
    } catch (e) {}
    // 去掉 Windows 文件名里不允许的字符
    base = base.replace(/[\\/:*?"<>|]/g, '_');
    if (!base) base = 'image';

    var dot = base.lastIndexOf('.');
    var stem = dot > 0 ? base.substring(0, dot) : base;
    var ext = dot > 0 ? base.substring(dot + 1).toLowerCase() : '';
    if (KNOWN_EXT.indexOf(ext) === -1) ext = 'jpg';
    if (!stem) stem = 'image';
    // 统一小写扩展名：.JPG / .Jpg / .JPEG 都归一成 .jpg，
    // 避免个别系统把大写扩展名认错、或另存时按 MIME 改成 .jfif
    return stem + '.' + ext;
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

  // 走 blob 下载：浏览器会严格采用我们给的文件名，
  // 不会退回去按 MIME 类型 image/jpeg 猜成 .jfif。
  function saveBlob(url, name) {
    fetch(url, { cache: 'force-cache', credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      })
      .then(function (blob) {
        var objUrl = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = objUrl;
        a.download = name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
          URL.revokeObjectURL(objUrl);
        }, 2000);
        toast('已开始下载：' + name);
      })
      .catch(function () {
        // 兜底：直接链接下载
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast('已开始下载：' + name);
      });
  }

  function doSave() {
    var url = imgEl.src;
    if (!url) return;
    var name = filenameOf(url);

    // 微信内置浏览器：WebView 不支持 blob 下载，只会提示"请在浏览器打开"。
    // 唯一可靠的办法是长按图片，走微信自己的「保存图片」进相册。
    if (IS_WECHAT) {
      toast('长按图片 → 保存图片');
      return;
    }

    // 移动端浏览器：部分 WebView 不支持 blob，直接用链接下载更稳
    if (IS_MOBILE) {
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('已开始下载；若想进相册，可长按图片保存');
      return;
    }

    // 桌面端：blob 下载，文件名最可靠（不受系统 MIME 影响）
    if (sameOrigin(url)) {
      saveBlob(url, name);
    } else {
      window.open(url, '_blank', 'noopener');
      toast('已在新标签页打开，右键「图片另存为」');
    }
  }

  /* ---------------- 分享 ---------------- */

  /* ---------------- 分享 ---------------- */

  function toggleShareMenu(force) {
    if (!shareMenu) return;
    var show = typeof force === 'boolean' ? force : !shareMenu.classList.contains('iv-show');
    shareMenu.classList.toggle('iv-show', show);
  }

  function closeShareMenu() {
    if (shareMenu) shareMenu.classList.remove('iv-show');
  }

  // 分享出去的统一是「文章页面」链接（像 B站 那样，带标题、排版和上下文），
  // 而不是图片直链 —— 直链别人点开只有一张没有上下文的裸图。
  function pageUrl() {
    return window.location.href;
  }

  // 系统分享面板（移动端普通浏览器可用）：能选微信 / QQ / 其他 App，
  // 选完 App 再由它自己弹出聊天选择，支持单选和多选。
  function nativeShare(url) {
    if (!CAN_NATIVE_SHARE) {
      copyLink(url, '链接已复制');
      return;
    }
    try {
      var p = navigator.share({ title: document.title || '', url: url });
      if (p && p.catch) {
        p.catch(function (err) {
          if (err && err.name === 'AbortError') return;
          copyLink(url, '链接已复制');
        });
      }
    } catch (e) {
      copyLink(url, '链接已复制');
    }
  }

  // 尝试用 URL scheme 拉起 App；1.4 秒内页面没离开前台就认为没拉起来，走兜底
  function openApp(scheme, fallback) {
    var left = false;
    var onHide = function () {
      if (document.hidden) left = true;
    };
    var onBlur = function () {
      left = true;
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', onBlur);

    try {
      window.location.href = scheme;
    } catch (e) {
      /* 忽略 */
    }

    setTimeout(function () {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onBlur);
      if (!left && !document.hidden) fallback();
    }, 1400);
  }

  // QQ
  function shareQQ() {
    closeShareMenu();
    var url = pageUrl();

    // 电脑端：只复制链接（QQ 的网页分享是扫码页，效果不好）
    if (!IS_MOBILE) {
      copyLink(url, '文章链接已复制，打开 QQ 粘贴发送');
      return;
    }

    // 手机 QQ 内置浏览器：用 QQ 自己的右上角菜单
    if (IS_QQ) {
      toast('点击右上角 ··· → 分享给好友');
      return;
    }

    // 手机普通浏览器：安卓上直接调起 QQ 的「发送给好友」界面。
    // iOS 上不用 scheme —— Safari 打不开未知协议会弹「无法打开网页」的报错框，
    // 直接走系统分享面板更干净。
    if (!IS_ANDROID) {
      if (CAN_NATIVE_SHARE) nativeShare(url);
      else copyLink(url, '链接已复制，打开 QQ 粘贴发送');
      return;
    }

    var scheme =
      'mqqapi://share/to_fri?src_type=web&version=1&file_type=news&share_type=0' +
      '&url=' + encodeURIComponent(url) +
      '&title=' + encodeURIComponent(document.title || '') +
      '&description=' + encodeURIComponent(document.title || '') +
      '&image_url=' + encodeURIComponent(imgEl.src || '');

    openApp(scheme, function () {
      nativeShare(url); // 没装 QQ 或拉不起来，退到系统面板
    });
  }

  // 微信
  function shareWechat() {
    closeShareMenu();
    var url = pageUrl();

    // 电脑端：只复制链接
    if (!IS_MOBILE) {
      copyLink(url, '文章链接已复制，打开微信粘贴发送');
      return;
    }

    // 微信内置浏览器：微信不开放任何网页分享接口，只能走右上角
    if (IS_WECHAT) {
      toast('点击右上角 ··· → 发送给朋友');
      return;
    }

    // 微信没有可调起的 scheme，只能交给系统面板
    if (CAN_NATIVE_SHARE) nativeShare(url);
    else copyLink(url, '链接已复制，打开微信粘贴发送');
  }

  // 复制链接
  function shareCopy() {
    closeShareMenu();
    copyLink(pageUrl(), '文章链接已复制');
  }

  // 同步复制：execCommand 立刻返回成功与否，反馈确定、不等 Promise。
  // （异步的 navigator.clipboard 在某些环境下既不 resolve 也不 reject，
  //   会让用户点了按钮毫无反应，所以只作为兜底。）
  function execCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    if (ta.setSelectionRange) {
      try {
        ta.setSelectionRange(0, text.length);
      } catch (e) {}
    }
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  function copyLink(url, okMsg) {
    var msg = okMsg || '图片链接已复制';

    // 1. 同步复制，成功立即可见
    if (execCopy(url)) {
      toast(msg);
      return;
    }

    // 2. 兜底：异步 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) {
          settled = true;
          toast('复制失败，请手动复制链接');
        }
      }, 1200);

      navigator.clipboard.writeText(url).then(
        function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          toast(msg);
        },
        function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          toast('复制失败，请手动复制链接');
        }
      );
    } else {
      toast('复制失败，请手动复制链接');
    }
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
