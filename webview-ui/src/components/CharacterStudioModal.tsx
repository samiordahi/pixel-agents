import { useEffect, useMemo, useRef, useState } from 'react';

import {
  CHARACTER_STUDIO_ACCENT_COLORS,
  CHARACTER_STUDIO_BOTTOM_COLORS,
  CHARACTER_STUDIO_EYE_COLORS,
  CHARACTER_STUDIO_HAIR_COLORS,
  CHARACTER_STUDIO_OUTFIT_COLORS,
  CHARACTER_STUDIO_SHOE_COLORS,
  CHARACTER_STUDIO_SKIN_COLORS,
} from '../constants.js';
import type { SpriteData } from '../office/types.js';
import {
  BOTTOM_STYLES,
  CHARACTER_FRAME_HEIGHT,
  CHARACTER_FRAME_WIDTH,
  CHARACTER_LAYER_ORDER,
  CHARACTER_SHEET_HEIGHT,
  CHARACTER_SHEET_WIDTH,
  type CharacterCustomization,
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
  type PreviewActivity,
  type PreviewDirection,
  randomCharacterCustomization,
  SHOE_STYLES,
} from './characterStudioEngine.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

const labels: Record<string, string> = {
  masculine: 'Broad',
  feminine: 'Compact',
  neutral: 'Classic',
  short: 'Short',
  braids: 'Braids',
  cropped: 'Cropped',
  bob: 'Bob',
  long: 'Long',
  swept: 'Swept',
  workwear: 'Workwear',
  overalls: 'Overalls',
  techwear: 'Techwear',
  'lab-coat': 'Lab coat',
  casual: 'Casual',
  formal: 'Formal',
  pants: 'Pants',
  jeans: 'Jeans',
  shorts: 'Shorts',
  skirt: 'Skirt',
  utility: 'Utility',
  boots: 'Boots',
  sneakers: 'Sneakers',
  'formal-shoes': 'Formal',
  sandals: 'Sandals',
  none: 'None',
  glasses: 'Glasses',
  sunglasses: 'Sunglasses',
  earrings: 'Earrings',
  cap: 'Cap',
  beanie: 'Beanie',
  hardhat: 'Hard hat',
  headphones: 'Headphones',
  coffee: 'Coffee',
  book: 'Book',
  laptop: 'Laptop',
  clipboard: 'Clipboard',
  walk: 'Walking',
  type: 'Typing',
  read: 'Reading',
  down: 'Front',
  up: 'Back',
  right: 'Right',
  left: 'Left',
};

const STORAGE_KEY = 'pixel-agents.character-studio.v2';

type EditorSection = 'body' | 'hair' | 'clothes' | 'gear';

function drawSprite(canvas: HTMLCanvasElement, sprite: SpriteData): void {
  canvas.width = CHARACTER_FRAME_WIDTH;
  canvas.height = CHARACTER_FRAME_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, CHARACTER_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT);
  for (let y = 0; y < sprite.length; y += 1) {
    for (let x = 0; x < sprite[y].length; x += 1) {
      if (!sprite[y][x]) continue;
      context.fillStyle = sprite[y][x];
      context.fillRect(x, y, 1, 1);
    }
  }
}

function drawSheet(canvas: HTMLCanvasElement, rows: ReturnType<typeof createCharacterSheet>): void {
  canvas.width = CHARACTER_SHEET_WIDTH;
  canvas.height = CHARACTER_SHEET_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, CHARACTER_SHEET_WIDTH, CHARACTER_SHEET_HEIGHT);
  rows.forEach((row, rowIndex) => {
    row.forEach((sprite, frameIndex) => {
      for (let y = 0; y < sprite.length; y += 1) {
        for (let x = 0; x < sprite[y].length; x += 1) {
          if (!sprite[y][x]) continue;
          context.fillStyle = sprite[y][x];
          context.fillRect(
            frameIndex * CHARACTER_FRAME_WIDTH + x,
            rowIndex * CHARACTER_FRAME_HEIGHT + y,
            1,
            1,
          );
        }
      }
    });
  });
}

function filename(value: string): string {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || 'custom-character';
}

function SpriteCanvas({
  sprite,
  label,
  className = '',
}: {
  sprite: SpriteData;
  label: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) drawSprite(canvasRef.current, sprite);
  }, [sprite]);
  return (
    <canvas
      ref={canvasRef}
      width={CHARACTER_FRAME_WIDTH}
      height={CHARACTER_FRAME_HEIGHT}
      className={`[image-rendering:pixelated] ${className}`}
      aria-label={label}
    />
  );
}

