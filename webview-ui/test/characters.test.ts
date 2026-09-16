import assert from 'node:assert/strict';

import { test } from 'vitest';

import { createCharacter, updateCharacter } from '../src/office/engine/characters.js';
import type { Seat, TileType as TileTypeVal } from '../src/office/types.js';
import { CharacterState, Direction, TileType } from '../src/office/types.js';

function openMap(cols: number, rows: number): TileTypeVal[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => TileType.FLOOR_1 as TileTypeVal),
  );
}

test('inactive seated character walks behind the chair before becoming idle', () => {
  const seat: Seat = {
    uid: 'chair-1',
    seatCol: 2,
    seatRow: 2,
    facingDir: Direction.UP,
    assigned: true,
  };
  const character = createCharacter(1, 0, seat.uid, seat);
  character.isActive = false;
  character.seatTimer = 0;

  const walkableTiles = [
    { col: 2, row: 3 },
    { col: 1, row: 2 },
    { col: 3, row: 2 },
  ];
  updateCharacter(
    character,
    0.016,
    walkableTiles,
    new Map([[seat.uid, seat]]),
    openMap(5, 5),
    new Set(),
  );

  assert.equal(character.state, CharacterState.WALK);
  assert.deepEqual(character.path, [{ col: 2, row: 3 }]);
  assert.notDeepEqual(character.path.at(-1), { col: seat.seatCol, row: seat.seatRow });
});

test('seat exit falls back to a side when the tile behind the chair is blocked', () => {
  const seat: Seat = {
    uid: 'chair-1',
    seatCol: 2,
    seatRow: 2,
    facingDir: Direction.UP,
    assigned: true,
  };
  const character = createCharacter(1, 0, seat.uid, seat);
  character.isActive = false;

  updateCharacter(
    character,
    0.016,
    [{ col: 3, row: 2 }],
    new Map([[seat.uid, seat]]),
    openMap(5, 5),
    new Set(['2,3', '1,2']),
  );

  assert.equal(character.state, CharacterState.WALK);
  assert.deepEqual(character.path, [{ col: 3, row: 2 }]);
});
