# -*- coding: utf-8 -*-
"""
博客图片批量压缩工具
====================

把一批原图压成适合网页的尺寸，输出到博客的资源目录。
**只读原图，绝不覆盖原图**，所以不会出现反复压缩导致的画质衰减。

基本用法
--------
    npm run compress

    等价于：
    python tools/compress-images.py --in 原图 --out source/images

推荐流程
--------
    1. 相机导出的一堆大图 → 放进仓库根目录的  原图/  文件夹
    2. npm run compress
    3. 压缩结果写进 source/images/（文件名、子目录结构保持不变）
    4. 在 .md 里用 ![说明](/images/文件名.jpg) 引用
    5. npx hexo clean && npx hexo generate --deploy

参数
----
    --in        原图目录（默认 原图）
    --out       输出目录（默认 source/images）
    --max-edge  长边像素上限（默认 2560）
    --quality   JPEG 质量 1-100（默认 88）
    --backup    压缩前把原图备份到这个目录
    --dry-run   只统计不改文件
    --report    报告文件路径（默认 _imgpress_report.json）

要点
----
    * 只处理 .jpg / .jpeg；其他格式原样复制并提示
    * 按 EXIF 方向自动旋转，保留 ICC 色彩配置
    * 如果压出来反而比原图大，就保留原图字节
    * --in 和 --out 指向同一目录时会直接拒绝，防止二次有损压缩
"""

from __future__ import print_function

import argparse
import json
import os
import shutil
import sys
import time

try:
    from PIL import Image, ImageOps
except ImportError:
    print("缺少 Pillow，请先安装：pip install Pillow")
    sys.exit(1)

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

JPEG_EXTS = (".jpg", ".jpeg")
DEFAULT_IN = "原图"
DEFAULT_OUT = os.path.join("source", "images")


def human(n):
    if n >= 1048576:
        return "%.1f MB" % (n / 1048576.0)
    return "%.0f KB" % (n / 1024.0)


def norm(p):
    return os.path.normcase(os.path.realpath(os.path.abspath(p)))


def usage_hint():
    print("")
    print("用法：python tools/compress-images.py --in <原图目录> [--out source/images]")
    print("")
    print("例如：把照片放进仓库根的  原图/  文件夹，然后运行")
    print("      npm run compress")
    print("")
    print("参数说明见文件开头的注释。")


