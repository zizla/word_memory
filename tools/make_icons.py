#!/usr/bin/env python3
"""〈눌러〉 단어장 PWA 아이콘 생성.

앱 안의 '주인(朱印)' 로고 배지(.seal-badge)를 아이콘으로 옮긴다.
- any(180/192/512) : 한지(#F7F4EE) 바탕 + 주인(朱印, #B83B2A) 둥근 사각 배지 + '눌'
- maskable(512)    : 붉은 바탕 전체 채움 + 안전 영역(중앙 80% 지름) 안의 '눌'

글꼴은 앱 UI 와 같은 Pretendard Bold(없으면 시스템 Noto Sans CJK KR)를 쓴다.
작은 크기(48px)에서도 뭉개지지 않도록 테두리 장식 없이 배지와 글자만 둔다.

    python3 tools/make_icons.py
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
import urllib.request

BG = (247, 244, 238)     # --bg 한지 라이트
PAPER = (255, 253, 249)  # --surface
SEAL = (184, 59, 42)     # --accent 주인(朱印)
INK = (31, 30, 28)       # --text

HERE = os.path.abspath(os.path.dirname(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "icons"))
FONT_DIR = os.path.join(HERE, "fonts")
PRETENDARD_URL = (
    "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/"
    "packages/pretendard/dist/public/static/Pretendard-Bold.otf"
)
FALLBACK_SANS = "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf"


def font_path():
    local = os.path.join(FONT_DIR, "Pretendard-Bold.otf")
    if not os.path.exists(local):
        os.makedirs(FONT_DIR, exist_ok=True)
        try:
            urllib.request.urlretrieve(PRETENDARD_URL, local)
        except Exception as e:  # 네트워크가 없으면 시스템 한글 폰트로
            print("Pretendard 내려받기 실패, 시스템 폰트 사용:", e)
            return FALLBACK_SANS
    return local


def soft_texture(img, size):
    """한지 결: 중앙만 아주 살짝 밝은 세로 그라데이션 (줄무늬 없이)."""
    grad = Image.new("RGBA", (1, size))
    for y in range(size):
        t = y / max(1, size - 1)
        a = int(6 * (1 - abs(t - 0.5) * 2))
        grad.putpixel((0, y), (212, 202, 185, a))
    img.alpha_composite(grad.resize((size, size)))
    return img


def draw_glyph(d, cx, cy, side, ratio, color, path):
    font = ImageFont.truetype(path, int(side * ratio))
    b = d.textbbox((0, 0), "눌", font=font)
    d.text((cx - (b[2] - b[0]) / 2 - b[0], cy - (b[3] - b[1]) / 2 - b[1]),
           "눌", font=font, fill=color + (255,))


def make(size, maskable=False, path=None):
    path = path or font_path()
    img = Image.new("RGBA", (size, size), (SEAL if maskable else BG) + (255,))
    d = ImageDraw.Draw(img)
    if maskable:
        draw_glyph(d, size / 2, size * 0.505, size, 0.40, PAPER, path)
        return img.convert("RGB")

    soft_texture(img, size)
    d = ImageDraw.Draw(img)
    side = size * 0.62
    cx = cy = size / 2
    x0, y0, x1, y1 = cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2

    # 은은한 그림자
    sh = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        (x0, y0 + side * 0.026, x1, y1 + side * 0.038),
        radius=int(side * 0.24), fill=INK + (36,),
    )
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(max(1, side * 0.028))))

    d = ImageDraw.Draw(img)
    d.rounded_rectangle((x0, y0, x1, y1), radius=int(side * 0.24), fill=SEAL + (255,))
    draw_glyph(d, cx, cy, side, 0.50, PAPER, path)
    return img.convert("RGB")


def main():
    os.makedirs(OUT, exist_ok=True)
    path = font_path()
    for name, size, maskable in (
        ("icon-180.png", 180, False),
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
    ):
        im = make(size, maskable, path)
        p = os.path.join(OUT, name)
        im.save(p, "PNG", optimize=True)
        print(name, im.size, os.path.getsize(p), "bytes")
    make(64, True, path).save(os.path.join(OUT, "favicon-64.png"), "PNG", optimize=True)
    print("font:", os.path.basename(path))


if __name__ == "__main__":
    main()
