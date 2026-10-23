"""
Turns the reference image into a seamless looping background video.

The picture itself is the reference: it is cleaned of JPEG noise and enlarged, so the shape and
colours match it exactly. On top of that, every frame adds gentle motion, all with whole numbers
of cycles per loop so the last frame flows into the first:
  - the whole glow slowly breathes (a tiny zoom and a soft brightness pulse)
  - light travels round the bright arch and the ring shimmers
  - a glint of light slides back and forth along the horizon
  - the reflection ripples like a still surface
  - a few stars twinkle and specks of dust drift up through the light
  - fine film grain (which also stops banding in the dark gradients)

Usage:  python3 render.py <first_frame> <last_frame_exclusive> [width]
        python3 render.py 0 240 1920      (all 240 frames of the 10-second loop)
Then run encode.sh. Needs: python3, numpy, opencv-python, ffmpeg.
"""
import os
import sys

import cv2
import numpy as np

W = int(sys.argv[3]) if len(sys.argv) > 3 else 1920
H = int(round(W * 9 / 16))
FPS = 24
LOOP_SECONDS = 10
N_FRAMES = FPS * LOOP_SECONDS
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('FRAMES_DIR', os.path.join(HERE, 'frames'))
os.makedirs(OUT, exist_ok=True)
REF = os.environ.get('REF', os.path.join(HERE, 'reference.png'))
TAU = 2 * np.pi

# Where things are in the reference (measured): glow centre and horizon row.
REF_CX, REF_Y0 = 340.5, 272.0
U = 0.84 * W / 1000.0          # pixels per unit; the same size the hero's SVG glow uses (84% of the width)
S = U / 0.735                  # reference pixels -> frame pixels
Y0 = int(round(0.61 * H))      # horizon at 61% down, where the hero puts it
CX = W / 2.0

# ---------------------------------------------------------------- the picture
src = cv2.imread(REF)                                                # BGR uint8, 735 x 490
src = cv2.fastNlMeansDenoisingColored(src, None, 7, 7, 7, 21)         # removes the JPEG blocks and speckle
src = cv2.GaussianBlur(src, (0, 0), 0.5).astype(np.float32)[..., ::-1] / 255.0   # RGB float 0..1

BG_C = np.array([5, 3, 12], np.float32) / 255.0      # exactly the page background (#05030c), so the video melts into the page


def warp(scale_mult=1.0):
    s = S * scale_mult
    M = np.float32([[s, 0, CX - REF_CX * s], [0, s, Y0 - REF_Y0 * s]])
    return cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


# The enlarged picture must not show a border. So the whole glow is eased into the page colour by one
# smooth oval window that closes well inside the picture's edges (there is no rectangle to see).
_xu = (np.arange(W, dtype=np.float32)[None, :] - CX) / U
_yu = (np.arange(H, dtype=np.float32)[:, None] - Y0) / U
_rn = np.sqrt((_xu / 430.0) ** 2 + (_yu / 340.0) ** 2)
WINDOW = np.exp(-(_rn ** 6) * 3.5).astype(np.float32)[..., None]
del _xu, _yu, _rn

# ---------------------------------------------------------------- static maps for the motion
base0 = warp()
lum = base0.mean(axis=2)
WL = np.clip(lum, 0, 1) ** 2.2                                       # bright features shimmer most
xx = (np.arange(W, dtype=np.float32)[None, :] - CX) / U
yy = (np.arange(H, dtype=np.float32)[:, None] - Y0) / U
ady = np.where(yy < 0, -yy, yy * 1.25)                               # the reflection is squashed by 1.25
R = np.sqrt(xx ** 2 + ady ** 2)
TH = np.arctan2(ady, xx).astype(np.float32)
MC = np.exp(-(R / 250.0) ** 2).astype(np.float32)
WM = (WL * MC).astype(np.float32)
LUM06 = (np.clip(lum, 0, 1) ** 0.6).astype(np.float32)
del R

rows_below = H - Y0
kk = np.arange(rows_below, dtype=np.float32)
MAPX0 = np.tile(np.arange(W, dtype=np.float32), (rows_below, 1))
MAPY = np.tile(kk[:, None], (1, W))
RIPPLE_AMP = ((0.25 + 3.0 * np.clip(kk / (150 * U), 0, 1)) * (W / 1920)).astype(np.float32)[:, None]
RIPPLE_PH = (kk / (24.0 * U)).astype(np.float32)[:, None]

ROW_FADE = np.clip(1 - kk / (300 * U), 0, 1).astype(np.float32)
COL_WIN = np.exp(-(((np.arange(W, dtype=np.float32) - CX) / U) / 280.0) ** 2).astype(np.float32)