def collect(root):
    files = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            files.append(os.path.join(dirpath, fn))
    files.sort()
    return files


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--in", dest="src", default=DEFAULT_IN)
    ap.add_argument("--out", dest="dst", default=DEFAULT_OUT)
    ap.add_argument("--max-edge", type=int, default=2560)
    ap.add_argument("--quality", type=int, default=88)
    ap.add_argument("--backup", default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--report", default="_imgpress_report.json")
    args = ap.parse_args()

    src, dst = args.src, args.dst

    if not os.path.isdir(src):
        print("找不到原图目录：%s" % src)
        usage_hint()
        return 1

    # 关键安全护栏：禁止原地压缩
    if norm(src) == norm(dst):
        print("拒绝执行：--in 和 --out 是同一个目录。")
        print("那会把已经压过的图再压一遍，画质会明显变差。")
        print("请把原图放在另一个目录（例如 原图/），再输出到 source/images/。")
        return 1

    if norm(dst).startswith(norm(src) + os.sep):
        print("警告：输出目录在输入目录里面，重复运行会把上次的输出也当成原图。")

    files = collect(src)
    if not files:
        print("原图目录里没有文件：%s" % src)
        return 1

    print("原图目录 : %s" % src)
    print("输出目录 : %s" % dst)
    print("长边上限 : %d px    JPEG 质量: %d" % (args.max_edge, args.quality))
    print("文件数量 : %d" % len(files))
    if args.dry_run:
        print("** DRY RUN：只统计，不写文件 **")
    print("")

    if args.backup and not args.dry_run:
        print("备份原图到：%s" % args.backup)
        for sp in files:
            rel = os.path.relpath(sp, src)
            bp = os.path.join(args.backup, rel)
            bd = os.path.dirname(bp)
            if bd and not os.path.isdir(bd):
                os.makedirs(bd)
            shutil.copy2(sp, bp)
        print("备份完成\n")

    rows = []
    errors = []
    total_before = total_after = 0
    t0 = time.time()

    for sp in files:
        rel = os.path.relpath(sp, src)
        dp = os.path.join(dst, rel)
        before = os.path.getsize(sp)
        ext = os.path.splitext(sp)[1].lower()
        status = "ok"
        w0 = h0 = w1 = h1 = None

        if ext not in JPEG_EXTS:
            if not args.dry_run:
                d = os.path.dirname(dp)
                if d and not os.path.isdir(d):
                    os.makedirs(d)
                shutil.copy2(sp, dp)
            after = before
            status = "copied-nonjpeg"
            total_before += before
            total_after += after
            rows.append({"rel": rel, "status": status, "before": before, "after": after})
            continue

        try:
            im = Image.open(sp)
            icc = im.info.get("icc_profile")
            w0, h0 = im.size
            im = ImageOps.exif_transpose(im)

            w, h = im.size
            scale = min(1.0, float(args.max_edge) / max(w, h))
            if scale < 1.0:
                im = im.resize((int(round(w * scale)), int(round(h * scale))), Image.LANCZOS)
            w1, h1 = im.size

            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")

            if args.dry_run:
                # 干跑时只压到内存里量体积，不落盘
                import io
                buf = io.BytesIO()
                kw = dict(format="JPEG", quality=args.quality, optimize=True,
                          progressive=True, subsampling="4:2:0")
                if icc:
                    kw["icc_profile"] = icc
                im.save(buf, **kw)
                after = buf.tell()
            else:
                d = os.path.dirname(dp)
                if d and not os.path.isdir(d):
                    os.makedirs(d)
                kw = dict(format="JPEG", quality=args.quality, optimize=True,
                          progressive=True, subsampling="4:2:0")
                if icc:
                    kw["icc_profile"] = icc
                im.save(dp, **kw)
                after = os.path.getsize(dp)

            if after >= before:
                if not args.dry_run:
                    shutil.copy2(sp, dp)
                after = before
                status = "kept-original"

        except Exception as e:
            errors.append({"rel": rel, "error": repr(e)})
            if not args.dry_run:
                try:
                    d = os.path.dirname(dp)
                    if d and not os.path.isdir(d):
                        os.makedirs(d)
                    shutil.copy2(sp, dp)
                except Exception:
                    pass
            after = before
            status = "error"

        total_before += before
        total_after += after
        rows.append({
            "rel": rel, "status": status, "before": before, "after": after,
            "src": [w0, h0], "dst": [w1, h1],
            "pct": round(100.0 * after / before, 2) if before else 0,
        })

    dt = time.time() - t0

    print("=" * 74)
    print("%-42s %10s %10s %7s" % ("文件", "原图", "压缩后", "比例"))
    print("-" * 74)
    for r in rows:
        print("%-42s %10s %10s %6.1f%%" % (
            r["rel"][-42:], human(r["before"]), human(r["after"]), r.get("pct", 100)))
    print("-" * 74)
    print("%-42s %10s %10s %6.1f%%" % (
        "合计 %d 个" % len(rows), human(total_before), human(total_after),
        100.0 * total_after / total_before if total_before else 0))
    print("=" * 74)
    print("耗时 %.1f 秒" % dt)
    if errors:
        print("失败 %d 个：" % len(errors))
        for e in errors:
            print("   ", e)
    else:
        print("失败 0 个")

    if not args.dry_run:
        with open(args.report, "w", encoding="utf-8") as f:
            json.dump({
                "in": src, "out": dst, "max_edge": args.max_edge,
                "quality": args.quality, "total_before": total_before,
                "total_after": total_after, "count": len(rows),
                "errors": errors, "files": rows,
            }, f, ensure_ascii=False, indent=2)
        print("报告：%s" % args.report)

    print("")
    print("下一步：在 .md 里用 ![说明](/images/文件名.jpg) 引用，然后")
    print("        npx hexo clean && npx hexo generate --deploy")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
