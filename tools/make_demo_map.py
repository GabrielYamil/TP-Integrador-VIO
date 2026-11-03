#!/usr/bin/env python3
"""Genera config/marker_map.json para la sala demo 4 × 3 × 2,5 m.

La geometría debe coincidir con `markerPoseOnWall` de
packages/shared/src/markers/map.ts. El test `map.test.ts` compara este archivo
contra la implementación TypeScript para detectar divergencias.

Uso:
    python tools/make_demo_map.py
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "config" / "marker_map.json"

ROOM = {"width_m": 4.0, "depth_m": 3.0, "height_m": 2.5}
MARKER_SIZE_M = 0.16

# (id, pared, offset horizontal desde la izquierda vista desde adentro, altura del centro)
PLACEMENTS = [
    (0, "south", 1.0, 1.2),
    (1, "south", 2.5, 1.2),
    (2, "north", 1.0, 1.2),
    (3, "north", 3.0, 1.2),
    (4, "west", 1.5, 1.2),
    (5, "east", 1.5, 1.2),
]

Vec3 = tuple[float, float, float]
Quat = tuple[float, float, float, float]


def clean(value: float, digits: int = 6) -> float:
    rounded = round(value, digits)
    return 0.0 if abs(rounded) < 10 ** (-digits) else rounded


def normalize(vector: Vec3) -> Vec3:
    length = math.sqrt(sum(component * component for component in vector))
    if length < 1e-12:
        raise ValueError("No se puede normalizar un vector nulo")
    return (vector[0] / length, vector[1] / length, vector[2] / length)


def cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def quat_from_basis(x_axis: Vec3, y_axis: Vec3, z_axis: Vec3) -> Quat:
    """Cuaternión [x, y, z, w] de una base ortonormal derecha en el padre."""
    m00, m10, m20 = x_axis
    m01, m11, m21 = y_axis
    m02, m12, m22 = z_axis
    trace = m00 + m11 + m22

    if trace > 0:
        s = 0.5 / math.sqrt(trace + 1.0)
        w = 0.25 / s
        qx = (m21 - m12) * s
        qy = (m02 - m20) * s
        qz = (m10 - m01) * s
    elif m00 > m11 and m00 > m22:
        s = 2.0 * math.sqrt(1.0 + m00 - m11 - m22)
        w = (m21 - m12) / s
        qx = 0.25 * s
        qy = (m01 + m10) / s
        qz = (m02 + m20) / s
    elif m11 > m22:
        s = 2.0 * math.sqrt(1.0 + m11 - m00 - m22)
        w = (m02 - m20) / s
        qx = (m01 + m10) / s
        qy = 0.25 * s
        qz = (m12 + m21) / s
    else:
        s = 2.0 * math.sqrt(1.0 + m22 - m00 - m11)
        w = (m10 - m01) / s
        qx = (m02 + m20) / s
        qy = (m12 + m21) / s
        qz = 0.25 * s

    length = math.sqrt(qx * qx + qy * qy + qz * qz + w * w)
    return (qx / length, qy / length, qz / length, w / length)


def wall_frame(wall: str) -> tuple[Vec3, Vec3, Vec3, Vec3]:
    """Origen en el piso y ejes (x, y, z) del marcador visto desde adentro."""
    width = ROOM["width_m"]
    depth = ROOM["depth_m"]
    up: Vec3 = (0.0, 0.0, 1.0)
    if wall == "north":
        return (0.0, depth, 0.0), (1.0, 0.0, 0.0), up, (0.0, -1.0, 0.0)
    if wall == "south":
        return (width, 0.0, 0.0), (-1.0, 0.0, 0.0), up, (0.0, 1.0, 0.0)
    if wall == "east":
        return (width, depth, 0.0), (0.0, -1.0, 0.0), up, (-1.0, 0.0, 0.0)
    if wall == "west":
        return (0.0, 0.0, 0.0), (0.0, 1.0, 0.0), up, (1.0, 0.0, 0.0)
    raise ValueError(f"Pared desconocida: {wall}")


def marker_pose(wall: str, offset_m: float, height_m: float) -> dict:
    origin, x_axis, y_axis, z_axis = wall_frame(wall)
    span = ROOM["width_m"] if wall in ("north", "south") else ROOM["depth_m"]
    half = MARKER_SIZE_M / 2.0
    if not (half <= offset_m <= span - half):
        raise ValueError(f"Offset {offset_m} fuera de la pared {wall}")
    if not (half <= height_m <= ROOM["height_m"] - half):
        raise ValueError(f"Altura {height_m} fuera de la sala")

    position = (
        origin[0] + x_axis[0] * offset_m,
        origin[1] + x_axis[1] * offset_m,
        origin[2] + height_m,
    )
    quat = quat_from_basis(x_axis, y_axis, z_axis)
    return {
        "position": [clean(value) for value in position],
        "orientation_xyzw": [clean(value) for value in quat],
    }


def build_map() -> dict:
    markers = []
    for marker_id, wall, offset_m, height_m in PLACEMENTS:
        pose = marker_pose(wall, offset_m, height_m)
        markers.append(
            {
                "id": marker_id,
                "size_m": MARKER_SIZE_M,
                "position": pose["position"],
                "orientation_xyzw": pose["orientation_xyzw"],
            }
        )
    return {
        "frame_id": "world",
        "dictionary": "APRILTAG_36h11",
        "markers": markers,
    }


def describe_placements() -> Iterable[str]:
    for marker_id, wall, offset_m, height_m in PLACEMENTS:
        pose = marker_pose(wall, offset_m, height_m)
        p = pose["position"]
        yield (
            f"  ID {marker_id}: {wall:5s} offset={offset_m:.2f} m "
            f"h={height_m:.2f} m -> p=({p[0]:.3f}, {p[1]:.3f}, {p[2]:.3f})"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    # Verificación interna: base derecha y unitaria.
    for wall in ("north", "south", "east", "west"):
        _, x_axis, y_axis, z_axis = wall_frame(wall)
        assert abs(sum(a * b for a, b in zip(x_axis, y_axis))) < 1e-12
        assert abs(sum(a * b for a, b in zip(x_axis, z_axis))) < 1e-12
        assert abs(sum(a * b for a, b in zip(y_axis, z_axis))) < 1e-12
        c = cross(x_axis, y_axis)
        assert max(abs(c[i] - z_axis[i]) for i in range(3)) < 1e-12

    data = build_map()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"[map] Sala demo: {ROOM['width_m']} × {ROOM['depth_m']} × {ROOM['height_m']} m")
    print("\n".join(describe_placements()))
    print(f"[map] Escrito: {args.out}")


if __name__ == "__main__":
    main()
