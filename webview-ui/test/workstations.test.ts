/**
 * FORK-LOCAL: agents work only from a workstation — a chair facing a PC.
 *
 * Upstream seats a working agent on any chair (sofa, armchair) and, with no
 * seat at all, "types in place". Both draw the seated pose where there is no
 * desk: the agent floats beside the furniture. These tests pin the fork rule.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { createCharacter, updateCharacter } from '../src/office/engine/characters.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import type { Seat, TileType as TileTypeVal } from '../src/office/types.js';
import { CharacterState, Direction, TILE_SIZE, TileType } from '../src/office/types.js';

function openMap(cols: number, rows: number): TileTypeVal[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => TileType.FLOOR_1 as TileTypeVal),
  );
}

const walkable = [
  { col: 1, row: 1 },
  { col: 2, row: 1 },
  { col: 3, row: 1 },
];

test('an active agent with no seat keeps walking, never types in mid-floor', () => {
  const ch = createCharacter(1, 0, null, null);
  ch.isActive = true;
  ch.state = CharacterState.IDLE;
  ch.tileCol = 2;
  ch.tileRow = 1;
  for (let i = 0; i < 400; i++) {
    updateCharacter(ch, 0.05, walkable, new Map(), openMap(5, 5), new Set());
    assert.notEqual(ch.state, CharacterState.TYPE, `typed without a seat at step ${i.toString()}`);
  }
});

test('an active agent that cannot path to its chair sits ON the chair, not where it stands', () => {
  const seat: Seat = { uid: 'pc', seatCol: 3, seatRow: 3, facingDir: Direction.UP, assigned: true };
  const ch = createCharacter(1, 0, seat.uid, seat);
  ch.isActive = true;
  ch.state = CharacterState.IDLE;
  ch.tileCol = 0;
  ch.tileRow = 0;
  ch.x = TILE_SIZE / 2;
  ch.y = TILE_SIZE / 2;
  // Everything blocked: findPath returns [].
  const walls = openMap(5, 5).map((row) => row.map(() => TileType.WALL as TileTypeVal));
  updateCharacter(ch, 0.016, [], new Map([[seat.uid, seat]]), walls, new Set());
  assert.equal(ch.state, CharacterState.TYPE);
  assert.deepEqual([ch.tileCol, ch.tileRow], [seat.seatCol, seat.seatRow]);
  assert.equal(ch.x, seat.seatCol * TILE_SIZE + TILE_SIZE / 2);
});

/** An office whose only electronics sit in front of the `pc` seat. */
function office(): OfficeState {
  const os = new OfficeState();
  const seats = new Map<string, Seat>([
    ['pc', { uid: 'pc', seatCol: 2, seatRow: 3, facingDir: Direction.UP, assigned: false }],
    ['sofa', { uid: 'sofa', seatCol: 6, seatRow: 6, facingDir: Direction.DOWN, assigned: false }],
  ]);
  const internals = os as unknown as {
    seats: Map<string, Seat>;
    buildElectronicsTileSet: () => Set<string>;
  };
  internals.seats = seats;
  internals.buildElectronicsTileSet = () => new Set(['2,2']);
  return os;
}

test('a new agent takes the workstation, and the next one gets no seat instead of the sofa', () => {
  const os = office();
  os.addAgent(1, 0, 0, undefined, true);
  os.addAgent(2, 1, 0, undefined, true);
  assert.equal(os.characters.get(1)?.seatId, 'pc');
  assert.equal(os.characters.get(2)?.seatId, null);
  assert.equal(os.seats.get('sofa')?.assigned, false);
});

test('a remembered sofa seat is not restored as a place to work', () => {
  const os = office();
  os.addAgent(1, 0, 0, 'sofa', true);
  assert.equal(os.characters.get(1)?.seatId, 'pc');
  assert.equal(os.isWorkstation('sofa'), false);
  assert.equal(os.isWorkstation('pc'), true);
});
