import {
  CHARACTER_STUDIO_ACCENT_COLORS,
  CHARACTER_STUDIO_BODY_OUTLINE,
  CHARACTER_STUDIO_BOTTOM_COLORS,
  CHARACTER_STUDIO_COFFEE_STEAM_COLOR,
  CHARACTER_STUDIO_EYE_COLORS,
  CHARACTER_STUDIO_GLASSES_COLOR,
  CHARACTER_STUDIO_HAIR_COLORS,
  CHARACTER_STUDIO_LAPTOP_COLOR,
  CHARACTER_STUDIO_OUTFIT_COLORS,
  CHARACTER_STUDIO_PAPER_COLOR,
  CHARACTER_STUDIO_SHOE_COLORS,
  CHARACTER_STUDIO_SKIN_COLORS,
} from '../constants.js';
import type { SpriteData } from '../office/types.js';

export const CHARACTER_SHEET_WIDTH = 112;
export const CHARACTER_SHEET_HEIGHT = 96;
export const CHARACTER_FRAME_WIDTH = 16;
export const CHARACTER_FRAME_HEIGHT = 32;

export const PRESENTATIONS = ['masculine', 'feminine', 'neutral'] as const;
export const HAIR_STYLES = ['short', 'braids', 'cropped', 'bob', 'long', 'swept'] as const;
export const OUTFIT_STYLES = [
  'workwear',
  'overalls',
  'techwear',
  'lab-coat',
  'casual',
  'formal',
] as const;
export const BOTTOM_STYLES = ['pants', 'jeans', 'shorts', 'skirt', 'utility'] as const;
export const SHOE_STYLES = ['boots', 'sneakers', 'formal-shoes', 'sandals'] as const;
export const FACE_ACCESSORIES = ['none', 'glasses', 'sunglasses', 'earrings'] as const;
export const HATS = ['none', 'cap', 'beanie', 'hardhat', 'headphones'] as const;
export const HELD_ITEMS = ['none', 'coffee', 'book', 'laptop', 'clipboard'] as const;

export type CharacterPresentation = (typeof PRESENTATIONS)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type OutfitStyle = (typeof OUTFIT_STYLES)[number];
export type BottomStyle = (typeof BOTTOM_STYLES)[number];
export type ShoeStyle = (typeof SHOE_STYLES)[number];
export type FaceAccessory = (typeof FACE_ACCESSORIES)[number];
export type HatStyle = (typeof HATS)[number];
export type HeldItem = (typeof HELD_ITEMS)[number];
export type PreviewActivity = 'walk' | 'type' | 'read';
export type PreviewDirection = 'down' | 'up' | 'right' | 'left';
export type CharacterSheetRows = [SpriteData[], SpriteData[], SpriteData[]];

export const CHARACTER_LAYER_ORDER = [
  'hairBack',
  'body',
  'bottom',
  'shoes',
  'top',
  'hands',
  'hairFront',
  'face',
  'accessory',
  'heldItem',
] as const;
export type CharacterLayer = (typeof CHARACTER_LAYER_ORDER)[number];
export type CharacterFrameLayers = Record<CharacterLayer, SpriteData>;

export interface CharacterCustomization {
  presentation: CharacterPresentation;
  skinColor: string;
  eyeColor: string;
  hairStyle: HairStyle;
  hairColor: string;
  outfitStyle: OutfitStyle;
  outfitColor: string;
  accentColor: string;
  bottomStyle: BottomStyle;
  bottomColor: string;
  shoeStyle: ShoeStyle;
  shoeColor: string;
  faceAccessory: FaceAccessory;
  hat: HatStyle;
  heldItem: HeldItem;
}

export const DEFAULT_CHARACTER_CUSTOMIZATION: CharacterCustomization = {
  presentation: 'neutral',
  skinColor: CHARACTER_STUDIO_SKIN_COLORS[2],
  eyeColor: CHARACTER_STUDIO_EYE_COLORS[1],
  hairStyle: 'short',
  hairColor: CHARACTER_STUDIO_HAIR_COLORS[1],
  outfitStyle: 'workwear',
  outfitColor: CHARACTER_STUDIO_OUTFIT_COLORS[0],
  accentColor: CHARACTER_STUDIO_ACCENT_COLORS[0],
  bottomStyle: 'pants',
  bottomColor: CHARACTER_STUDIO_BOTTOM_COLORS[0],
  shoeStyle: 'boots',
  shoeColor: CHARACTER_STUDIO_SHOE_COLORS[0],
  faceAccessory: 'none',
  hat: 'none',
  heldItem: 'none',
};

