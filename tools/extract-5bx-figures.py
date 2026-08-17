#!/usr/bin/env python3
"""
Extract the exercise illustrations from a scan of the original 5BX booklet
into 5bx/figures/c{chart}e{exercise}.png.

The booklet prints each chart as a two-page spread: the rating-scale table and
exercise text on the left, a bordered panel of five illustration strips on the
right. This script finds that panel, splits it into the five strips, drops the
"EXERCISE n" captions, and writes white-silhouette PNGs with transparent
backgrounds so they sit on the app's dark theme.

Reclining poses print as very wide, short strips — legible on paper, about
15 px tall on a phone. Those get split on their whitespace gutters and the
individual poses stacked vertically so each one renders at full card width.

Usage:  python3 tools/extract-5bx-figures.py path/to/5bx-plan.pdf
Needs:  pip install pymupdf pillow numpy

The scan is not in the repo (it is a scanned copy of a Crown-copyright
booklet, Information Canada 1965). Supply your own to regenerate.
"""

import sys, os, pathlib
import numpy as np
from PIL import Image

try:
    import pymupdf
except ImportError:
    sys.exit("pip install pymupdf pillow numpy")

# Chart N is on this 0-based PDF page of the 18-page scan.
CHART_PAGES = {1: 11, 2: 12, 3: 13, 4: 14, 5: 15, 6: 16}

INK = 170          # grayscale value below which a pixel counts as ink
DPI = 300
OUT_WIDTH = 640    # 2x a ~320 px card on a phone


def content_crop(g, pad=10):
    a = np.array(g)
    m = a < INK
    if not m.any():
        return None
    ys, xs = np.where(m)
    return g.crop((max(0, xs.min() - pad), max(0, ys.min() - pad),
                   min(g.width, xs.max() + pad), min(g.height, ys.max() + pad)))


def row_segments(mask, join=6, min_ink=3):
    """Contiguous bands of rows that contain ink."""
    rowink = mask.sum(axis=1)
    segs = []
    for i, v in enumerate(rowink):
        if v > min_ink:
            if segs and i - segs[-1][1] <= join:
                segs[-1][1] = i
            else:
                segs.append([i, i])
    return segs, rowink


def drop_caption(g):
    """Remove a leading/trailing 'EXERCISE n' caption band.

    A caption is short, sits alone after a whitespace gap, and carries far
    less ink than the illustration it labels.
    """
    a = np.array(g)
    m = a < INK
    segs, rowink = row_segments(m, join=3)
    if len(segs) < 2:
        return g
    ink = [rowink[s:e + 1].sum() for s, e in segs]
    biggest = max(ink)
    # A caption band usually carries the panel's horizontal rule, which is a
    # single near-full-width row. Treat that as caption evidence too, since the
    # rule's ink alone can exceed the "much less ink" test.
    widest = m.sum(axis=1).max()

    def is_caption(i):
        s, e = segs[i]
        if (e - s) >= g.height * 0.16:
            return False
        has_rule = m[s:e + 1].sum(axis=1).max() > 0.80 * widest
        return ink[i] < biggest * 0.30 or has_rule

    keep = list(range(len(segs)))
    while len(keep) > 1 and is_caption(keep[-1]):
        keep.pop()
    while len(keep) > 1 and is_caption(keep[0]):
        keep.pop(0)
    if len(keep) == len(segs):
        return g
    top = segs[keep[0]][0]
    bot = segs[keep[-1]][1]
    return g.crop((0, max(0, top - 4), g.width, min(g.height, bot + 4)))


def split_poses(g, min_gap, tol=1):
    """Split a wide strip on its whitespace gutters into separate poses."""
    m = np.array(g) < INK
    col = m.sum(axis=0)
    runs = []
    for i, v in enumerate(col <= tol):
        if v:
            if runs and i - runs[-1][1] <= 1:
                runs[-1][1] = i
            else:
                runs.append([i, i])
    cuts = [(s + e) // 2 for s, e in runs
            if e - s >= min_gap and s > 0 and e < g.width - 1]
    bounds = [0] + cuts + [g.width]
    parts = []
    for k in range(len(bounds) - 1):
        p = content_crop(g.crop((bounds[k], 0, bounds[k + 1], g.height)), 6)
        if p is not None and p.width > g.width * 0.04:
            parts.append(p)
    return parts


