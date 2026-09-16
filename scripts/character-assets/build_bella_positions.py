"""Build Bella Banker's 21 application poses from her approved PixelLab art.

The four edited PixelLab rotations are the identity source.  This script never
regenerates or recolors Bella's head: it crops the approved pixels onto the
16x32 application grid, then changes only limb placement and the reading prop
to follow the same seven-pose grammar as Cody's final sheet.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).parents[2]
SOURCE = ROOT / "assets-source" / "characters" / "Bella Banker"
OUTPUT = SOURCE / "poses-16x32"
SHEET = ROOT / "webview-ui" / "public" / "assets" / "characters" / "char_6.png"
CORRECTIONS = SOURCE / "bella-learned-corrections.json"

FRAME_SIZE = (16, 32)
TRANSPARENT = (0, 0, 0, 0)

# Exact approved PixelLab palette.
OUTLINE = (28, 17, 11, 255)
SKIN = (249, 185, 118, 255)
SKIN_SHADOW = (235, 145, 69, 255)
UNIFORM = (48, 63, 75, 255)
UNIFORM_DARK = (33, 37, 42, 255)
BLOUSE = (232, 221, 199, 255)
TEAL = (17, 127, 146, 255)
SHOE = (78, 41, 22, 255)
SHOE_LIGHT = (118, 62, 25, 255)

SKIN_COLORS = {SKIN, SKIN_SHADOW}

DIRECTIONS = ("baixo", "cima", "direita")
POSES = (
    "andar-contato-A",
    "andar-passada",
    "andar-contato-B",
    "digitando-1",
    "digitando-2",
    "lendo-1",
    "lendo-2",
)


def approved_bases() -> dict[str, Image.Image]:
    """Crop the approved rotations without rescaling or inventing colors."""

    specs = {
        # PixelLab export order: front, right profile, back, left profile.
        "baixo": ("bella_0001.png", 8),
        "cima": ("bella_0005.png", 8),
        "direita": ("bella_0003.png", 6),
    }
    bases: dict[str, Image.Image] = {}
    for direction, (name, left) in specs.items():
        source = Image.open(SOURCE / name).convert("RGBA")
        if source.size != (32, 32):
            raise ValueError(f"{name}: expected 32x32, got {source.size}")
        # The right profile is 17 pixels wide only because three outline pixels
        # protrude at its far edge.  The 16-pixel crop retains the approved art
        # without scaling; the app mirrors this frame for the opposite profile.
        bases[direction] = source.crop((left, 0, left + 16, 32))
    return bases


def shifted(image: Image.Image, dx: int, dy: int) -> Image.Image:
    result = Image.new("RGBA", image.size, TRANSPARENT)
    result.alpha_composite(image, (dx, dy))
    return result


def move_leg_groups(base: Image.Image, direction: str, phase: int) -> Image.Image:
    """Make one contact pose by separating the approved leg pixels."""

    result = base.copy()
    pixels = result.load()
    source = base.load()

    # Clear only the legs.  Skirt, jacket, head, face and hair stay byte-for-byte
    # equal to the approved source.
    for y in range(26, 31):
        for x in range(16):
            pixels[x, y] = TRANSPARENT

    split = 9 if direction == "direita" else 7
    for y in range(26, 30):
        for x in range(16):
            color = source[x, y]
            if color[3] == 0:
                continue
            first = x <= split
            if phase < 0:
                dx, dy = ((-1, 0) if first else (1, -1))
            else:
                dx, dy = ((-1, -1) if first else (1, 0))
            nx, ny = x + dx, y + dy
            if 0 <= nx < 16 and 0 <= ny < 32:
                pixels[nx, ny] = color
    return result


def erase_lower_hands(image: Image.Image) -> Image.Image:
    """Extend the sleeves over side-positioned hands before bending the arms."""

    result = image.copy()
    pixels = result.load()
    for y in range(18, 25):
        for x in range(16):
            if pixels[x, y] in SKIN_COLORS:
                pixels[x, y] = UNIFORM
    return result


def seated_base(base: Image.Image, direction: str) -> Image.Image:
    """Recompose the lower body using Cody/native seated silhouettes."""

    result = base.copy()
    pixels = result.load()
    draw = ImageDraw.Draw(result)

    if direction == "baixo":
        # Front: preserve the approved character's exact leg anatomy and total
        # height.  Cody defines the seated pose, not Bella's absolute baseline.
        # Her source already has the correct stack: two skin rows, one shoe row
        # and one outline row, so no lower-body remap is necessary here.
        pass
    elif direction == "cima":
        # Rear: the chair/desk hides the lower body.  All native characters and
        # Cody end at the torso in these four frames.
        for y in range(26, 32):
            for x in range(16):
                pixels[x, y] = TRANSPARENT
    else:
        # Profile: upright torso with the skirt and legs projecting forward.
        for y in range(25, 32):
            for x in range(16):
                pixels[x, y] = TRANSPARENT
        draw.polygon(
            [(7, 24), (11, 24), (11, 25), (13, 25), (13, 27),
             (12, 27), (12, 28), (8, 28), (8, 27), (7, 27)],
            fill=OUTLINE,
        )
        draw.polygon([(8, 25), (11, 25), (11, 26), (12, 26), (12, 27), (9, 27)], fill=UNIFORM_DARK)
        draw.rectangle((12, 27, 13, 28), fill=SKIN)
        draw.point((12, 28), fill=SKIN_SHADOW)
        draw.rectangle((13, 29, 15, 29), fill=OUTLINE)
        draw.rectangle((14, 28, 15, 28), fill=SHOE)
        draw.point((14, 28), fill=SHOE_LIGHT)

    return result


def refine_side_reading_seat(image: Image.Image) -> None:
    """Give the profile-reading pose a clean skirt, leg and full-size shoe."""

    pixels = image.load()
    draw = ImageDraw.Draw(image)
    for y in range(24, 32):
        for x in range(7, 16):
            pixels[x, y] = TRANSPARENT

    # Navy skirt remains a continuous clothing mass.  Skin starts only below
    # it, preventing orange pixels from reading as stains on the uniform.
    draw.polygon(
        [(7, 24), (11, 24), (11, 25), (13, 25), (13, 27),
         (12, 27), (12, 28), (8, 28), (8, 27), (7, 27)],
        fill=OUTLINE,
    )
    draw.polygon([(8, 25), (11, 25), (11, 26), (12, 26), (11, 27), (9, 27)], fill=UNIFORM_DARK)

    # A readable bent leg and a three-pixel-wide brown shoe.
    draw.point((11, 27), fill=SKIN)
    draw.rectangle((11, 28, 12, 28), fill=SKIN_SHADOW)
    draw.point((12, 27), fill=SKIN)
    draw.rectangle((12, 29, 15, 29), fill=OUTLINE)
    draw.rectangle((13, 28, 15, 28), fill=SHOE)
    draw.rectangle((13, 29, 14, 29), fill=SHOE_LIGHT)


def typing_pose(base: Image.Image, direction: str, variant: int) -> Image.Image:
    result = erase_lower_hands(base)
    draw = ImageDraw.Draw(result)

    if direction == "baixo":
        y_left, y_right = ((21, 22) if variant == 0 else (22, 21))
        # Bent sleeves converge toward an implied keyboard outside the sprite.
        draw.line((3, 20, 5, y_left), fill=OUTLINE, width=2)
        draw.point((4, 20), fill=UNIFORM_DARK)
        draw.line((12, 20, 10, y_right), fill=OUTLINE, width=2)
        draw.point((11, 20), fill=UNIFORM_DARK)
        draw.rectangle((5, y_left, 6, y_left + 1), fill=SKIN)
        draw.rectangle((9, y_right, 10, y_right + 1), fill=SKIN)
        draw.point((5, y_left + 1), fill=SKIN_SHADOW)
        draw.point((10, y_right + 1), fill=SKIN_SHADOW)
    elif direction == "cima":
        # Hands point away from the camera and are mostly hidden by the torso.
        y_left, y_right = ((20, 21) if variant == 0 else (21, 20))
        draw.line((3, 20, 5, y_left), fill=UNIFORM_DARK, width=2)
        draw.line((12, 20, 10, y_right), fill=UNIFORM_DARK, width=2)
    else:
        y = 20 + variant
        draw.line((9, 20, 13, y), fill=OUTLINE, width=2)
        draw.line((9, 20, 12, y), fill=UNIFORM_DARK)
        draw.rectangle((13, y, 14, y + 1), fill=SKIN)
        draw.point((14, y + 1), fill=SKIN_SHADOW)

    return result


def reading_pose(base: Image.Image, direction: str, variant: int) -> Image.Image:
    result = erase_lower_hands(base)
    draw = ImageDraw.Draw(result)

    if direction == "baixo":
        # Cody/native letter: cream face, dark border and two inset lines.
        draw.rectangle((4, 19, 11, 25), fill=OUTLINE)
        draw.rectangle((5, 20, 10, 24), fill=BLOUSE)
        draw.line((6, 21, 9, 21), fill=UNIFORM_DARK)
        draw.line((6, 23, 9, 23), fill=UNIFORM_DARK)
        hand_y = 21 + variant
        draw.rectangle((3, hand_y, 4, hand_y + 1), fill=SKIN)
        draw.rectangle((11, 22 - variant, 12, 23 - variant), fill=SKIN)
        draw.point((3, hand_y + 1), fill=SKIN_SHADOW)
        draw.point((12, 23 - variant), fill=SKIN_SHADOW)
    elif direction == "cima":
        # The document is in front of her body and therefore hidden from the
        # rear view; hand spacing still distinguishes the reading loop.
        y = 20 + variant
        draw.line((3, 20, 2, y + 1), fill=OUTLINE, width=2)
        draw.line((12, 20, 13, 22 - variant), fill=OUTLINE, width=2)
        draw.point((2, y + 1), fill=SKIN)
        draw.point((13, 22 - variant), fill=SKIN)
    else:
        refine_side_reading_seat(result)
        draw = ImageDraw.Draw(result)
        draw.line((9, 20, 11, 21), fill=OUTLINE, width=2)
        hand_y = 21 + variant
        draw.point((11, hand_y), fill=SKIN)
        # In profile the front-facing letter collapses to its thin edge: three
        # light pixels on a diagonal, matching Cody's final side silhouette.
        draw.point((12, 21 + variant), fill=BLOUSE)
        draw.point((13, 20 + variant), fill=BLOUSE)
        draw.point((14, 19 + variant), fill=BLOUSE)

    return result


def build_frames() -> dict[str, list[Image.Image]]:
    bases = approved_bases()
    rows: dict[str, list[Image.Image]] = {}
    for direction, base in bases.items():
        seated = seated_base(base, direction)
        rows[direction] = [
            move_leg_groups(base, direction, -1),
            shifted(base, 0, 1),
            move_leg_groups(base, direction, 1),
            typing_pose(seated, direction, 0),
            typing_pose(seated, direction, 1),
            reading_pose(seated, direction, 0),
            reading_pose(seated, direction, 1),
        ]
    return rows


def pack_sheet(rows: dict[str, list[Image.Image]]) -> Image.Image:
    sheet = Image.new("RGBA", (16 * 7, 32 * 3), TRANSPARENT)
    for row, direction in enumerate(DIRECTIONS):
        for column, frame in enumerate(rows[direction]):
            sheet.alpha_composite(frame, (column * 16, row * 32))
    return sheet


def apply_learned_corrections(sheet: Image.Image) -> Image.Image:
    """Apply Samira's approved pixel edits with stale-base protection."""

    if not CORRECTIONS.exists():
        return sheet
    data = json.loads(CORRECTIONS.read_text(encoding="utf-8"))
    if data.get("size") != list(sheet.size):
        raise ValueError(f"correction sheet size is stale: {data.get('size')}")
    result = sheet.copy()
    for change in data.get("changes", []):
        x, y = change["x"], change["y"]
        before = tuple(change["from"])
        current = result.getpixel((x, y))
        if current != before:
            raise ValueError(
                f"stale correction at ({x},{y}): expected {before}, found {current}"
            )
        result.putpixel((x, y), tuple(change["to"]))
    return result