interface RigPose {
  activity: PreviewActivity;
  phase: number;
  bob: number;
  leftStep: number;
  rightStep: number;
  armSwing: number;
}

const FRAME_POSES: readonly RigPose[] = [
  { activity: 'walk', phase: 0, bob: 0, leftStep: 1, rightStep: -1, armSwing: -1 },
  { activity: 'walk', phase: 1, bob: -1, leftStep: 0, rightStep: 0, armSwing: 0 },
  { activity: 'walk', phase: 2, bob: 0, leftStep: -1, rightStep: 1, armSwing: 1 },
  { activity: 'type', phase: 0, bob: 0, leftStep: 0, rightStep: 0, armSwing: 0 },
  { activity: 'type', phase: 1, bob: 0, leftStep: 0, rightStep: 0, armSwing: 0 },
  { activity: 'read', phase: 0, bob: 0, leftStep: 0, rightStep: 0, armSwing: 0 },
  { activity: 'read', phase: 1, bob: -1, leftStep: 0, rightStep: 0, armSwing: 0 },
];

const OUTLINE = CHARACTER_STUDIO_BODY_OUTLINE;
const GLASSES = CHARACTER_STUDIO_GLASSES_COLOR;
const LAPTOP = CHARACTER_STUDIO_LAPTOP_COLOR;
const PAPER = CHARACTER_STUDIO_PAPER_COLOR;

function emptySprite(): SpriteData {
  return Array.from({ length: CHARACTER_FRAME_HEIGHT }, () =>
    new Array<string>(CHARACTER_FRAME_WIDTH).fill(''),
  );
}

function parseHex(color: string): [number, number, number] {
  const value = color.replace('#', '').slice(0, 6).padEnd(6, '0');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function shade(color: string, amount: number): string {
  const [r, g, b] = parseHex(color);
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value * amount)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

class PixelLayer {
  readonly pixels = emptySprite();

  pixel(x: number, y: number, color: string): void {
    if (x < 0 || x >= CHARACTER_FRAME_WIDTH || y < 0 || y >= CHARACTER_FRAME_HEIGHT) return;
    this.pixels[y][x] = color;
  }

  rect(left: number, top: number, right: number, bottom: number, color: string): void {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) this.pixel(x, y, color);
    }
  }

  frame(left: number, top: number, right: number, bottom: number, color: string): void {
    for (let x = left; x <= right; x += 1) {
      this.pixel(x, top, color);
      this.pixel(x, bottom, color);
    }
    for (let y = top; y <= bottom; y += 1) {
      this.pixel(left, y, color);
      this.pixel(right, y, color);
    }
  }
}

function newLayers(): CharacterFrameLayers {
  return Object.fromEntries(
    CHARACTER_LAYER_ORDER.map((layer) => [layer, emptySprite()]),
  ) as CharacterFrameLayers;
}

function bodyBounds(presentation: CharacterPresentation, direction: PreviewDirection) {
  if (direction === 'right') return { left: 6, right: presentation === 'masculine' ? 11 : 10 };
  if (presentation === 'masculine') return { left: 4, right: 11 };
  if (presentation === 'feminine') return { left: 6, right: 9 };
  return { left: 5, right: 10 };
}

function drawBody(
  layer: PixelLayer,
  config: CharacterCustomization,
  direction: PreviewDirection,
  pose: RigPose,
): void {
  const skin = config.skinColor;
  const skinShadow = shade(skin, 0.72);
  const b = pose.bob;
  if (direction === 'right') {
    layer.frame(5, 4 + b, 11, 13 + b, OUTLINE);
    layer.rect(6, 5 + b, 10, 12 + b, skin);
    layer.rect(10, 7 + b, 11, 11 + b, skin);
    layer.pixel(12, 9 + b, skinShadow);
    layer.rect(7, 14 + b, 9, 15 + b, skinShadow);
    return;
  }
  layer.frame(4, 4 + b, 11, 13 + b, OUTLINE);
  layer.rect(5, 5 + b, 10, 12 + b, skin);
  layer.pixel(4, 9 + b, skinShadow);
  layer.pixel(11, 9 + b, skinShadow);
  layer.rect(7, 14 + b, 8, 15 + b, skinShadow);
}

