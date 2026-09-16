"""Build Stella Sales' 21 Pixel Agents poses from approved PixelLab rotations.

The approved 32x32 rotations are the identity authority.  Every output frame
starts from the corresponding char_0 frame's opaque topology; the script then
transfers Stella's exact directional head pixels and approved body palette.
No source image is rescaled and no unapproved character sheet is used as pose
geometry.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).parents[2]
SOURCE = ROOT / "assets-source" / "characters" / "Stella Sales"
OUTPUT = SOURCE / "poses-16x32"
TEMPLATE_PATH = ROOT / "webview-ui" / "public" / "assets" / "characters" / "char_0.png"
SECONDARY_ARMS_PATH = (
    ROOT / "webview-ui" / "public" / "assets" / "characters" / "char_4.png"
)
SHEET_PATH = ROOT / "webview-ui" / "public" / "assets" / "characters" / "char_7.png"
CORRECTIONS = SOURCE / "stella-learned-corrections.json"

FRAME_SIZE = (16, 32)
SHEET_SIZE = (112, 96)
TRANSPARENT = (0, 0, 0, 0)

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

# Exact colors already present in Stella's approved export.
OUTLINE = (45, 45, 45, 255)
OUTLINE_DEEP = (17, 17, 16, 255)
SKIN = (223, 169, 154, 255)
SKIN_SHADOW = (207, 137, 115, 255)
GRAY_LIGHT = (234, 234, 234, 255)
GRAY = (194, 194, 194, 255)
GRAY_DARK = (182, 182, 182, 255)
TEAL = (50, 146, 151, 255)
TEAL_LIGHT = (99, 179, 183, 255)
TEAL_DARK = (16, 49, 51, 255)
PAPER = (254, 254, 254, 255)

STELLA_SKIN = {
    (223, 169, 154, 255),
    (207, 137, 115, 255),
    (170, 126, 114, 255),
    (196, 148, 136, 255),
    (170, 96, 67, 255),
}
STELLA_TEAL = {TEAL, TEAL_LIGHT, TEAL_DARK, (28, 104, 55, 255), (16, 77, 38, 255)}
STELLA_GRAY = {GRAY_LIGHT, GRAY, GRAY_DARK, OUTLINE, OUTLINE_DEEP, (40, 40, 40, 255)}
STELLA_HAIR = {
    (91, 38, 7, 255),
    (224, 119, 54, 255),
    (200, 91, 41, 255),
    (190, 84, 41, 255),
    (102, 60, 47, 255),
    (102, 46, 14, 255),
    (157, 62, 30, 255),
    (170, 71, 36, 255),
    (69, 35, 26, 255),
}

# Native char_0 skin colors.  These pixels retain their semantic role when the
# official arms and hands move between typing and reading poses.
TEMPLATE_SKIN = {
    (233, 163, 132, 255),
    (251, 191, 151, 255),
    (197, 137, 110, 255),
    (226, 152, 120, 255),
    (255, 216, 178, 255),
    (132, 82, 58, 255),
}
TEMPLATE_DARK = {
    (50, 25, 29, 255),
    (52, 31, 32, 255),
    (7, 28, 46, 255),
    (0, 0, 0, 255),
    (4, 6, 5, 255),
    (57, 22, 36, 255),
    (26, 26, 26, 255),
}


def approved_bases() -> dict[str, Image.Image]:
    """Losslessly crop the approved cardinal rotations to the app frame."""

    specs = {
        "baixo": "Stella(Camada 1) _0001.png",
        "cima": "Stella(Camada 1) _0005.png",
        "direita": "Stella(Camada 1) _0003.png",
    }
    bases: dict[str, Image.Image] = {}
    for direction, name in specs.items():
        source = Image.open(SOURCE / name).convert("RGBA")
        if source.size != (32, 32):
            raise ValueError(f"{name}: expected 32x32, got {source.size}")
        bbox = source.getchannel("A").getbbox()
        if bbox != (9, 2, 23, 30):
            raise ValueError(f"{name}: approved occupancy changed: {bbox}")
        bases[direction] = source.crop((8, 0, 24, 32))
    return bases


def template_frames() -> dict[str, list[Image.Image]]:
    sheet = Image.open(TEMPLATE_PATH).convert("RGBA")
    if sheet.size != SHEET_SIZE:
        raise ValueError(f"char_0 has unexpected size {sheet.size}")
    return {
        direction: [
            sheet.crop((column * 16, row * 32, (column + 1) * 16, (row + 1) * 32))
            for column in range(7)
        ]
        for row, direction in enumerate(DIRECTIONS)
    }


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty image")
    return bbox


def nearest_body_color(
    base: Image.Image,
    x: int,
    target_y: int,
    *,
    allow_skin: bool,
) -> tuple[int, int, int, int]:
    """Sample Stella's approved body pattern without crossing semantic regions."""

    candidates: list[tuple[int, int, tuple[int, int, int, int]]] = []
    for radius in range(0, 9):
        for sy in range(max(17, target_y - radius), min(30, target_y + radius + 1)):
            for sx in range(max(0, x - radius), min(16, x + radius + 1)):
                if abs(sx - x) + abs(sy - target_y) != radius:
                    continue
                color = base.getpixel((sx, sy))
                if color[3] == 0:
                    continue
                if not allow_skin and color in STELLA_SKIN:
                    continue
                # Long hair overlaps the shoulders in the approved profile.
                # It must never become a sleeve, hand, neck, or torso color.
                if color in STELLA_HAIR:
                    continue
                candidates.append((abs(sx - x), abs(sy - target_y), color))
        if candidates:
            candidates.sort(key=lambda item: (item[0] + item[1], item[1], item[0]))
            return candidates[0][2]
    return TEAL_DARK


