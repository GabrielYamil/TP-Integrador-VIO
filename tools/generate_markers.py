#!/usr/bin/env python3
"""Genera AprilTag 36h11 para imprimir y un PDF A4 a escala real.

El lado negro de cada marcador mide exactamente `--size-cm` (16 cm por defecto).
Cada página A4 incluye 2 cm de margen blanco alrededor (zona de silencio) y una
regla de 10 cm para verificar que la impresión quedó al 100 %.

Uso:
    python tools/generate_markers.py
    python tools/generate_markers.py --ids 0 1 2 3 4 5 --size-cm 16
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "markers"

A4_WIDTH_CM = 21.0
A4_HEIGHT_CM = 29.7
QUIET_ZONE_CM = 2.0


def cm_to_px(cm: float, dpi: int) -> int:
    return int(round(cm / 2.54 * dpi))


def load_font(size_px: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
            if bold
            else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        ),
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size_px)
    return ImageFont.load_default()


def generate_marker(marker_id: int, side_px: int) -> Image.Image:
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36h11)
    image = cv2.aruco.generateImageMarker(dictionary, marker_id, side_px)
    if image.ndim == 3:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return Image.fromarray(np.asarray(image, dtype=np.uint8), mode="L")


def draw_scale_ruler(draw: ImageDraw.ImageDraw, dpi: int, page_w: int, y: int) -> None:
    length = cm_to_px(10.0, dpi)
    x0 = (page_w - length) // 2
    tick = cm_to_px(0.18, dpi)
    draw.line((x0, y, x0 + length, y), fill=0, width=max(1, dpi // 150))
    for i in range(11):
        x = x0 + round(length * i / 10)
        height = tick * (2 if i % 5 == 0 else 1)
        draw.line((x, y - height, x, y + height), fill=0, width=max(1, dpi // 200))
    font = load_font(max(14, int(dpi * 0.085)))
    draw.text((page_w // 2, y + tick * 2), "10 cm", fill=0, font=font, anchor="ma")


def build_page(
    marker_id: int,
    marker: Image.Image,
    size_cm: float,
    dpi: int,
) -> Image.Image:
    page_w = cm_to_px(A4_WIDTH_CM, dpi)
    page_h = cm_to_px(A4_HEIGHT_CM, dpi)
    page = Image.new("L", (page_w, page_h), 255)
    draw = ImageDraw.Draw(page)

    side = cm_to_px(size_cm, dpi)
    quiet = cm_to_px(QUIET_ZONE_CM, dpi)
    total = side + 2 * quiet
    if total > page_w:
        raise ValueError("El marcador con márgenes no entra en A4")

    x0 = (page_w - total) // 2
    y0 = cm_to_px(2.0, dpi)
    marker_resized = marker.resize((side, side), Image.Resampling.NEAREST)
    page.paste(marker_resized, (x0 + quiet, y0 + quiet))

    title_font = load_font(max(28, int(dpi * 0.14)), bold=True)
    body_font = load_font(max(20, int(dpi * 0.095)))

    text_y = y0 + total + cm_to_px(0.7, dpi)
    draw.text(
        (page_w // 2, text_y),
        f"AprilTag 36h11 · ID {marker_id}",
        fill=0,
        font=title_font,
        anchor="ma",
    )
    draw.text(
        (page_w // 2, text_y + cm_to_px(0.85, dpi)),
        f"Lado negro: {size_cm:.1f} cm · imprimir al 100 % (sin ajustar a la página)",
        fill=0,
        font=body_font,
        anchor="ma",
    )
    draw.text(
        (page_w // 2, text_y + cm_to_px(1.45, dpi)),
        "Mantener el margen blanco de 2 cm y pegar sobre una superficie rígida.",
        fill=0,
        font=body_font,
        anchor="ma",
    )

    draw_scale_ruler(draw, dpi, page_w, page_h - cm_to_px(1.6, dpi))
    return page


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ids", nargs="+", type=int, default=list(range(6)))
    parser.add_argument("--size-cm", type=float, default=16.0)
    parser.add_argument("--dpi", type=int, default=300)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    if args.size_cm <= 0:
        parser.error("--size-cm debe ser positivo")
    if args.dpi < 150:
        parser.error("--dpi debe ser >= 150 para imprimir con calidad")

    out_dir: Path = args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    side_px = cm_to_px(args.size_cm, args.dpi)
    pages: list[Image.Image] = []

    for marker_id in args.ids:
        marker = generate_marker(marker_id, side_px)
        marker_path = out_dir / f"marker_{marker_id:02d}_id{marker_id}.png"
        marker.save(marker_path, dpi=(args.dpi, args.dpi))
        pages.append(build_page(marker_id, marker, args.size_cm, args.dpi))
        print(f"[markers] {marker_path.name}: {side_px}×{side_px} px ({args.size_cm:.1f} cm)")

    pdf_path = out_dir / "markers_A4.pdf"
    pages[0].save(
        pdf_path,
        "PDF",
        resolution=float(args.dpi),
        save_all=True,
        append_images=pages[1:],
    )
    print(f"[markers] PDF: {pdf_path} ({len(pages)} páginas A4)")
    print("[markers] Imprimí al 100 % y verificá la regla de 10 cm.")


if __name__ == "__main__":
    main()