function drawHair(
  back: PixelLayer,
  front: PixelLayer,
  config: CharacterCustomization,
  direction: PreviewDirection,
  pose: RigPose,
): void {
  const color = config.hairColor;
  const dark = shade(color, 0.58);
  const light = shade(color, 1.18);
  const b = pose.bob;
  const side = direction === 'right';
  const left = side ? 5 : 4;
  const right = 11;

  if (config.hairStyle === 'long') {
    back.rect(left, 7 + b, right, 19 + b, dark);
    back.pixel(left - 1, 12 + b, dark);
  } else if (config.hairStyle === 'bob') {
    back.rect(left, 7 + b, right, 15 + b, dark);
    back.pixel(left - 1, 12 + b, dark);
  } else if (config.hairStyle === 'braids') {
    back.rect(left, 7 + b, right, 12 + b, dark);
    if (side) {
      back.rect(5, 12 + b, 6, 20 + b, dark);
      back.pixel(5, 21 + b, light);
    } else {
      back.rect(3, 12 + b, 4, 20 + b, dark);
      back.rect(11, 12 + b, 12, 20 + b, dark);
      back.pixel(3, 21 + b, light);
      back.pixel(12, 21 + b, light);
    }
  }

  if (config.hairStyle === 'cropped') {
    front.rect(left + 1, 4 + b, right - 1, 6 + b, dark);
    front.pixel(right, 6 + b, color);
  } else if (config.hairStyle === 'swept') {
    front.rect(left, 4 + b, right, 6 + b, dark);
    front.rect(left, 7 + b, left + 2, 10 + b, color);
    front.pixel(left + 3, 7 + b, light);
  } else {
    front.rect(left, 4 + b, right, 6 + b, dark);
    front.pixel(left + 1, 7 + b, color);
    front.pixel(left + 2, 7 + b, light);
    if (config.hairStyle !== 'short') {
      front.pixel(right, 7 + b, color);
    }
  }
}

function drawBottom(
  layer: PixelLayer,
  config: CharacterCustomization,
  direction: PreviewDirection,
  pose: RigPose,
): void {
  const { left, right } = bodyBounds(config.presentation, direction);
  const color = config.bottomColor;
  const dark = shade(color, 0.63);
  const hipTop = 21 + pose.bob;
  layer.frame(left, hipTop, right, 24 + pose.bob, OUTLINE);
  layer.rect(left + 1, hipTop + 1, right - 1, 24 + pose.bob, color);

  if (config.bottomStyle === 'skirt') {
    layer.rect(left - 1, 23 + pose.bob, right + 1, 26 + pose.bob, dark);
    layer.pixel(left - 1, 27 + pose.bob, OUTLINE);
    layer.pixel(right + 1, 27 + pose.bob, OUTLINE);
  } else {
    const mid = Math.floor((left + right) / 2);
    layer.rect(left + 1, 25 + pose.bob, mid, 28 + pose.leftStep, dark);
    layer.rect(mid + 1, 25 + pose.bob, right - 1, 28 + pose.rightStep, color);
    layer.pixel(mid, 25 + pose.bob, OUTLINE);
    if (config.bottomStyle === 'shorts') {
      layer.rect(left + 1, 27 + pose.bob, mid, 28 + pose.leftStep, config.skinColor);
      layer.rect(mid + 1, 27 + pose.bob, right - 1, 28 + pose.rightStep, config.skinColor);
    }
    if (config.bottomStyle === 'utility') {
      layer.pixel(left, 23 + pose.bob, config.accentColor);
      layer.pixel(right, 23 + pose.bob, config.accentColor);
    }
    if (config.bottomStyle === 'jeans') layer.pixel(right - 1, 24 + pose.bob, shade(color, 1.35));
  }
}

