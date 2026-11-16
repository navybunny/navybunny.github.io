# NavyBunny 的博客 · 源码

这是博客的 **`source` 分支** —— 存放所有源文件。

**🌐 线上站点：<https://navybunny.github.io>**
**📦 发布产物在 [`main`](https://github.com/navybunny/navybunny.github.io/tree/main) 分支**

## 目录说明

```
_config.yml         Hexo 主配置（站点信息、图片目录、部署目标）
package.json        依赖与脚本（build / clean / compress / deploy）
scripts/            Hexo 构建期脚本
  └ image-viewer.js   给正文图片补 width/height、改 alt、注入放大查看器
source/
  ├ _posts/         文章（Markdown）
  ├ about/          关于页
  ├ css/ js/        站点级的查看器样式与脚本
  └ images/         图片资源（已压缩）
themes/miku-theme-main/   自建主题
tools/
  └ compress-images.py    批量图片压缩脚本
原图/               原图暂存区（不进 git）
```

## 本地开发

```bash
npm install
npm run server      # 本地预览 http://localhost:4000
```

## 发布

```bash
# 1. 源码备份
git add -A && git commit -m "..." && git push origin source

# 2. 生成并发布到 main（网站更新）
npm run deploy      # 等价于 hexo clean && hexo generate --deploy
```

看板式编辑器可选用自己写的 [hexo-post-studio](https://github.com/navybunny/hexo-post-studio)。

## 图片处理

图片进仓库前请先压缩：

```bash
# 把原图放进 原图/ 目录，然后
npm run compress
```

流程是 `原图/ → 压缩 → source/images/`，默认长边 2560px / JPEG q88。脚本会拒绝原地压缩（防止二次有损）。

## 许可

文章内容与图片版权归作者所有。代码部分（主题、脚本）参考自社区，仅供学习参考。
