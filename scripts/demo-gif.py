#!/usr/bin/env python3
"""Renders .github/assets/demo.gif, a replay of the trial in examples/changelog/results.

    pip install pillow
    python3 scripts/demo-gif.py

The transcript below is the real output of that run with the waits shortened.
Colors follow src/report/terminal.ts. The GIF is drawn at twice the 760px it is
shown at; DEMO_SCALE=1 writes it at 760px. Set DEMO_FONT and DEMO_FONT_BOLD to use
another monospace font; it needs the ✓ ✗ × → glyphs.
"""

import os
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

COMMAND = "npx skilltrial run examples/changelog/skill -t examples/changelog/skilltrial.yaml"
OUT_DIR = ".skilltrial/2026-11-27-18-49-02-changelog"

RUNS = """\
[ 1/20] ✗ add-truncate             skill    #3  score  50%  7.8s
[ 2/20] ✗ add-truncate             baseline #3  score  50%  9.3s
[ 3/20] ✗ add-truncate             baseline #2  score  50%  9.6s
[ 4/20] ✓ add-truncate             skill    #2  score 100%  12s
[ 5/20] ✗ fix-accents              baseline #3  score  67%  7.9s
[ 6/20] ✗ fix-accents              baseline #5  score  67%  10s
[ 7/20] ✓ fix-accents              skill    #5  score 100%  11s
[ 8/20] ✓ fix-accents              skill    #3  score 100%  16s
[ 9/20] ✗ add-truncate             baseline #4  score  50%  8.2s
[10/20] ✗ add-truncate             skill    #4  score  50%  8.9s
[11/20] ✗ fix-accents              baseline #2  score  67%  9.2s
[12/20] ✓ fix-accents              skill    #2  score 100%  11s
[13/20] ✓ fix-accents              skill    #4  score 100%  9.7s
[14/20] ✗ add-truncate             baseline #5  score  50%  11s
[15/20] ✗ fix-accents              baseline #4  score  67%  10s
[16/20] ✓ add-truncate             skill    #5  score 100%  15s
[17/20] ✗ fix-accents              baseline #1  score  67%  8.6s
[18/20] ✗ add-truncate             baseline #1  score  50%  7.6s
[19/20] ✓ fix-accents              skill    #1  score 100%  9.0s
[20/20] ✓ add-truncate             skill    #1  score 100%  12s""".split("\n")

WIDTH = 760
SCALE = int(os.environ.get("DEMO_SCALE", "2"))
ROWS = 25
FONT_SIZE = 14
LINE = 20
PAD_X = 22
PAD_Y = 16
BAR = 36

BG = "#0c0c10"
BAR_BG = "#141418"
BORDER = "#27272a"
FG = "#e4e4e7"
DIM = "#71717a"
GREEN = "#4ade80"
YELLOW = "#fbbf24"
CYAN = "#67d4f5"
BLUE = "#5b8cff"
DOT = "#3f3f46"

FONT_DIRS = ["/usr/share/fonts/truetype/dejavu", "/Library/Fonts", str(Path.home() / "Library/Fonts")]


def load_font(env, filename):
    candidates = [os.environ.get(env)] + [f"{d}/{filename}" for d in FONT_DIRS]
    for path in candidates:
        if path and os.path.exists(path):
            return ImageFont.truetype(path, FONT_SIZE * SCALE)
    sys.exit(f"{filename} not found. Install DejaVu Sans Mono or set {env}.")


REGULAR = load_font("DEMO_FONT", "DejaVuSansMono.ttf")
BOLD = load_font("DEMO_FONT_BOLD", "DejaVuSansMono-Bold.ttf")
CHAR_W = REGULAR.getlength("M")


def span(text, color=FG, bold=False):
    return (text, color, bold)


def run_line(raw):
    m = re.match(r"(\[.+?\]) (.) (.{24}) (.{8}) (#\d+  score .{4})  (.+)", raw)
    counter, mark, task, arm, score, took = m.groups()
    return [
        span(counter, DIM),
        span(f" {mark} ", GREEN if mark == "✓" else YELLOW),
        span(f"{task} "),
        span(arm, CYAN if arm.strip() == "skill" else DIM),
        span(f" {score}  "),
        span(took, DIM),
    ]


def task_line(name, rate, lift, ci):
    return [span(f"  {name:<26}{rate:<14}"), span(f"{lift:>6}", GREEN), span(f"  {ci}", DIM)]


HEADER = [
    [
        span("skilltrial", bold=True),
        span(" 0.1.0  ", DIM),
        span("changelog", CYAN),
        span(" vs no skill  "),
        span("· examples/changelog/skilltrial.yaml", DIM),
    ],
    [span("2 tasks × 5 runs × 2 arms = 20 runs", DIM)],
    [],
]