function drawShoes(
  layer: PixelLayer,
  config: CharacterCustomization,
  direction: PreviewDirection,
  pose: RigPose,
): void {
  const { left, right } = bodyBounds(config.presentation, direction);
  const mid = Math.floor((left + right) / 2);
  const leftY = Math.min(30, 29 + pose.leftStep);
  const rightY = Math.min(30, 29 + pose.rightStep);
  const color = config.shoeColor;
  const light = shade(color, config.shoeStyle === 'sneakers' ? 1.65 : 1.12);
  layer.rect(left, leftY, mid, Math.min(31, leftY + 1), OUTLINE);
  layer.rect(mid + 1, rightY, right, Math.min(31, rightY + 1), OUTLINE);
  layer.rect(left + 1, leftY, mid, leftY, color);
  layer.rect(mid + 1, rightY, right - 1, rightY, color);
  if (config.shoeStyle === 'boots') {
    layer.rect(left + 1, leftY - 2, mid, leftY - 1, color);
    layer.rect(mid + 1, rightY - 2, right - 1, rightY - 1, color);
  } else if (config.shoeStyle === 'sneakers') {
    layer.pixel(mid, leftY, light);
    layer.pixel(right - 1, rightY, light);
  } else if (config.shoeStyle === 'sandals') {
    layer.pixel(left + 1, leftY, config.skinColor);
    layer.pixel(mid + 1, rightY, config.skinColor);
  }
}

function drawTopAndHands(
  top: PixelLayer,
  hands: PixelLayer,
  config: CharacterCustomization,
  direction: PreviewDirection,
  pose: RigPose,
): void {
  const { left, right } = bodyBounds(config.presentation, direction);
  const color = config.outfitColor;
  const dark = shade(color, 0.64);
  const light = shade(color, 1.22);
  const y = 15 + pose.bob;
  top.frame(left, y, right, 22 + pose.bob, OUTLINE);
  top.rect(left + 1, y + 1, right - 1, 21 + pose.bob, color);

  if (config.outfitStyle === 'overalls') {
    top.rect(left + 1, y + 1, left + 1, y + 5, config.accentColor);
    top.rect(right - 1, y + 1, right - 1, y + 5, config.accentColor);
    top.rect(left + 2, y + 4, right - 2, y + 7, dark);
  } else if (config.outfitStyle === 'techwear') {
    top.rect(left + 1, y + 2, right - 1, y + 3, dark);
    top.pixel(right - 1, y + 5, config.accentColor);
  } else if (config.outfitStyle === 'lab-coat') {
    top.rect(left, y + 5, right, y + 9, light);
    top.pixel(Math.floor((left + right) / 2), y + 3, OUTLINE);
  } else if (config.outfitStyle === 'casual') {
    top.rect(left + 1, y + 1, right - 1, y + 2, config.accentColor);
  } else if (config.outfitStyle === 'formal') {
    const center = Math.floor((left + right) / 2);
    top.pixel(center, y + 2, config.accentColor);
    top.pixel(center, y + 3, light);
  } else {
    top.rect(left + 1, y + 5, right - 1, y + 6, dark);
  }

  const skin = config.skinColor;
  if (pose.activity === 'walk') {
    const leftArmY = 17 + pose.bob + pose.armSwing;
    const rightArmY = 17 + pose.bob - pose.armSwing;
    top.rect(left - 1, leftArmY, left, leftArmY + 4, dark);
    top.rect(right, rightArmY, right + 1, rightArmY + 4, color);
    hands.pixel(left - 1, leftArmY + 5, skin);
    hands.pixel(right + 1, rightArmY + 5, skin);
  } else if (direction === 'right') {
    top.rect(right, y + 2, right + 1, y + 5, dark);
    hands.pixel(right + 2, y + 5 + pose.phase, skin);
    hands.pixel(right, y + 6, skin);
  } else {
    const handY = y + 5 + (pose.activity === 'type' ? pose.phase : 0);
    top.rect(left - 1, y + 2, left, y + 5, dark);
    top.rect(right, y + 2, right + 1, y + 5, color);
    hands.pixel(left + 1, handY, skin);
    hands.pixel(right - 1, handY, skin);
  }
}

