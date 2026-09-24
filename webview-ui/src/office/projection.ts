/**
 * World coordinates → screen coordinates, in one place.
 *
 * The office is drawn by centering the map in the canvas and then applying the
 * pan, both snapped to whole device pixels so sprites stay on the pixel grid.
 * That formula was reproduced in the renderer and in each DOM overlay that
 * floats something above a character; a copy that rounds differently puts the
 * overlay a pixel off the sprite it is labelling, which is invisible in review
 * and obvious on screen.
 *
 * Deliberately free of DOM access — `dpr` is passed in, not read from
 * `window`. Reading the environment belongs at the component boundary; a state
 * or math module that reaches for `window` drags the DOM into every module
 * graph that imports it.
 */

import { TILE_SIZE, TileType } from './types.js';

/** The part of the grid that holds something, in tiles. */
export interface MapBox {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

/** Bounds of the non-void tiles and of every furniture anchor (wall items
 *  anchor one row above the wall). The editor grows the grid in whole rows and
 *  columns, so a layout can carry empty bands; centering the full grid would
 *  push the office off-center by half of them. Falls back to the full grid. */
export interface LayoutExtent {
  cols: number;
  rows: number;
  tiles?: readonly number[];
  furniture?: ReadonlyArray<{ col: number; row: number }>;
}

export function contentBox(layout: LayoutExtent): MapBox {
  const { cols, rows, tiles, furniture } = layout;
  let minC = Infinity;
  let minR = Infinity;
  let maxC = -Infinity;
  let maxR = -Infinity;
  const take = (c: number, r: number) => {
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
  };
  if (tiles) {
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] !== TileType.VOID) take(i % cols, Math.floor(i / cols));
    }
  }
  for (const f of furniture ?? []) take(f.col, f.row);
  if (minC === Infinity) return { col: 0, row: 0, cols, rows };
  return { col: minC, row: minR, cols: maxC - minC + 1, rows: maxR - minR + 1 };
}

/** Device-pixel offset of the map's top-left corner inside the canvas, with
 *  the content box centered. This is the renderer's own frame of reference —
 *  overlays go through {@link overlayProjection} instead of calling this
 *  directly. */
export function mapOffset(
  canvasWidth: number,
  canvasHeight: number,
  box: MapBox,
  zoom: number,
  panX: number,
  panY: number,
): { offsetX: number; offsetY: number } {
  const tile = TILE_SIZE * zoom;
  return {
    offsetX: Math.floor((canvasWidth - box.cols * tile) / 2 - box.col * tile) + Math.round(panX),
    offsetY: Math.floor((canvasHeight - box.rows * tile) / 2 - box.row * tile) + Math.round(panY),
  };
}

/** Pan that puts a world point at the center of the canvas. */
export function panToCenter(box: MapBox, zoom: number, worldX: number, worldY: number) {
  const tile = TILE_SIZE * zoom;
  return {
    x: (box.col + box.cols / 2) * tile - worldX * zoom,
    y: (box.row + box.rows / 2) * tile - worldY * zoom,
  };
}

/** Projects world points into CSS pixels within the overlay container that
 *  sits on top of the canvas. */
export interface OverlayProjection {
  toScreenX(worldX: number): number;
  toScreenY(worldY: number): number;
  /** Container size in world units — what the viewport currently covers.
   *  Used to cap overlay offsets against the visible area. */
  readonly viewportWorldWidth: number;
  readonly viewportWorldHeight: number;
  /** CSS px → world units, for sizing overlay geometry in world terms. */
  toWorldLength(cssPx: number): number;
}

export function overlayProjection(
  layout: LayoutExtent,
  containerRect: { width: number; height: number },
  zoom: number,
  pan: { x: number; y: number },
  dpr: number,
): OverlayProjection {
  const canvasW = Math.round(containerRect.width * dpr);
  const canvasH = Math.round(containerRect.height * dpr);
  const { offsetX, offsetY } = mapOffset(canvasW, canvasH, contentBox(layout), zoom, pan.x, pan.y);
  return {
    toScreenX: (worldX) => (offsetX + worldX * zoom) / dpr,
    toScreenY: (worldY) => (offsetY + worldY * zoom) / dpr,
    viewportWorldWidth: canvasW / zoom,
    viewportWorldHeight: canvasH / zoom,
    toWorldLength: (cssPx) => (cssPx * dpr) / zoom,
  };
}
