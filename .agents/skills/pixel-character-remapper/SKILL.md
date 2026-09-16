---
name: pixel-character-remapper
description: Remap a character reference onto an existing Pixel Agents sprite sheet while preserving the template's exact frame geometry, animation, alpha mask, and pixel-art quality. Use when the user supplies a proven character sheet plus one or more character references and wants a new game-ready char_N.png without drawing every pose manually. Do not use for layered character creators or new animation rigs.
---

# Pixel Character Remapper

Treat the supplied sprite sheet as an immutable timing and anchor rig. Transfer identity without moving frame boundaries or foot anchors. Preserve its silhouette by default, but use reference-shape mode when the supplied character has identity-defining geometry such as a helmet, hood, ears, armor, or a distinctive eye shape.

## Required outcome

- Preserve the template dimensions, frame grid, alpha values, occupied pixels, feet anchors, and pose silhouettes exactly by default.
- Change only identity-bearing colors: hair/headwear, skin, eyes, top, accent, bottoms, and shoes.
- Produce a new PNG non-destructively. Never overwrite a template or reference unless the user explicitly requests replacement.
- Keep nearest-neighbor pixel art: no antialiasing, blur, gradients, resampling, or subpixel placement.

## Workflow

1. Inspect the template and every reference image. Identify the character's semantic palette and the template colors serving the same roles.
2. Run `scripts/remap_sprite_sheet.py report` on the template and references when palette counts or transparency are unclear.
3. Save an explicit JSON color profile. Put shared replacements in `global`. When one template color serves different semantic roles, add a constrained `regions` rule by frame column/row and local frame rectangle. Leave structural black outlines unchanged unless the reference clearly uses a different outline family.
4. Run `apply` to recolor the full sheet. Palette transfer is the default because it gives every frame the same proven anatomy and motion.
5. Run `validate --strict-mask`. A strict-mask failure means the result is not ready.
6. Inspect the complete sheet and enlarged representative frames: front, back, side, walking, typing, and reading.
7. Only if palette transfer cannot express a signature feature, add a constrained overlay for that feature. It must remain inside the template's existing occupied mask unless the user explicitly accepts a silhouette change.

## Commands

Use the bundled Python that provides Pillow when available.

```powershell
python scripts/remap_sprite_sheet.py report --image <image.png>
python scripts/remap_sprite_sheet.py apply --template <template.png> --mapping <map.json> --output <new-sheet.png>
python scripts/remap_sprite_sheet.py compose --base <recolored-sheet.png> --front <front.png> --back <back.png> --right <right.png> --output <reference-shaped-sheet.png>
python scripts/remap_sprite_sheet.py learn --before <automatic.png> --after <manual-final.png> --output <learned-corrections.json>
python scripts/remap_sprite_sheet.py patch --base <automatic.png> --corrections <learned-corrections.json> --output <polished.png>
python scripts/remap_sprite_sheet.py validate --template <template.png> --candidate <new-sheet.png> --frame-width 16 --frame-height 32 --strict-mask
```

The simplest mapping JSON is a plain object of source hex colors to destination hex colors. Use the structured form when one source color must change differently in separate poses or body regions:

```json
{
  "global": { "#8F6439": "#DD7421" },
  "regions": [
    {
      "name": "dark uniform torso outside reading poses",
      "frame_columns": [0, 1, 2, 3, 4],
      "frame_rows": [0, 1, 2],
      "local_rect": [0, 14, 16, 25],
      "map": { "#FFFFFF": "#4C4858" }
    }
  ]
}
```

Regional rules take precedence over `global`. Coordinates in `local_rect` are relative to each `16×32` frame and use `[left, top, right, bottom]` with right/bottom excluded.

## Reference-shape mode

Use `compose` after palette remapping when color alone cannot represent the character. It normalizes the supplied front, back, and right views into the `16×32` frame grid, copies their head and torso pixels into every matching direction, retains the template's proven limb choreography, and preserves foreground paper/book pixels in reading frames. Pixel Agents mirrors the right-facing row at runtime for left-facing movement; inspect the supplied left view as a fidelity check even though it is not stored as a fourth sheet row.

Validate this mode with `--allow-silhouette-change`. This permits the reference's helmet or body outline while still rejecting size, frame-count, and foot-anchor changes. Never use `--strict-mask` for an intentional reference-shaped silhouette.

## Manual-polish learning loop

When the user manually perfects an automatic sheet, treat that edit as training data rather than a one-off replacement.

1. Preserve the automatic pre-edit sheet.
2. Run `learn` to record every visible pixel addition, removal, and recoloring with a guarded source value.
3. Store the learned correction JSON beside that character's references.
4. Regenerate from the references, run `patch`, and verify that the patched result has zero visible differences from the user's approved sheet.
5. Apply the same review principles to future characters before delivery; character-specific coordinate patches must not be reused on a different rig or identity.

### Learned quality rules

- Contours follow material semantics: outline skin with a darker skin shade, cloth with a darker cloth shade, and helmet/hair with its own darker shade. Do not leave generic pure-black template outlines unless the reference uses them.
- After motion pixels are borrowed from the template, audit every frame for forbidden residual template colors, especially isolated white, gray, or black pixels in clothing and limbs.
- Preserve props by connected shape and spatial region, not by color alone. Eye white and a white letter/book are separate semantic components; prop restoration must never overwrite facial pixels.
- Inspect extremities in every side-facing animation. Each visible arm must end in a consistent skin-colored hand, including walking, typing, and reading frames.
- Compare all 21 frames at high nearest-neighbor zoom. Treat isolated one-pixel inconsistencies as failures, not harmless noise.

## Pixel Agents integration

- The canonical format is `112×96`: seven `16×32` frames across and three directions down, up, right.
- Name external characters `char_N.png`. Choose the next available palette index; do not renumber existing characters.
- Store the reusable mapping/profile beside the character references, not inside the generated sheet.
- After adding or changing a sheet in this project, rebuild the webview/CLI as needed and restart the standalone server from `D:\Documentos\Ordahi AIOS` on port `3100`, then confirm it loaded the new character count and is scanning the Ordahi AIOS project.

## Quality gate

Reject output when dimensions or frame count differ, the strict alpha mask differs, a foot anchor moves, antialiased colors appear, or adjacent frames use inconsistent mappings.