SUMMARY = [
    [],
    [span("changelog helps: score +32 points (95% CI +22 to +42) over no skill.", GREEN, True)],
    [],
    [span("              baseline  changelog  difference", DIM)],
    [span("  pass rate   0%        80%        +80 pts")],
    [span("  mean score  58%       90%        +32 pts")],
    [span("  median cost $0.0028   $0.0032    +$0.0004")],
    [span("  median time 9.2s      11s        +2.0s")],
    [],
    [span("  task                      pass rate      lift  95% CI", DIM)],
    task_line("fix-accents", "0% → 100%", "+33", "+33 to +33"),
    task_line("add-truncate", "0% → 60%", "+30", "+10 to +50"),
    [],
    [span("  report", DIM), span(f"  {OUT_DIR}/report.html")],
    [span("  badge", DIM), span(f"   {OUT_DIR}/badge.svg")],
    [span("  results", DIM), span(f" {OUT_DIR}/results.json")],
    [],
]


def prompt(typed, cursor=True):
    line = [span("$ ", BLUE, True), span(typed)]
    if cursor:
        line.append(span("█", DIM))
    return line


def render(lines):
    s = SCALE
    height = BAR + PAD_Y * 2 + ROWS * LINE
    img = Image.new("RGB", (WIDTH * s, height * s), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, WIDTH * s, BAR * s], fill=BAR_BG)
    d.line([0, BAR * s, WIDTH * s, BAR * s], fill=BORDER, width=s)
    for i in range(3):
        cx, cy, r = (22 + i * 20) * s, BAR * s // 2, 6 * s
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=DOT)
    title = "skilltrial"
    d.text(((WIDTH * s - REGULAR.getlength(title)) / 2, BAR * s / 2), title, font=REGULAR, fill=DIM, anchor="lm")
    d.rectangle([0, 0, WIDTH * s - 1, height * s - 1], outline=BORDER, width=s)

    for row, line in enumerate(lines[-ROWS:]):
        x = PAD_X * s
        y = (BAR + PAD_Y + row * LINE + LINE / 2) * s
        for text, color, bold in line:
            d.text((x, y), text, font=BOLD if bold else REGULAR, fill=color, anchor="lm")
            x += CHAR_W * len(text)
    return img


def shared_palette():
    """Every text color faded into both backgrounds, so antialiased edges keep their hue."""

    def rgb(value):
        return tuple(int(value[i : i + 2], 16) for i in (1, 3, 5))

    steps = 10
    colors = []
    for back in (BG, BAR_BG):
        for front in (FG, DIM, GREEN, YELLOW, CYAN, BLUE, BORDER, DOT):
            for i in range(steps + 1):
                t = i / steps
                colors.append(tuple(round(b + (f - b) * t) for f, b in zip(rgb(front), rgb(back))))
    colors = list(dict.fromkeys(colors))[:256]
    img = Image.new("P", (1, 1))
    img.putpalette([channel for color in colors for channel in color])
    return img


def build():
    """Returns (lines, milliseconds) for every frame."""
    frames = []
    frames.append(([prompt("")], 700))
    for end in range(3, len(COMMAND) + 3, 3):
        frames.append(([prompt(COMMAND[:end])], 60))
    frames.append(([prompt(COMMAND)], 450))

    screen = [prompt(COMMAND, cursor=False)]
    screen.append(HEADER[0])
    frames.append((list(screen), 350))
    screen += HEADER[1:]
    frames.append((list(screen), 700))

    for raw in RUNS:
        screen.append(run_line(raw))
        # Wait in proportion to how long the run took, at roughly 1/40 speed.
        took = float(raw.rsplit(" ", 1)[1].rstrip("s"))
        frames.append((list(screen), int(90 + took * 14)))

    frames[-1] = (frames[-1][0], 600)
    screen += SUMMARY
    frames.append((screen + [prompt("")], 6000))
    return frames


def main():
    out = Path(__file__).resolve().parent.parent / ".github/assets/demo.gif"
    frames = build()
    palette_src = shared_palette()
    images = [render(lines).quantize(palette=palette_src, dither=Image.Dither.NONE) for lines, _ in frames]
    out.parent.mkdir(parents=True, exist_ok=True)
    images[0].save(
        out,
        save_all=True,
        append_images=images[1:],
        duration=[ms for _, ms in frames],
        loop=0,
        optimize=True,
    )
    print(f"{out}  {images[0].width}x{images[0].height}  {len(images)} frames  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