# glint that slides along the horizon
GLINT_Y = (0.6 * np.exp(-(yy ** 2) / (2 * 1.6 ** 2)) + 0.4 * np.exp(-(yy ** 2) / (2 * 7.0 ** 2)))
GLINT_Y = (GLINT_Y * np.where(yy < 0, 1.0, 0.55)).astype(np.float32)
GLINT_C = np.array([0.90, 0.74, 1.0], np.float32)

# stars and dust (fixed layout so every render is identical)
rng = np.random.default_rng(11)
STARS = [(rng.uniform(0.02, 0.98) * W, rng.uniform(0.03, 0.98) * Y0, rng.uniform(0.10, 0.34),
          rng.uniform(0, TAU), int(rng.integers(1, 4))) for _ in range(46)]
DUST = [(rng.uniform(0.2, 0.8) * W, rng.uniform(0.3, 0.95) * Y0, rng.uniform(1.3, 3.2) * W / 1920,
         rng.uniform(0.06, 0.18), rng.uniform(0, 1), rng.uniform(0.10, 0.26) * H, rng.uniform(-0.05, 0.05) * W) for _ in range(26)]
DUST_C = np.array([0.80, 0.69, 1.0], np.float32)
STAR_C = np.array([0.85, 0.80, 1.0], np.float32)


def add_spot(img, x, y, sigma, amp, color):
    r = int(np.ceil(sigma * 3))
    xi, yi = int(round(x)), int(round(y))
    xa, xb = max(0, xi - r), min(W, xi + r + 1)
    ya, yb = max(0, yi - r), min(Y0, yi + r + 1)
    if xa >= xb or ya >= yb:
        return
    gy_ = np.arange(ya, yb, dtype=np.float32)[:, None] - y
    gx_ = np.arange(xa, xb, dtype=np.float32)[None, :] - x
    g = amp * np.exp(-(gx_ * gx_ + gy_ * gy_) / (2 * sigma * sigma))
    img[ya:yb, xa:xb] += g[..., None] * color


def frame(i):
    t = i / N_FRAMES
    sn = lambda cycles, phase=0.0: np.sin(TAU * (cycles * t) + phase)

    # 1) the picture, breathing: a very small zoom about the horizon centre
    img = warp(1.0 + 0.007 * sn(1))
    img = BG_C + (img - BG_C) * WINDOW

    # 2) light travelling round the arch, ring shimmer, soft overall pulse
    shimmer = 0.11 * np.sin(3 * TH - TAU * 2 * t) + 0.07 * np.sin(5 * TH + TAU * 3 * t + 1.0) + 0.05 * sn(1, 0.8)
    gain = 1.0 + WM * shimmer + 0.035 * sn(1) * LUM06
    img = img * gain[..., None]

    # 3) glint sliding along the horizon
    ux_row = (np.arange(W, dtype=np.float32) - CX) / U
    gxp = np.exp(-((ux_row - 240 * np.sin(TAU * t)) / 100.0) ** 2) * np.exp(-(np.abs(ux_row) / 330.0) ** 4)   # stays where the streak really is
    img = img + (0.26 * GLINT_Y * gxp[None, :])[..., None] * GLINT_C

    # 4) stars and dust (above the horizon)
    for (x, y, amp, ph, k) in STARS:
        add_spot(img, x, y, 0.8 * W / 1920 + 0.25, amp * (0.55 + 0.45 * np.sin(TAU * k * t + ph)), STAR_C)
    for (x, y, sg, amp, ph, rise, drift) in DUST:
        p = (t + ph) % 1.0
        add_spot(img, x + drift * p, y - rise * p, sg, amp * np.sin(np.pi * p) ** 2, DUST_C)

    # 5) the reflection ripples
    lower = np.ascontiguousarray(img[Y0:])
    dx = RIPPLE_AMP * np.sin(TAU * (RIPPLE_PH - 3 * t)) + 0.5 * RIPPLE_AMP * np.sin(TAU * (RIPPLE_PH * 2.3 + 2 * t))
    img[Y0:] = cv2.remap(lower, MAPX0 + dx, MAPY, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

    # 6) film grain, a little stronger in the reflection (like the reference), plus 8-bit dither
    grain = np.random.default_rng(1000 + i).standard_normal((H, W)).astype(np.float32)
    gain_g = np.ones((H, W), np.float32)
    gain_g[Y0:] += 1.2 * ROW_FADE[:, None] * COL_WIN[None, :]      # extra grain only in the glow's reflection
    out = img * 255.0 + (grain * gain_g * 1.1)[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


if __name__ == '__main__':
    a, b = int(sys.argv[1]), int(sys.argv[2])
    for i in range(a, b):
        cv2.imwrite(f'{OUT}/f_{i:04d}.jpg', frame(i)[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 97])
    print('rendered', a, 'to', b - 1)