function VisualOptions<T extends string>({
  label,
  values,
  value,
  config,
  configKey,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: T;
  config: CharacterCustomization;
  configKey: keyof CharacterCustomization;
  onChange: (next: T) => void;
}) {
  return (
    <fieldset className="space-y-5">
      <legend className="text-xs text-text-muted">{label}</legend>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
        {values.map((option) => {
          const optionConfig = { ...config, [configKey]: option } as CharacterCustomization;
          const sprite = composeCharacterLayers(
            createCharacterFrameLayers(optionConfig, 'down', 1),
          );
          return (
            <button
              key={option}
              type="button"
              aria-pressed={value === option}
              onClick={() => onChange(option)}
              className={`group min-h-88 border-2 px-4 py-4 text-center text-xs transition-[background-color,border-color,color] duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                value === option
                  ? 'border-accent bg-active-bg text-text'
                  : 'border-border bg-btn-bg text-text-muted hover:bg-btn-hover hover:text-text'
              }`}
            >
              <SpriteCanvas
                sprite={sprite}
                label={`${labels[option]} option preview`}
                className="mx-auto h-48 w-24 pointer-events-none"
              />
              <span className="mt-3 block">{labels[option]}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ColorChoice({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string;
  value: string;
  swatches: readonly string[];
  onChange: (next: string) => void;
}) {
  return (
    <fieldset className="space-y-5">
      <legend className="text-xs text-text-muted">{label}</legend>
      <div className="flex flex-wrap items-center gap-6">
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`${label}: ${swatch}`}
            aria-pressed={value.toUpperCase() === swatch.toUpperCase()}
            onClick={() => onChange(swatch)}
            className={`h-36 w-36 border-2 shadow-pixel transition-[border-color,transform] duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-95 ${
              value.toUpperCase() === swatch.toUpperCase() ? 'border-accent' : 'border-border'
            }`}
            style={{ backgroundColor: swatch }}
          />
        ))}
        <label className="relative h-36 w-36 cursor-pointer border-2 border-border bg-bg-dark shadow-pixel focus-within:border-accent">
          <span className="sr-only">Custom {label}</span>
          <input
            type="color"
            value={value.slice(0, 7)}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span className="absolute inset-6 border border-text-muted" aria-hidden="true" />
        </label>
      </div>
    </fieldset>
  );
}

function downloadBlob(blob: Blob, name: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

interface CharacterStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CharacterStudioModal({ isOpen, onClose }: CharacterStudioModalProps) {
  const sheetCanvasRef = useRef<HTMLCanvasElement>(null);
  const presetInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('my-agent');
  const [section, setSection] = useState<EditorSection>('body');
  const [activity, setActivity] = useState<PreviewActivity>('walk');
  const [direction, setDirection] = useState<PreviewDirection>('down');
  const [animationFrame, setAnimationFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [config, setConfig] = useState<CharacterCustomization>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved
        ? { ...DEFAULT_CHARACTER_CUSTOMIZATION, ...JSON.parse(saved) }
        : DEFAULT_CHARACTER_CUSTOMIZATION;
    } catch {
      return DEFAULT_CHARACTER_CUSTOMIZATION;
    }
  });
  const rows = useMemo(() => createCharacterSheet(config), [config]);
  const previewSprite = useMemo(
    () => getPreviewFrame(rows, activity, direction, animationFrame),
    [activity, animationFrame, direction, rows],
  );

  const update = <K extends keyof CharacterCustomization>(
    key: K,
    value: CharacterCustomization[K],
  ) => setConfig((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (!isOpen || !isPlaying || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const timer = window.setInterval(() => setAnimationFrame((frame) => frame + 1), 220);
    return () => window.clearInterval(timer);
  }, [isOpen, isPlaying]);

  useEffect(() => {
    if (isOpen && sheetCanvasRef.current) drawSheet(sheetCanvasRef.current, rows);
  }, [isOpen, rows]);

  const downloadPng = () => {
    sheetCanvasRef.current?.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${filename(name)}.png`);
    }, 'image/png');
  };

  const downloadPreset = () => {
    const blob = new Blob([JSON.stringify({ version: 2, name, ...config }, null, 2)], {
      type: 'application/json',
    });
    downloadBlob(blob, `${filename(name)}.character.json`);
  };

  const importPreset = async (file: File) => {
    try {
      presetInputRef.current?.setCustomValidity('');
      const saved = JSON.parse(await file.text()) as Partial<CharacterCustomization> & {
        name?: unknown;
      };
      setConfig({ ...DEFAULT_CHARACTER_CUSTOMIZATION, ...saved });
      if (typeof saved.name === 'string') setName(saved.name);
    } catch {
      presetInputRef.current?.setCustomValidity('Choose a valid Pixel Agents character preset.');
      presetInputRef.current?.reportValidity();
    }
  };

  const sections: { id: EditorSection; label: string; hint: string }[] = [
    { id: 'body', label: 'Body', hint: 'Frame, skin and eyes' },
    { id: 'hair', label: 'Hair', hint: 'Cut and color' },
    { id: 'clothes', label: 'Clothes', hint: 'Top, bottom and shoes' },
    { id: 'gear', label: 'Gear', hint: 'Face, head and item' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Character Studio"
      className="w-[min(1180px,calc(100vw-24px))] max-h-[calc(100vh-24px)] overflow-hidden p-0"
      zIndex={60}
    >
      <div className="grid max-h-[calc(100vh-92px)] overflow-hidden lg:grid-cols-[220px_minmax(360px,1fr)_360px]">
        <nav
          className="border-b-2 border-border bg-bg-dark p-8 lg:border-r-2 lg:border-b-0"
          aria-label="Character editor sections"
        >
          <div className="mb-10 border-l-2 border-accent pl-6">
            <p className="text-sm text-text">One rig, every pose.</p>
            <p className="mt-3 text-xs leading-relaxed text-text-muted">
              All parts share the same feet, head and hand anchors.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            {sections.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={section === item.id ? 'page' : undefined}
                onClick={() => setSection(item.id)}
                className={`min-h-54 border-l-2 px-6 py-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  section === item.id
                    ? 'border-accent bg-active-bg text-text'
                    : 'border-transparent text-text-muted hover:bg-btn-hover hover:text-text'
                }`}
              >
                <span className="block text-sm">{item.label}</span>
                <span className="mt-2 hidden text-xs text-text-muted xl:block">{item.hint}</span>
              </button>
            ))}
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfig(randomCharacterCustomization())}
              className="w-full border-border"
            >
              Randomize
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfig(DEFAULT_CHARACTER_CUSTOMIZATION)}
              className="w-full border-border"
            >
              Reset
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => presetInputRef.current?.click()}
              className="w-full border-border"
            >
              Import preset
            </Button>
            <input
              ref={presetInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Import character preset"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importPreset(file);
                event.target.value = '';
              }}
            />
          </div>
          <p className="mt-8 text-xs text-text-muted">Changes are saved on this device.</p>
        </nav>

        <section
          className="pixel-scrollbar min-h-0 overflow-y-auto p-10 sm:p-12"
          aria-label={`${section} options`}
        >
          <label className="mb-14 block text-xs text-text-muted">
            Character name
            <input
              name="character-name"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-4 min-h-44 w-full border-2 border-border bg-bg-dark px-7 py-4 text-base text-text outline-none focus-visible:border-accent"
            />
          </label>

          {section === 'body' && (
            <div className="space-y-14">
              <VisualOptions
                label="Body frame"
                values={PRESENTATIONS}
                value={config.presentation}
                config={config}
                configKey="presentation"
                onChange={(value) => update('presentation', value)}
              />
              <ColorChoice
                label="Skin tone"
                value={config.skinColor}
                swatches={CHARACTER_STUDIO_SKIN_COLORS}
                onChange={(value) => update('skinColor', value)}
              />
              <ColorChoice
                label="Eye color"
                value={config.eyeColor}
                swatches={CHARACTER_STUDIO_EYE_COLORS}
                onChange={(value) => update('eyeColor', value)}
              />
            </div>
          )}
          {section === 'hair' && (
            <div className="space-y-14">
              <VisualOptions
                label="Hair style"
                values={HAIR_STYLES}
                value={config.hairStyle}
                config={config}
                configKey="hairStyle"
                onChange={(value) => update('hairStyle', value)}
              />
              <ColorChoice
                label="Hair color"
                value={config.hairColor}
                swatches={CHARACTER_STUDIO_HAIR_COLORS}
                onChange={(value) => update('hairColor', value)}
              />
            </div>
          )}
          {section === 'clothes' && (
            <div className="space-y-14">
              <VisualOptions
                label="Top"
                values={OUTFIT_STYLES}
                value={config.outfitStyle}
                config={config}
                configKey="outfitStyle"
                onChange={(value) => update('outfitStyle', value)}
              />
              <ColorChoice
                label="Top color"
                value={config.outfitColor}
                swatches={CHARACTER_STUDIO_OUTFIT_COLORS}
                onChange={(value) => update('outfitColor', value)}
              />
              <ColorChoice
                label="Accent"
                value={config.accentColor}
                swatches={CHARACTER_STUDIO_ACCENT_COLORS}
                onChange={(value) => update('accentColor', value)}
              />
              <VisualOptions
                label="Bottom"
                values={BOTTOM_STYLES}
                value={config.bottomStyle}
                config={config}
                configKey="bottomStyle"
                onChange={(value) => update('bottomStyle', value)}
              />
              <ColorChoice
                label="Bottom color"
                value={config.bottomColor}
                swatches={CHARACTER_STUDIO_BOTTOM_COLORS}
                onChange={(value) => update('bottomColor', value)}
              />
              <VisualOptions
                label="Shoes"
                values={SHOE_STYLES}
                value={config.shoeStyle}
                config={config}
                configKey="shoeStyle"
                onChange={(value) => update('shoeStyle', value)}
              />
              <ColorChoice
                label="Shoe color"
                value={config.shoeColor}
                swatches={CHARACTER_STUDIO_SHOE_COLORS}
                onChange={(value) => update('shoeColor', value)}
              />
            </div>
          )}
          {section === 'gear' && (
            <div className="space-y-14">
              <VisualOptions
                label="Face accessory"
                values={FACE_ACCESSORIES}
                value={config.faceAccessory}
                config={config}
                configKey="faceAccessory"
                onChange={(value) => update('faceAccessory', value)}
              />
              <VisualOptions
                label="Hat or headset"
                values={HATS}
                value={config.hat}
                config={config}
                configKey="hat"
                onChange={(value) => update('hat', value)}
              />
              <VisualOptions
                label="Held item"
                values={HELD_ITEMS}
                value={config.heldItem}
                config={config}
                configKey="heldItem"
                onChange={(value) => update('heldItem', value)}
              />
            </div>
          )}
        </section>

        <aside className="pixel-scrollbar min-h-0 overflow-y-auto border-t-2 border-border bg-bg-dark p-10 lg:border-t-0 lg:border-l-2">
          <div className="relative flex min-h-300 items-end justify-center overflow-hidden border-2 border-border bg-bg shadow-pixel">
            <div
              className="absolute inset-0 opacity-40 [background-image:linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:16px_16px]"
              aria-hidden="true"
            />
            <div
              className="absolute inset-x-0 bottom-0 h-64 border-t-2 border-border bg-bg-thumb"
              aria-hidden="true"
            />
            <SpriteCanvas
              sprite={previewSprite}
              label={`${labels[activity]} preview facing ${labels[direction].toLowerCase()}`}
              className="relative mb-28 h-224 w-112"
            />
            <div className="absolute top-6 right-6 border border-border bg-bg-dark px-5 py-3 text-xs text-text-muted">
              {CHARACTER_LAYER_ORDER.length} synced layers
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <span className="text-xs text-text-muted">Live game preview</span>
            <button
              type="button"
              onClick={() => setIsPlaying((value) => !value)}
              className="min-h-36 border border-border px-6 text-xs text-text-muted hover:bg-btn-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4" aria-label="Preview activity">
            {(['walk', 'type', 'read'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={activity === value}
                onClick={() => {
                  setActivity(value);
                  setAnimationFrame(0);
                }}
                className={`min-h-44 border-2 px-3 py-4 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${activity === value ? 'border-accent bg-active-bg text-text' : 'border-border bg-btn-bg text-text-muted hover:bg-btn-hover'}`}
              >
                {labels[value]}
              </button>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-4 gap-4" aria-label="Preview direction">
            {(['down', 'left', 'right', 'up'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={direction === value}
                onClick={() => setDirection(value)}
                className={`min-h-44 border-2 px-2 py-4 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${direction === value ? 'border-accent bg-active-bg text-text' : 'border-border bg-btn-bg text-text-muted hover:bg-btn-hover'}`}
              >
                {labels[value]}
              </button>
            ))}
          </div>

          <details className="mt-10 border-2 border-border bg-bg p-6">
            <summary className="cursor-pointer text-xs text-text-muted focus-visible:outline-2 focus-visible:outline-accent">
              Sprite sheet · 112×96 · 21 frames
            </summary>
            <canvas
              ref={sheetCanvasRef}
              width={CHARACTER_SHEET_WIDTH}
              height={CHARACTER_SHEET_HEIGHT}
              className="mt-6 block h-auto w-full [image-rendering:pixelated]"
              aria-label="Complete 21-frame sprite sheet"
            />
            <p className="mt-5 text-xs leading-relaxed text-text-muted">
              Front, back and right frames for walking, typing and reading. The left direction is
              mirrored by Pixel Agents.
            </p>
          </details>
          <Button variant="accent" size="lg" onClick={downloadPng} className="mt-9 w-full">
            Download game-ready PNG
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={downloadPreset}
            className="mt-5 w-full border-border"
          >
            Download editable preset
          </Button>
        </aside>
      </div>
    </Modal>
  );
}
