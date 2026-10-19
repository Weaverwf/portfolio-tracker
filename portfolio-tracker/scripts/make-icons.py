#!/usr/bin/env python3
"""Draw the home-screen icon. Optional: the PNGs in icons/ are already generated."""

import struct
import zlib
from pathlib import Path

PINE = (35, 66, 55)
CREAM = (251, 248, 242)
ROOT = Path(__file__).resolve().parents[1] / "icons"


def capsule(px, py, ax, ay, bx, by, radius):
    abx, aby = bx - ax, by - ay
    ab2 = abx * abx + aby * aby
    if ab2 == 0:
        t = 0
    else:
        t = max(0.0, min(1.0, ((px - ax) * abx + (py - ay) * aby) / ab2))
    dx = px - (ax + abx * t)
    dy = py - (ay + aby * t)
    return dx * dx + dy * dy <= radius * radius


def in_circle(x, y, size):
    cx = size / 2
    cy = size / 2
    return (x - cx) ** 2 + (y - cy) ** 2 <= (size * 0.34) ** 2


def in_letter(x, y, size):
    cx = size / 2
    cy = size / 2
    stem_r = size * 0.058
    stem_x = cx - size * 0.075
    top = cy - size * 0.19
    bottom = cy + size * 0.21
    if capsule(x, y, stem_x, top, stem_x, bottom, stem_r):
        return True
    bx = stem_x + size * 0.01
    by = cy - size * 0.075
    dx, dy = x - bx, y - by
    outer = size * 0.145
    inner = size * 0.072
    dist = dx * dx + dy * dy
    return inner * inner <= dist <= outer * outer and dy <= stem_r * 0.35 and dx >= -stem_r * 0.2


def sample_color(x, y, size):
    if in_circle(x, y, size):
        return PINE if in_letter(x, y, size) else CREAM
    return PINE


def coverage(x, y, size, samples=3):
    acc = [0, 0, 0]
    n = samples * samples
    for sy in range(samples):
        for sx in range(samples):
            color = sample_color(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples, size)
            acc[0] += color[0]
            acc[1] += color[1]
            acc[2] += color[2]
    return tuple(round(channel / n) for channel in acc)


def png(size, rgba):
    raw = b"".join(b"\x00" + rgba[y * size * 4 : (y + 1) * size * 4] for y in range(size))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def render(size):
    buf = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            red, green, blue = coverage(x, y, size)
            i = (y * size + x) * 4
            buf[i] = red
            buf[i + 1] = green
            buf[i + 2] = blue
            buf[i + 3] = 255
    return bytes(buf)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for size, name in ((180, "icon-180.png"), (192, "icon-192.png"), (512, "icon-512.png")):
        path = ROOT / name
        path.write_bytes(png(size, render(size)))
        print(path)


if __name__ == "__main__":
    main()
