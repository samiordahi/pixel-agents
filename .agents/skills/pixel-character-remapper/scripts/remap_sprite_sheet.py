#!/usr/bin/env python3
"""Deterministic palette remapping and geometry validation for pixel sprite sheets."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from PIL import Image


def parse_hex(value: str) -> tuple[int, int, int]:
    value = value.strip().lstrip("#")
    if len(value) != 6:
        raise ValueError(f"Expected #RRGGBB, got {value!r}")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def decode_map(value: object) -> dict[tuple[int, int, int], tuple[int, int, int]]:
    if not isinstance(value, dict):
        raise ValueError("A color map must be a JSON object")
    return {parse_hex(source): parse_hex(target) for source, target in value.items()}


def image(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def report(path: Path) -> None:
    source = image(path)
    colors = Counter((r, g, b) for r, g, b, alpha in source.getdata() if alpha)
    print(f"{path}\nsize={source.width}x{source.height} bbox={source.getchannel('A').getbbox()} colors={len(colors)}")
    for color, count in colors.most_common():
        print("#" + "".join(f"{channel:02X}" for channel in color), count)


def apply(args: argparse.Namespace) -> None:
    template = image(args.template)
    profile = json.loads(args.mapping.read_text(encoding="utf-8"))
    if not isinstance(profile, dict) or not profile:
        raise ValueError("Mapping must be a non-empty JSON object")
    structured = "global" in profile or "regions" in profile
    global_map = decode_map(profile.get("global", {})) if structured else decode_map(profile)
    regions = []
    for raw in profile.get("regions", []) if structured else []:
        if not isinstance(raw, dict) or "map" not in raw:
            raise ValueError("Every region needs a map object")
        rect = raw.get("local_rect", [0, 0, args.frame_width, args.frame_height])
        if not isinstance(rect, list) or len(rect) != 4:
            raise ValueError("local_rect must be [left, top, right, bottom]")
        regions.append(
            {
                "rect": tuple(int(part) for part in rect),
                "columns": set(raw.get("frame_columns", range(template.width // args.frame_width))),
                "rows": set(raw.get("frame_rows", range(template.height // args.frame_height))),
                "map": decode_map(raw["map"]),
            }
        )
    output_pixels = []
    changed = 0
    for index, (r, g, b, alpha) in enumerate(template.getdata()):
        x, y = index % template.width, index // template.width
        frame_column, local_x = divmod(x, args.frame_width)
        frame_row, local_y = divmod(y, args.frame_height)
        source_color = (r, g, b)
        target = None
        for region in regions:
            left, top, right, bottom = region["rect"]
            if (
                frame_column in region["columns"]
                and frame_row in region["rows"]
                and left <= local_x < right
                and top <= local_y < bottom
            ):
                target = region["map"].get(source_color)
                if target is not None:
                    break
        target = target or global_map.get(source_color)
        if target:
            output_pixels.append((*target, alpha))
            changed += 1
        else:
            output_pixels.append((r, g, b, alpha))
    result = Image.new("RGBA", template.size)
    result.putdata(output_pixels)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output, "PNG", optimize=False)
    print(
        f"wrote={args.output} changed_pixels={changed} global_colors={len(global_map)} regions={len(regions)}"
    )


def normalized_reference(source: Image.Image, width: int, height: int) -> Image.Image:
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Reference image has no occupied pixels")
    center_x = (bbox[0] + bbox[2]) / 2
    left = round(center_x - width / 2)
    top = bbox[3] - height
    left = max(0, min(source.width - width, left))
    top = max(0, min(source.height - height, top))
    return source.crop((left, top, left + width, top + height))


def compose(args: argparse.Namespace) -> None:
    base = image(args.base)
    if base.width % args.frame_width or base.height % args.frame_height:
        raise ValueError("Base dimensions are not divisible by the frame size")
    references = [
        normalized_reference(image(args.front), args.frame_width, args.frame_height),
        normalized_reference(image(args.back), args.frame_width, args.frame_height),
        normalized_reference(image(args.right), args.frame_width, args.frame_height),
    ]
    if base.height // args.frame_height != len(references):
        raise ValueError("Base sheet must have exactly three direction rows")

    result = base.copy()
    paper_colors = {
        parse_hex("#FFFFFF"),
        parse_hex("#9F9F9F"),
        parse_hex("#595959"),
        parse_hex("#E1E3E9"),
        parse_hex("#A2AAAF"),
    }
    columns = base.width // args.frame_width
    replace_bottom = min(args.identity_bottom, args.frame_height)
    for row, reference in enumerate(references):
        for column in range(columns):
            left, top = column * args.frame_width, row * args.frame_height
            frame = base.crop((left, top, left + args.frame_width, top + args.frame_height))
            composed = frame.copy()

            # Replace the complete head/torso rectangle, including transparent
            # pixels, so the reference may define a helmet or other silhouette.
            for y in range(replace_bottom):
                for x in range(args.frame_width):
                    composed.putpixel((x, y), reference.getpixel((x, y)))

            # Keep the proven limb choreography from the animation rig while
            # retaining the reference's central vest/torso artwork.
            for y in range(args.motion_top, min(args.motion_bottom, args.frame_height)):
                for x in range(args.frame_width):
                    if x <= args.motion_edge or x >= args.frame_width - 1 - args.motion_edge:
                        composed.putpixel((x, y), frame.getpixel((x, y)))

            # Reading frames carry paper/book pixels in front of the torso.
            if column in (5, 6):
                for y in range(args.prop_top, args.frame_height):
                    for x in range(args.frame_width):
                        pixel = frame.getpixel((x, y))
                        if pixel[3] and pixel[:3] in paper_colors:
                            composed.putpixel((x, y), pixel)

            result.paste(composed, (left, top))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output, "PNG", optimize=False)
    print(
        f"wrote={args.output} views=front,back,right frames={columns * len(references)} "
        f"identity_bottom={replace_bottom}"
    )
def learn(args: argparse.Namespace) -> None:
    before, after = image(args.before), image(args.after)
    if before.size != after.size:
        raise ValueError(f"Image sizes differ: {before.size} != {after.size}")
    changes = []
    for index, (source, target) in enumerate(zip(before.getdata(), after.getdata(), strict=True)):
        if source == target or not (source[3] or target[3]):
            continue
        changes.append(
            {
                "x": index % before.width,
                "y": index // before.width,
                "from": list(source),
                "to": list(target),
            }
        )
    payload = {"format": 1, "size": list(before.size), "changes": changes}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote={args.output} learned_changes={len(changes)}")


def apply_patch(args: argparse.Namespace) -> None:
    source = image(args.base)
    payload = json.loads(args.corrections.read_text(encoding="utf-8"))
    if payload.get("format") != 1 or payload.get("size") != list(source.size):
        raise ValueError("Correction patch format or image size does not match the base")
    mismatches = []
    for change in payload.get("changes", []):
        x, y = int(change["x"]), int(change["y"])
        expected = tuple(change["from"])
        if source.getpixel((x, y)) != expected:
            mismatches.append((x, y))
            continue
        source.putpixel((x, y), tuple(change["to"]))
    if mismatches:
        raise ValueError(f"Base does not match the learned patch at {len(mismatches)} pixels")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    source.save(args.output, "PNG", optimize=False)
    print(f"wrote={args.output} applied_changes={len(payload.get('changes', []))}")
def frame_metrics(source: Image.Image, width: int, height: int):
    if source.width % width or source.height % height:
        raise ValueError("Image dimensions are not divisible by the frame size")
    values = []
    for top in range(0, source.height, height):
        for left in range(0, source.width, width):
            frame = source.crop((left, top, left + width, top + height))
            bbox = frame.getchannel("A").getbbox()
            values.append((bbox, None if bbox is None else bbox[3] - 1))
    return values


def validate(args: argparse.Namespace) -> None:
    template, candidate = image(args.template), image(args.candidate)
    errors = []
    if template.size != candidate.size:
        errors.append(f"size mismatch: {candidate.size} != {template.size}")
    if not errors:
        expected = frame_metrics(template, args.frame_width, args.frame_height)
        actual = frame_metrics(candidate, args.frame_width, args.frame_height)
        for index, (left, right) in enumerate(zip(expected, actual, strict=True)):
            if args.allow_silhouette_change:
                if left[1] != right[1]:
                    errors.append(f"frame {index}: foot anchor {right[1]} != {left[1]}")
            elif left != right:
                errors.append(f"frame {index}: metrics {right} != {left}")
        if args.strict_mask:
            expected_alpha = list(template.getchannel("A").getdata())
            actual_alpha = list(candidate.getchannel("A").getdata())
            changed = sum(a != b for a, b in zip(expected_alpha, actual_alpha, strict=True))
            if changed:
                errors.append(f"strict alpha mask differs at {changed} pixels")
    if errors:
        raise SystemExit("validation failed:\n- " + "\n- ".join(errors))
    frames = (candidate.width // args.frame_width) * (candidate.height // args.frame_height)
    print(f"valid size={candidate.width}x{candidate.height} frames={frames} strict_mask={args.strict_mask}")


def build_parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    command = commands.add_parser("report")
    command.add_argument("--image", type=Path, required=True)
    command = commands.add_parser("apply")
    command.add_argument("--template", type=Path, required=True)
    command.add_argument("--mapping", type=Path, required=True)
    command.add_argument("--output", type=Path, required=True)
    command.add_argument("--frame-width", type=int, default=16)
    command.add_argument("--frame-height", type=int, default=32)
    command = commands.add_parser("compose")
    command.add_argument("--base", type=Path, required=True)
    command.add_argument("--front", type=Path, required=True)
    command.add_argument("--back", type=Path, required=True)
    command.add_argument("--right", type=Path, required=True)
    command.add_argument("--output", type=Path, required=True)
    command.add_argument("--frame-width", type=int, default=16)
    command.add_argument("--frame-height", type=int, default=32)
    command.add_argument("--identity-bottom", type=int, default=24)
    command.add_argument("--motion-top", type=int, default=16)
    command.add_argument("--motion-bottom", type=int, default=26)
    command.add_argument("--motion-edge", type=int, default=3)
    command.add_argument("--prop-top", type=int, default=14)
    command = commands.add_parser("learn")
    command.add_argument("--before", type=Path, required=True)
    command.add_argument("--after", type=Path, required=True)
    command.add_argument("--output", type=Path, required=True)
    command = commands.add_parser("patch")
    command.add_argument("--base", type=Path, required=True)
    command.add_argument("--corrections", type=Path, required=True)
    command.add_argument("--output", type=Path, required=True)
    command = commands.add_parser("validate")
    command.add_argument("--template", type=Path, required=True)
    command.add_argument("--candidate", type=Path, required=True)
    command.add_argument("--frame-width", type=int, default=16)
    command.add_argument("--frame-height", type=int, default=32)
    command.add_argument("--strict-mask", action="store_true")
    command.add_argument("--allow-silhouette-change", action="store_true")
    return root


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "report":
        report(args.image)
    elif args.command == "apply":
        apply(args)
    elif args.command == "compose":
        compose(args)
    elif args.command == "learn":
        learn(args)
    elif args.command == "patch":
        apply_patch(args)
    else:
        validate(args)


if __name__ == "__main__":
    main()