def dark_version(sample: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    if sample in STELLA_SKIN:
        return SKIN_SHADOW
    if sample in STELLA_TEAL:
        return TEAL_DARK
    return OUTLINE


def map_skin(template_color: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    brightness = sum(template_color[:3])
    if brightness >= 610:
        return SKIN
    if brightness <= 350:
        return SKIN_SHADOW
    return SKIN


def body_mapping(direction: str, column: int) -> tuple[int, int, int]:
    """Return body start, source body start, and source body end."""

    if column < 3:
        shift = 1 if column == 1 else 0
        return 17 + shift, 17, 29
    if direction == "baixo":
        return 17, 17, 29
    if direction == "cima":
        # Native rear seated frames end at the torso; source legs are excluded.
        return 17, 17, 24
    return 16, 17, 29


def head_shift(direction: str, column: int) -> int:
    if column < 3:
        return 1 if column == 1 else 0
    if direction == "baixo":
        # A two-pixel drop keeps Stella's 28px total front height rather than
        # shrinking her to the native template's 26px seated occupancy.
        return 1 if column == 6 else 2
    if direction == "cima":
        return 2 if column == 6 else 1
    return 4 if column == 6 else 3


def transfer_scaffold(
    template: Image.Image,
    base: Image.Image,
    direction: str,
    column: int,
) -> Image.Image:
    """Repaint one official topology with Stella's approved semantic palette."""

    result = Image.new("RGBA", FRAME_SIZE, TRANSPARENT)
    body_start, source_start, source_end = body_mapping(direction, column)
    template_bbox = alpha_bbox(template)
    template_end = template_bbox[3] - 1
    template_span = max(1, template_end - body_start)
    source_span = max(1, source_end - source_start)

    for y in range(body_start, 32):
        for x in range(16):
            template_color = template.getpixel((x, y))
            if template_color[3] == 0:
                continue
            ratio = min(1.0, max(0.0, (y - body_start) / template_span))
            source_y = round(source_start + ratio * source_span)
            if template_color in TEMPLATE_SKIN:
                color = map_skin(template_color)
            else:
                sample = nearest_body_color(base, x, source_y, allow_skin=False)
                color = dark_version(sample) if template_color in TEMPLATE_DARK else sample
            result.putpixel((x, y), color)

    # The approved directional head/hair/face is copied byte-for-byte.  Only
    # its vertical anchor follows the official walk/seated grammar.
    head = base.crop((0, 0, 16, 17))
    result.alpha_composite(head, (0, head_shift(direction, column)))
    return result


def restore_approved_identity(
    image: Image.Image,
    base: Image.Image,
    direction: str,
    column: int,
) -> None:
    """Protect finished neutral pixels from unnecessary pose recoloring."""

    if column < 3:
        # The exported cardinal rotation already contains the final hair,
        # face, neck, blouse, jacket, arms, and hands.  Walking changes only
        # the lower-body scaffold; rows above the legs remain byte-for-byte.
        image.paste(base.crop((0, 0, 16, 24)), (0, 0))
        return

    # Work/read poses require new arms and lower-body occlusion, but the
    # central neckline and blouse are identity, not articulation.  Copy their
    # approved pixels without replacing the official side-arm topology.
    shift = head_shift(direction, column)
    center = base.crop((3, 16, 13, 24))
    image.alpha_composite(center, (3, 16 + shift))


def transfer_profile_arm_topology(image: Image.Image, column: int) -> None:
    """Transfer char_4's explicit profile-arm articulation onto Stella.

    char_0 remains the full-pose scaffold.  Samira explicitly selected native
    char_4 as the secondary anatomy reference because its side row makes the
    opposing walk arms and 90-degree work/read elbows unambiguous.
    """

    if column == 1:
        # Passing pose is the already-approved straight profile export.
        return

    reference_sheet = Image.open(SECONDARY_ARMS_PATH).convert("RGBA")
    if reference_sheet.size != SHEET_SIZE:
        raise ValueError(f"char_4 has unexpected size {reference_sheet.size}")
    reference = reference_sheet.crop(
        (column * 16, 64, (column + 1) * 16, 96)
    )

    if column == 2:
        # The approved neutral profile has a hanging hand on the rear/left
        # edge.  In contact B that arm swings forward, so the old skin pixels
        # become jacket mass before the new front hand is transferred.
        for x, y, color in (
            (6, 22, GRAY),
            (7, 22, GRAY_LIGHT),
            (6, 23, GRAY_DARK),
            (7, 23, GRAY),
        ):
            image.putpixel((x, y), color)
    elif column >= 3:
        # Remove the old downward hand.  Stella wears full-length trousers, so
        # no valid lower-body skin exists in this profile area.
        for y in range(25, 28):
            for x in range(5, 9):
                if image.getpixel((x, y)) in STELLA_SKIN:
                    image.putpixel((x, y), TRANSPARENT)

    # Transfer only the front arm column: shoulder edge, sleeve, elbow and
    # 2x2 hand.  Copying farther left would overwrite Stella's approved torso.
    for y in range(20, 25):
        for x in range(10, 14):
            ref = reference.getpixel((x, y))
            if ref[3] == 0:
                image.putpixel((x, y), TRANSPARENT)
                continue
            current = image.getpixel((x, y))
            if ref in TEMPLATE_SKIN:
                color = map_skin(ref)
            elif x in (9, 10) and current in STELLA_TEAL:
                # Preserve the approved green blouse stripe through the torso.
                color = current
            elif ref in TEMPLATE_DARK or sum(ref[:3]) < 120:
                color = OUTLINE
            elif sum(ref[:3]) >= 600:
                color = GRAY_LIGHT
            elif sum(ref[:3]) >= 300:
                color = GRAY
            else:
                color = GRAY_DARK
            image.putpixel((x, y), color)


def add_reading_document(image: Image.Image, direction: str, variant: int) -> None:
    """Reassert the official document projection with Stella-approved colors."""

    draw = ImageDraw.Draw(image)
    if direction == "baixo":
        y0 = 19 + variant
        draw.rectangle((4, y0, 11, y0 + 6), fill=OUTLINE)
        draw.rectangle((5, y0 + 1, 10, y0 + 5), fill=PAPER)
        draw.line((6, y0 + 2, 9, y0 + 2), fill=GRAY_DARK)
        draw.line((6, y0 + 4, 9, y0 + 4), fill=GRAY_DARK)
        draw.rectangle((3, y0 + 2, 4, y0 + 3), fill=SKIN)
        draw.rectangle((11, y0 + 3, 12, y0 + 4), fill=SKIN_SHADOW)
    elif direction == "direita":
        # The profile view shows only the three-pixel diagonal edge, never the
        # full front rectangle.
        y = 19 + variant
        draw.point((12, y + 2), fill=PAPER)
        draw.point((13, y + 1), fill=PAPER)
        draw.point((14, y), fill=PAPER)


def build_frames() -> tuple[dict[str, list[Image.Image]], dict[str, list[Image.Image]]]:
    bases = approved_bases()
    templates = template_frames()
    rows: dict[str, list[Image.Image]] = {}
    for direction in DIRECTIONS:
        frames: list[Image.Image] = []
        for column, template in enumerate(templates[direction]):
            frame = transfer_scaffold(template, bases[direction], direction, column)
            restore_approved_identity(frame, bases[direction], direction, column)
            if direction == "direita":
                transfer_profile_arm_topology(frame, column)
            if column >= 5:
                add_reading_document(frame, direction, column - 5)
            frames.append(frame)
        rows[direction] = frames
    return rows, templates


def pack_sheet(rows: dict[str, list[Image.Image]]) -> Image.Image:
    sheet = Image.new("RGBA", SHEET_SIZE, TRANSPARENT)
    for row, direction in enumerate(DIRECTIONS):
        for column, frame in enumerate(rows[direction]):
            sheet.alpha_composite(frame, (column * 16, row * 32))
    return sheet


def unpack_sheet(sheet: Image.Image) -> dict[str, list[Image.Image]]:
    return {
        direction: [
            sheet.crop((column * 16, row * 32, (column + 1) * 16, (row + 1) * 32))
            for column in range(7)
        ]
        for row, direction in enumerate(DIRECTIONS)
    }


def apply_learned_corrections(sheet: Image.Image) -> Image.Image:
    """Apply approved Stella-only pixel deltas with stale-base protection."""

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


def render_preview(rows: dict[str, list[Image.Image]], zoom: int = 10) -> Image.Image:
    preview = Image.new("RGBA", (112 * zoom, 96 * zoom), (24, 24, 28, 255))
    for row, direction in enumerate(DIRECTIONS):
        for column, frame in enumerate(rows[direction]):
            enlarged = frame.resize((16 * zoom, 32 * zoom), Image.Resampling.NEAREST)
            preview.alpha_composite(enlarged, (column * 16 * zoom, row * 32 * zoom))
    return preview


def render_comparison(
    rows: dict[str, list[Image.Image]],
    templates: dict[str, list[Image.Image]],
    zoom: int = 6,
) -> Image.Image:
    gap = 16 * zoom
    comparison = Image.new("RGBA", (112 * zoom * 2 + gap, 96 * zoom), (24, 24, 28, 255))
    for group, frames_by_direction in enumerate((rows, templates)):
        ox = group * (112 * zoom + gap)
        for row, direction in enumerate(DIRECTIONS):
            for column, frame in enumerate(frames_by_direction[direction]):
                enlarged = frame.resize((16 * zoom, 32 * zoom), Image.Resampling.NEAREST)
                comparison.alpha_composite(enlarged, (ox + column * 16 * zoom, row * 32 * zoom))
    return comparison


def validate(rows: dict[str, list[Image.Image]], sheet: Image.Image) -> None:
    approved_palette: set[tuple[int, int, int, int]] = {TRANSPARENT}
    bases = approved_bases()
    for base in bases.values():
        approved_palette.update(
            color for color, count in Counter(base.get_flattened_data()).items() if count
        )

    for direction, frames in rows.items():
        if len(frames) != 7:
            raise ValueError(f"{direction}: expected 7 frames")
        for frame in frames:
            if frame.size != FRAME_SIZE or frame.mode != "RGBA":
                raise ValueError(f"{direction}: invalid frame {frame.size}/{frame.mode}")
            extra = set(frame.get_flattened_data()) - approved_palette
            if extra:
                raise ValueError(f"{direction}: colors outside approved palette: {sorted(extra)}")
        for first, second, label in (
            (0, 2, "walk contacts"),
            (3, 4, "typing"),
            (5, 6, "reading"),
        ):
            if frames[first].tobytes() == frames[second].tobytes():
                raise ValueError(f"{direction}: repeated {label} frames")
        if frames[3].tobytes() == frames[5].tobytes():
            raise ValueError(f"{direction}: typing and reading are identical")

        approved_upper = bases[direction].crop((0, 0, 16, 24)).tobytes()
        for column in range(3):
            if direction == "direita" and column in (0, 2):
                # User-approved exception: the two contact frames articulate
                # the profile arms.  Every pixel outside that arm box remains
                # protected against identity drift.
                for y in range(24):
                    for x in range(16):
                        if 4 <= x < 14 and 20 <= y < 24:
                            continue
                        if frames[column].getpixel((x, y)) != bases[direction].getpixel((x, y)):
                            raise ValueError(
                                f"{direction}/{POSES[column]} changed protected identity pixel {(x, y)}"
                            )
            else:
                actual_upper = frames[column].crop((0, 0, 16, 24)).tobytes()
                if actual_upper != approved_upper:
                    raise ValueError(
                        f"{direction}/{POSES[column]} changed approved standing identity pixels"
                    )

    for frame in rows["cima"][3:]:
        if any(frame.getpixel((x, y))[3] for y in range(26, 32) for x in range(16)):
            raise ValueError("rear seated frame contains lower-leg pixels")

    repacked = pack_sheet(unpack_sheet(sheet))
    if repacked.tobytes() != sheet.tobytes():
        raise ValueError("packed sheet does not match its unpacked frames")


def main() -> None:
    rows, templates = build_frames()
    sheet = pack_sheet(rows)
    validate(rows, sheet)
    sheet = apply_learned_corrections(sheet)
    rows = unpack_sheet(sheet)
    validate(rows, sheet)
    OUTPUT.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, object] = {
        "_source": "Approved Stella PixelLab rotations in assets-source/characters/Stella Sales",
        "_primary_template": "webview-ui/public/assets/characters/char_0.png",
        "_secondary_exceptions": [
            "Native char_4 profile arms define opposing walk swings and 90-degree work/read elbows, explicitly selected by the user."
        ],
        "_character_corrections": "stella-learned-corrections.json",
        "_order": list(POSES),
        "_template_exceptions": [
            "Approved standing hair, face, neck, blouse, jacket, arms, and hands remain byte-for-byte above the leg line.",
            "Seated frames retain the approved directional head plus the central neckline and green blouse pixels.",
            "Front seated head anchor preserves Stella's measured 28px total opaque height.",
            "All colors come from Stella's approved export; reading paper uses its approved white/gray colors.",
        ],
    }
    for direction in DIRECTIONS:
        names: list[str] = []
        for pose, frame in zip(POSES, rows[direction], strict=True):
            name = f"{direction}-{pose}.png"
            frame.save(OUTPUT / name, optimize=False)
            names.append(name)
        manifest[direction] = names

    (OUTPUT / "folha.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    preview = render_preview(rows)
    preview.save(OUTPUT / "_preview.png", optimize=False)
    preview.crop((0, 64 * 10, 112 * 10, 96 * 10)).save(
        OUTPUT / "_preview-profile.png", optimize=False
    )
    render_comparison(rows, templates).save(OUTPUT / "_comparison-char_0.png", optimize=False)
    sheet.save(SHEET_PATH, optimize=False)
    print(f"21 frames: {OUTPUT}")
    print(f"sheet: {SHEET_PATH}")


if __name__ == "__main__":
    main()
