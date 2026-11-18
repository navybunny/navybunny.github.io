'use strict';

/**
 * 文章图片增强（不改主题文件，只靠 Hexo 的 filter / injector）
 *
 *  1. 扫描本地图片，读出真实尺寸
 *  2. 给正文 img 补上 width/height —— 图片加载完不会把页面顶来顶去（防 CLS）
 *  3. 首图改 loading="eager" + fetchpriority="high" —— 优化 LCP
 *  4. 其余图片 loading="lazy" / decoding="async" —— 滚到哪加载哪
 *  5. 把「照片」这类没信息量的 alt 换成「文章标题 - 照片 N」—— 利于搜索与读屏
 *  6. 注入放大查看器的 CSS / JS
 *
 * 放在博客根目录的 scripts/ 下，Hexo 启动时自动加载。
 */

const fs = require('fs');
const path = require('path');

// ---------- 1. 读取本地图片尺寸 ----------

/**
 * 只解析 JPEG 的文件头拿宽高，不依赖任何图像库。
 * 找 SOF0~SOF15（排除 DHT/JPG/DAC），高度在偏移 +5、宽度在 +7。
 */
function readJpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    // 无长度字段的标记
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      if (i + 9 > buf.length) return null;
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

// key 形如 "/images/film/r001-001.jpg"
const DIMS = Object.create(null);

function scanImages(dir, prefix) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const url = prefix + '/' + ent.name;
    if (ent.isDirectory()) {
      scanImages(full, url);
    } else if (/\.jpe?g$/i.test(ent.name)) {
      try {
        const size = readJpegSize(fs.readFileSync(full));
        if (size) DIMS[url] = size;
      } catch (e) {
        /* 读不了就跳过 */
      }
    }
  }
}

try {
  const base = hexo.base_dir;
  const srcDir = hexo.config.source_dir || 'source';
  scanImages(path.join(base, srcDir, 'images'), '/images');
  hexo.log.debug('image-enhance: 读取到 %d 张图片尺寸', Object.keys(DIMS).length);
} catch (e) {
  hexo.log.warn('image-enhance: 扫描图片尺寸失败 %s', e.message);
}

// ---------- 2. 处理正文里的 img ----------

// 这些 alt 等于没写，换成带标题的描述
const WEAK_ALT = ['', '照片', '图片', '胶片摄影', '数码摄影', '相片', 'image', 'photo'];

function attrOf(attrs, name) {
  const m = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(attrs);
  return m ? m[1] : null;
}

function enhance(html, title) {
  if (!html || typeof html !== 'string') return html;

  // --- ::: photo-grid 容器语法 ---
  // HTML 块内部不会解析 Markdown，所以直接在 <div class="photo-grid"> 里写
  // ![](/images/a.jpg) 会变成一串纯文字。这里支持更顺手的写法：
  //
  //   ::: photo-grid
  //   ![](/images/a.jpg)
  //   ![](/images/b.jpg)
  //   :::
  //
  // 加 natural 则不裁切：  ::: photo-grid natural
  // 原理：此时 marked 已经把 ![]() 渲染成真正的 <img>，只需把整段包进带类的 div。
  // marked 可能把整段塞进一个 <p>（用 <br> 连行），也可能因为空行拆成多个 <p>，两种都处理。
  const wrapGrid = (natural, inner) => {
    const imgs = inner.match(/<img\b[^>]*>/gi) || [];
    if (!imgs.length) return null;
    const cls = 'photo-grid' + (natural ? ' natural' : '');
    return '<div class="' + cls + '">\n' + imgs.join('\n') + '\n</div>';
  };

  // 情况一：空行把它拆成了多个段落
  html = html.replace(
    /<p>\s*:::\s*photo-grid\s*(natural)?\s*<\/p>([\s\S]*?)<p>\s*:::\s*<\/p>/gi,
    (whole, natural, inner) => wrapGrid(natural, inner) || whole
  );

  // 情况二：整段被包在同一个 <p> 里，行与行之间是 <br>
  html = html.replace(
    /<p>\s*:::\s*photo-grid\s*(natural)?(?:\s|<br\s*\/?>)+([\s\S]*?):::\s*<\/p>/gi,
    (whole, natural, inner) => wrapGrid(natural, inner) || whole
  );

  let index = 0;
  return html.replace(/<img\b([^>]*)>/gi, (whole, attrs) => {
    let a = attrs;
    index += 1;

    // --- width / height，防止布局抖动 ---
    // 注意：marked/Hexo 会把地址里的中文百分号编码，而 DIMS 的键是原始文件名，
    // 所以要先解码再查，否则中文文件名的图会全部查不到尺寸。
    const src = attrOf(a, 'src') || '';
    let dim = DIMS[src];
    if (!dim && src.indexOf('%') !== -1) {
      try {
        dim = DIMS[decodeURIComponent(src)];
      } catch (e) {
        /* 不是合法的编码，忽略 */
      }
    }
    if (dim && attrOf(a, 'width') === null && attrOf(a, 'height') === null) {
      a += ` width="${dim.w}" height="${dim.h}"`;
    }

    // --- alt：把没信息量的换成「标题 - 照片 N」---
    if (title) {
      const cur = (attrOf(a, 'alt') || '').trim();
      if (WEAK_ALT.indexOf(cur) !== -1) {
        const next = String(title).replace(/"/g, '').trim() + ' - 照片 ' + index;
        a =
          attrOf(a, 'alt') !== null
            ? a.replace(/\balt\s*=\s*"[^"]*"/i, 'alt="' + next + '"')
            : a + ' alt="' + next + '"';
      }
    }

    // --- 加载策略：首图立刻加载，其余懒加载 ---
    if (index === 1) {
      a = a.replace(/\s*\bloading\s*=\s*"[^"]*"/i, '');
      a = a.replace(/\s*\bfetchpriority\s*=\s*"[^"]*"/i, '');
      a += ' loading="eager" fetchpriority="high" decoding="async"';
    } else {
      if (!/\bloading\s*=/i.test(a)) a += ' loading="lazy"';
      if (!/\bdecoding\s*=/i.test(a)) a += ' decoding="async"';
    }

    return `<img${a}>`;
  });
}

hexo.extend.filter.register('after_post_render', (data) => {
  const title = data.title || '';
  data.content = enhance(data.content, title);
  if (data.excerpt) data.excerpt = enhance(data.excerpt, title);
  if (data.more) data.more = enhance(data.more, title);
  return data;
});

// ---------- 3. 注入放大查看器资源 ----------

hexo.extend.injector.register(
  'head_end',
  '<link rel="stylesheet" href="/css/image-viewer.css">'
);

hexo.extend.injector.register(
  'body_end',
  '<script src="/js/image-viewer.js" defer></script>'
);
