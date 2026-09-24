import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';

import { loadCharacterSprites } from '../src/assetLoader.js';

const roots: string[] = [];

function sheet(alpha = 255): Buffer {
  const png = new PNG({ width: 112, height: 96 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 17;
    png.data[i + 1] = 34;
    png.data[i + 2] = 51;
    png.data[i + 3] = alpha;
  }
  return PNG.sync.write(png);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('loadCharacterSprites', () => {
  it('loads the complete bundled sequence in numeric order', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pixel-agents-chars-'));
    roots.push(root);
    const dir = join(root, 'assets', 'characters');
    mkdirSync(dir, { recursive: true });
    for (let index = 0; index < 8; index++) {
      writeFileSync(join(dir, `char_${index}.png`), sheet(index === 7 ? 0 : 255));
    }

    const loaded = await loadCharacterSprites(root);

    expect(loaded?.characters).toHaveLength(8);
    expect(loaded?.characters[0].down[0][0][0]).not.toBe('');
    expect(loaded?.characters[7].down[0][0][0]).toBe('');
  });

  it('rejects a bundled sequence with a missing index', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pixel-agents-chars-'));
    roots.push(root);
    const dir = join(root, 'assets', 'characters');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'char_0.png'), sheet());
    writeFileSync(join(dir, 'char_2.png'), sheet());

    await expect(loadCharacterSprites(root)).resolves.toBeNull();
  });
});