function drawFace(
  layer: PixelLayer,
  config: CharacterCustomization,
  direction: PreviewDirection,
  pose: RigPose,
): void {
  if (direction === 'up') return;
  const y = 9 + pose.bob;
  if (direction === 'right') {
    layer.pixel(10, y, config.eyeColor);
    layer.pixel(11, y + 3, shade(config.skinColor, 0.67));
  } else {
    layer.pixel(6, y, config.eyeColor);
    layer.pixel(9, y, config.eyeColor);
    layer.pixel(7, y + 3, shade(config.skinColor, 0.67));
    layer.pixel(8, y + 3, shade(config.skinColor, 0.67));
  }
}

function drawAccessories(
  layer: PixelLayer,
  config: CharacterCustomization,
  direction: PreviewDirection,
  pose: RigPose,
): void {
  const b = pose.bob;
  if (config.faceAccessory === 'glasses' && direction !== 'up') {
    if (direction === 'right') {
      layer.rect(9, 8 + b, 11, 10 + b, GLASSES);
      layer.pixel(12, 9 + b, GLASSES);
    } else {
      layer.frame(5, 8 + b, 7, 10 + b, GLASSES);
      layer.frame(8, 8 + b, 10, 10 + b, GLASSES);
    }
  } else if (config.faceAccessory === 'sunglasses' && direction !== 'up') {
    layer.rect(direction === 'right' ? 9 : 5, 8 + b, 10, 10 + b, GLASSES);
    if (direction === 'right') layer.pixel(11, 9 + b, GLASSES);
  } else if (config.faceAccessory === 'earrings' && direction !== 'up') {
    layer.pixel(direction === 'right' ? 5 : 4, 11 + b, config.accentColor);
    if (direction === 'down') layer.pixel(11, 11 + b, config.accentColor);
  }

  const hat = config.hat;
  if (hat === 'none') return;
  const left = direction === 'right' ? 5 : 4;
  const right = 11;
  if (hat === 'headphones') {
    layer.rect(left, 4 + b, right, 4 + b, config.accentColor);
    layer.rect(left - 1, 6 + b, left, 10 + b, shade(config.accentColor, 0.65));
    layer.rect(right, 6 + b, right + 1, 10 + b, shade(config.accentColor, 0.65));
  } else if (hat === 'hardhat') {
    layer.rect(left, 3 + b, right, 5 + b, config.accentColor);
    layer.rect(left - 1, 6 + b, right + 1, 6 + b, shade(config.accentColor, 0.62));
    layer.pixel(7, 2 + b, config.accentColor);
    layer.pixel(8, 2 + b, config.accentColor);
  } else if (hat === 'cap') {
    layer.rect(left, 3 + b, right, 5 + b, config.accentColor);
    if (direction === 'right')
      layer.rect(right, 6 + b, right + 2, 6 + b, shade(config.accentColor, 0.68));
    else layer.rect(left - 1, 6 + b, right, 6 + b, shade(config.accentColor, 0.68));
  } else if (hat === 'beanie') {
    layer.rect(left, 3 + b, right, 6 + b, config.accentColor);
    layer.pixel(7, 2 + b, shade(config.accentColor, 1.2));
    layer.pixel(8, 2 + b, shade(config.accentColor, 1.2));
  }
}

function drawHeldItem(
  layer: PixelLayer,
  config: CharacterCustomization,
  direction: PreviewDirection,
  pose: RigPose,
): void {
  if (config.heldItem === 'none') return;
  const side = direction === 'right';
  const y = 20 + pose.bob + (pose.activity === 'walk' ? Math.abs(pose.armSwing) : 0);
  if (config.heldItem === 'coffee') {
    const x = side ? 12 : 11 + pose.armSwing;
    layer.frame(x - 1, y - 2, x + 1, y + 1, PAPER);
    layer.pixel(x + 2, y, PAPER);
    layer.pixel(x, y - 3, CHARACTER_STUDIO_COFFEE_STEAM_COLOR);
  } else if (config.heldItem === 'book') {
    const left = side ? 10 : 5;
    layer.rect(left, y - 2, side ? 13 : 10, y + 2, config.accentColor);
    layer.pixel(side ? 10 : 7, y - 1, PAPER);
    layer.pixel(side ? 10 : 8, y, PAPER);
  } else if (config.heldItem === 'laptop') {
    const left = side ? 10 : 5;
    layer.frame(left, y - 2, side ? 13 : 10, y + 1, OUTLINE);
    layer.rect(left + 1, y - 1, side ? 12 : 9, y, LAPTOP);
    layer.pixel(side ? 12 : 8, y - 1, config.accentColor);
  } else {
    const left = side ? 10 : 6;
    layer.frame(left, y - 3, side ? 12 : 9, y + 2, OUTLINE);
    layer.rect(left + 1, y - 2, side ? 11 : 8, y + 1, PAPER);
    layer.pixel(left + 1, y - 1, config.accentColor);
  }
}

