import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  BOTTOM_STYLES,
  CHARACTER_FRAME_HEIGHT,
  CHARACTER_FRAME_WIDTH,
  CHARACTER_LAYER_ORDER,
  composeCharacterLayers,
  createCharacterFrameLayers,
  createCharacterSheet,
  DEFAULT_CHARACTER_CUSTOMIZATION,
  FACE_ACCESSORIES,
  getPreviewFrame,
  HAIR_STYLES,
  HATS,
  HELD_ITEMS,
  OUTFIT_STYLES,
  PRESENTATIONS,
  SHOE_STYLES,
} from '../src/components/characterStudioEngine.ts';

test('creates the canonical 3 direction × 7 frame character sheet', () => {
  const rows = createCharacterSheet(DEFAULT_CHARACTER_CUSTOMIZATION);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.length, 7);
    for (const sprite of row) {
      assert.equal(sprite.length, CHARACTER_FRAME_HEIGHT);
      assert.ok(sprite.every((pixels) => pixels.length === CHARACTER_FRAME_WIDTH));
    }
  }
});

test('every customization option produces a visible game-ready sprite', () => {
  const combinations = [
    ...PRESENTATIONS.map((presentation) => ({ presentation })),
    ...HAIR_STYLES.map((hairStyle) => ({ hairStyle })),
    ...OUTFIT_STYLES.map((outfitStyle) => ({ outfitStyle })),
    ...BOTTOM_STYLES.map((bottomStyle) => ({ bottomStyle })),
    ...SHOE_STYLES.map((shoeStyle) => ({ shoeStyle })),
    ...FACE_ACCESSORIES.map((faceAccessory) => ({ faceAccessory })),
    ...HATS.map((hat) => ({ hat })),
    ...HELD_ITEMS.map((heldItem) => ({ heldItem })),
  ];
  for (const partial of combinations) {
    const rows = createCharacterSheet({ ...DEFAULT_CHARACTER_CUSTOMIZATION, ...partial });
    const visiblePixels = rows.flat(2).filter(Boolean).length;
    assert.ok(visiblePixels > 100, `${JSON.stringify(partial)} should remain visible`);
  }
});

test('every semantic layer uses the canonical frame and composes without offsets', () => {
  for (const direction of ['down', 'up', 'right'] as const) {
    for (let frame = 0; frame < 7; frame += 1) {
      const layers = createCharacterFrameLayers(DEFAULT_CHARACTER_CUSTOMIZATION, direction, frame);
      assert.deepEqual(Object.keys(layers), [...CHARACTER_LAYER_ORDER]);
      for (const layer of Object.values(layers)) {
        assert.equal(layer.length, CHARACTER_FRAME_HEIGHT);
        assert.ok(layer.every((row) => row.length === CHARACTER_FRAME_WIDTH));
      }
      assert.deepEqual(
        composeCharacterLayers(layers),
        createCharacterSheet(DEFAULT_CHARACTER_CUSTOMIZATION)[
          direction === 'down' ? 0 : direction === 'up' ? 1 : 2
        ][frame],
      );
    }
  }
});

test('held items stay visible in every exported direction and activity frame', () => {
  for (const heldItem of HELD_ITEMS.filter((item) => item !== 'none')) {
    const rows = createCharacterSheet({ ...DEFAULT_CHARACTER_CUSTOMIZATION, heldItem });
    for (const row of rows) {
      for (const sprite of row) {
        assert.ok(sprite.flat().filter(Boolean).length > 100, `${heldItem} should stay attached`);
      }
    }
  }
});

test('preview activities resolve to the expected authored frame groups', () => {
  const rows = createCharacterSheet(DEFAULT_CHARACTER_CUSTOMIZATION);
  assert.equal(getPreviewFrame(rows, 'walk', 'down', 0), rows[0][0]);
  assert.equal(getPreviewFrame(rows, 'type', 'up', 1), rows[1][4]);
  assert.equal(getPreviewFrame(rows, 'read', 'right', 0), rows[2][5]);
  assert.deepEqual(
    getPreviewFrame(rows, 'walk', 'left', 0),
    rows[2][0].map((row) => [...row].reverse()),
  );
});