def unpack_sheet(sheet: Image.Image) -> dict[str, list[Image.Image]]:
    rows: dict[str, list[Image.Image]] = {}
    for row, direction in enumerate(DIRECTIONS):
        rows[direction] = [
            sheet.crop((column * 16, row * 32, (column + 1) * 16, (row + 1) * 32))
            for column in range(7)
        ]
    return rows


def preview(rows: dict[str, list[Image.Image]], zoom: int = 10) -> Image.Image:
    image = Image.new("RGBA", (16 * 7 * zoom, 32 * 3 * zoom), (24, 24, 28, 255))
    for row, direction in enumerate(DIRECTIONS):
        for column, frame in enumerate(rows[direction]):
            enlarged = frame.resize((16 * zoom, 32 * zoom), Image.Resampling.NEAREST)
            image.alpha_composite(enlarged, (column * 16 * zoom, row * 32 * zoom))
    return image


def validate(rows: dict[str, list[Image.Image]]) -> None:
    for direction, frames in rows.items():
        if len(frames) != 7:
            raise ValueError(f"{direction}: expected 7 frames")
        for frame in frames:
            if frame.size != FRAME_SIZE or frame.mode != "RGBA":
                raise ValueError(f"{direction}: invalid frame {frame.size}/{frame.mode}")
        for a, b, label in ((0, 2, "walk contacts"), (3, 4, "typing"), (5, 6, "reading")):
            if frames[a].tobytes() == frames[b].tobytes():
                raise ValueError(f"{direction}: repeated {label} frames")
        if frames[3].tobytes() == frames[5].tobytes():
            raise ValueError(f"{direction}: typing and reading are identical")


def main() -> None:
    rows = build_frames()
    validate(rows)
    sheet = apply_learned_corrections(pack_sheet(rows))
    rows = unpack_sheet(sheet)
    validate(rows)
    OUTPUT.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, object] = {
        "_source": "Approved PixelLab Bella rotations in assets/characters/Bella Banker",
        "_order": list(POSES),
    }
    for direction in DIRECTIONS:
        names = []
        for pose, frame in zip(POSES, rows[direction], strict=True):
            name = f"{direction}-{pose}.png"
            frame.save(OUTPUT / name, optimize=False)
            names.append(name)
        manifest[direction] = names

    (OUTPUT / "folha.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    preview(rows).save(OUTPUT / "_preview.png", optimize=False)
    sheet.save(SHEET, optimize=False)
    print(f"21 frames: {OUTPUT}")
    print(f"sheet: {SHEET}")


if __name__ == "__main__":
    main()