export function createCharacterFrameLayers(
  config: CharacterCustomization,
  direction: Exclude<PreviewDirection, 'left'>,
  frameIndex: number,
): CharacterFrameLayers {
  const pose = FRAME_POSES[frameIndex] ?? FRAME_POSES[0];
  const layers = newLayers();
  const painters = Object.fromEntries(
    CHARACTER_LAYER_ORDER.map((name) => [name, new PixelLayer()]),
  ) as Record<CharacterLayer, PixelLayer>;
  drawHair(painters.hairBack, painters.hairFront, config, direction, pose);
  drawBody(painters.body, config, direction, pose);
  drawBottom(painters.bottom, config, direction, pose);
  drawShoes(painters.shoes, config, direction, pose);
  drawTopAndHands(painters.top, painters.hands, config, direction, pose);
  drawFace(painters.face, config, direction, pose);
  drawAccessories(painters.accessory, config, direction, pose);
  drawHeldItem(painters.heldItem, config, direction, pose);
  for (const name of CHARACTER_LAYER_ORDER) layers[name] = painters[name].pixels;
  return layers;
}

export function composeCharacterLayers(layers: CharacterFrameLayers): SpriteData {
  const output = emptySprite();
  for (const name of CHARACTER_LAYER_ORDER) {
    const layer = layers[name];
    for (let y = 0; y < CHARACTER_FRAME_HEIGHT; y += 1) {
      for (let x = 0; x < CHARACTER_FRAME_WIDTH; x += 1) {
        if (layer[y][x]) output[y][x] = layer[y][x];
      }
    }
  }
  return output;
}

function flipSpriteHorizontal(sprite: SpriteData): SpriteData {
  return sprite.map((row) => [...row].reverse());
}

export function createCharacterSheet(config: CharacterCustomization): CharacterSheetRows {
  return (['down', 'up', 'right'] as const).map((direction) =>
    FRAME_POSES.map((_, frameIndex) =>
      composeCharacterLayers(createCharacterFrameLayers(config, direction, frameIndex)),
    ),
  ) as CharacterSheetRows;
}

export function getPreviewFrame(
  rows: CharacterSheetRows,
  activity: PreviewActivity,
  direction: PreviewDirection,
  animationFrame: number,
): SpriteData {
  const rowIndex = direction === 'down' ? 0 : direction === 'up' ? 1 : 2;
  const sequence = activity === 'walk' ? [0, 1, 2, 1] : activity === 'type' ? [3, 4] : [5, 6];
  const frame = rows[rowIndex][sequence[animationFrame % sequence.length]];
  return direction === 'left' ? flipSpriteHorizontal(frame) : frame;
}

export function randomCharacterCustomization(): CharacterCustomization {
  const pick = <T>(values: readonly T[]): T => values[Math.floor(Math.random() * values.length)];
  return {
    presentation: pick(PRESENTATIONS),
    skinColor: pick(CHARACTER_STUDIO_SKIN_COLORS),
    eyeColor: pick(CHARACTER_STUDIO_EYE_COLORS),
    hairStyle: pick(HAIR_STYLES),
    hairColor: pick(CHARACTER_STUDIO_HAIR_COLORS),
    outfitStyle: pick(OUTFIT_STYLES),
    outfitColor: pick(CHARACTER_STUDIO_OUTFIT_COLORS),
    accentColor: pick(CHARACTER_STUDIO_ACCENT_COLORS),
    bottomStyle: pick(BOTTOM_STYLES),
    bottomColor: pick(CHARACTER_STUDIO_BOTTOM_COLORS),
    shoeStyle: pick(SHOE_STYLES),
    shoeColor: pick(CHARACTER_STUDIO_SHOE_COLORS),
    faceAccessory: pick(FACE_ACCESSORIES),
    hat: pick(HATS),
    heldItem: pick(HELD_ITEMS),
  };
}
