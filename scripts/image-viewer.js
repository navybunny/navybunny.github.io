'use strict';

/**
 * 文章图片增强（不改主题文件）
 *
 *  1. 给正文图片加 loading="lazy" / decoding="async"
 *     —— 打开页面只下首屏图，滚到哪加载哪
 *  2. 注入放大查看器的 CSS / JS
 *     —— 点击图片全屏放大，右下角有「保存」「分享」
 *
 * 放在博客根目录的 scripts/ 下，Hexo 启动时自动加载。
 */

// ---------- 1. 懒加载 ----------
const LAZY = /<img\b([^>]*)>/gi;

const addLazy = (html) => {
  if (!html || typeof html !== 'string') return html;
  return html.replace(LAZY, (whole, attrs) => {
    let a = attrs;
    if (!/\bloading\s*=/i.test(a)) a += ' loading="lazy"';
    if (!/\bdecoding\s*=/i.test(a)) a += ' decoding="async"';
    return `<img${a}>`;
  });
};

hexo.extend.filter.register('after_post_render', (data) => {
  data.content = addLazy(data.content);
  if (data.excerpt) data.excerpt = addLazy(data.excerpt);
  if (data.more) data.more = addLazy(data.more);
  return data;
});

// ---------- 2. 注入放大查看器资源 ----------
hexo.extend.injector.register(
  'head_end',
  '<link rel="stylesheet" href="/css/image-viewer.css">'
);

hexo.extend.injector.register(
  'body_end',
  '<script src="/js/image-viewer.js" defer></script>'
);