def split_adaptive(g):
    """Poses in some strips nearly touch, so relax the gutter until it splits."""
    for min_gap in (max(12, g.width // 60), g.width // 100, 10, 6, 4):
        if min_gap < 3:
            continue
        for tol in (1, 2, 3, 4):
            parts = split_poses(g, min_gap, tol)
            if len(parts) > 1:
                return parts
    return [g]


def stack(parts, width=760, gap=26):
    scaled = [p.resize((width, max(1, round(p.height * width / p.width))), Image.LANCZOS)
              for p in parts]
    total = sum(p.height for p in scaled) + gap * (len(scaled) - 1)
    out = Image.new('L', (width, total), 255)
    y = 0
    for p in scaled:
        out.paste(p, (0, y))
        y += p.height + gap
    return out


def strip_caption_band(im):
    """Final guard: drop a leftover caption band from the finished silhouette.

    Runs on the alpha channel, after splitting and stacking, so it catches
    captions that survived because they merged with the illustration earlier.
    """
    alpha = np.array(im)[..., 3]
    rows = (alpha > 40).sum(axis=1)
    H = im.height
    segs = []
    for i, v in enumerate(rows):
        if v > 2:
            if segs and i - segs[-1][1] <= 4:
                segs[-1][1] = i
            else:
                segs.append([i, i])
    if len(segs) < 2:
        return im
    ink = [rows[s:e + 1].sum() for s, e in segs]
    biggest = max(ink)

    def small(i):
        return (segs[i][1] - segs[i][0]) < H * 0.22 and ink[i] < biggest * 0.25

    changed = False
    while len(segs) > 1 and small(0):
        segs.pop(0); ink.pop(0); changed = True
    while len(segs) > 1 and small(-1):
        segs.pop(); ink.pop(); changed = True
    if not changed:
        return im
    top, bot = max(0, segs[0][0] - 6), min(H, segs[-1][1] + 6)
    return im.crop((0, top, im.width, bot)) if bot - top > H * 0.55 else im


def to_silhouette(g):
    """White figure, transparent ground, alpha posterized for small PNGs."""
    a = np.array(g).astype(np.int16)
    alpha = np.clip(255 - a, 0, 255)
    alpha[alpha < 70] = 0                                   # scan haze
    alpha = (alpha.astype(np.float32) * 1.35).clip(0, 255)
    alpha = ((alpha.astype(np.uint16) // 32) * 32).clip(0, 255).astype(np.uint8)
    alpha[alpha < 48] = 0
    rgba = np.dstack([np.full_like(alpha, 255)] * 3 + [alpha])
    return Image.fromarray(rgba, 'RGBA')


def main(pdf_path):
    root = pathlib.Path(__file__).resolve().parents[1]
    out_dir = root / '5bx' / 'figures'
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = pymupdf.open(pdf_path)
    total_bytes = 0

    for chart, page_no in CHART_PAGES.items():
        page = doc[page_no]
        r = page.rect
        clip = pymupdf.Rect(r.x0 + r.width * 0.50, r.y0 + r.height * 0.03,
                            r.x0 + r.width * 0.99, r.y0 + r.height * 0.98)
        tmp = out_dir / '_panel.png'
        page.get_pixmap(dpi=DPI, clip=clip).save(tmp)
        im = Image.open(tmp).convert('L')
        a = np.array(im)
        ink = a < INK

        # Panel borders: thresholds are relative because chart 6's box prints
        # much lighter than the rest.
        colf = ink.mean(axis=0)
        cols = [i for i, v in enumerate(colf) if v > 0.60 * colf.max()]
        x0, x1 = cols[0] + 12, cols[-1] - 12

        segs, rowink = row_segments(ink[:, x0:x1], join=8)
        tall = sorted(((rowink[s:e + 1].sum(), s, e) for s, e in segs if e - s >= 45),
                      reverse=True)
        blocks = sorted((s, e) for _, s, e in tall[:5])
        if len(blocks) != 5:
            print(f"  ! chart {chart}: found {len(blocks)} blocks, expected 5")

        for n, (y0, y1) in enumerate(blocks, 1):
            g = content_crop(drop_caption(im.crop((x0, y0, x1, y1))))
            if g is None:
                continue
            if g.width / g.height > 4.0:
                parts = split_adaptive(g)
                if len(parts) > 1:
                    g = stack(parts)
            if g.width > OUT_WIDTH:
                g = g.resize((OUT_WIDTH, max(1, round(g.height * OUT_WIDTH / g.width))),
                             Image.LANCZOS)
            fp = out_dir / f'c{chart}e{n}.png'
            strip_caption_band(to_silhouette(g)).save(fp, optimize=True)
            total_bytes += fp.stat().st_size

        tmp.unlink(missing_ok=True)
        print(f"  chart {chart}: {len(blocks)} figures")

    print(f"wrote {out_dir}, {total_bytes/1024:.0f} KB total")


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
