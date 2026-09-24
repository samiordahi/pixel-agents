/**
 * FORK-LOCAL: the conversation with the AIOS panel when it embeds the office
 * (`?host=aios`, see runtime.ts). The panel opens its own detail drawer for the
 * selected character, so the selection has to be one thing on both sides:
 *
 * - office → panel: every selection change (select, deselect by clicking the
 *   same character or empty floor, seat reassignment, Escape) is announced;
 * - panel → office: closing the drawer releases the selection and the camera
 *   follow, instead of leaving the camera stuck on a character.
 *
 * Only the id and display name cross the frame boundary.
 */
import type { OfficeState } from './office/engine/officeState.js';
import { contentBox, type LayoutExtent } from './office/projection.js';
import { TILE_SIZE } from './office/types.js';

/** The character whose detail the panel should show: a sub-agent's parent. */
function hostFocus(os: OfficeState): { id: number | null; name: string | null } {
  const id = os.selectedAgentId;
  if (id === null) return { id: null, name: null };
  const focusId = os.subagentMeta.get(id)?.parentAgentId ?? id;
  return { id: focusId, name: os.characters.get(focusId)?.agentName ?? null };
}

export function tellHostSelection(os: OfficeState): void {
  if (window.parent === window) return;
  window.parent.postMessage({ source: 'pixel-agents', type: 'agentSelect', ...hostFocus(os) }, '*');
}

/** CSS px of the frame's right edge the panel's drawer covers. The frame keeps
 *  its size — a resize shifts the whole office by half the difference in one
 *  frame — and the camera centers the followed character in what's left. */
let insetRight = 0;
export const hostInsetRight = (): number => insetRight;

/** Letting go of a character glides the camera back to the office center —
 *  the drawer is gone, and the panel's room is centered by design. Read and
 *  cleared by the OfficeCanvas camera loop. */
let recenter = false;
export const requestRecenter = (): void => {
  recenter = true;
};
export const recenterPending = (): boolean => recenter;
export const recenterDone = (): void => {
  recenter = false;
};

function release(os: OfficeState): boolean {
  if (os.selectedAgentId === null && os.cameraFollowId === null) return false;
  os.selectedAgentId = null;
  os.cameraFollowId = null;
  requestRecenter();
  return true;
}

/** Listens to the panel and to Escape. Returns the cleanup. */
export function listenToHost(os: OfficeState): () => void {
  const onMessage = (e: MessageEvent) => {
    if (e.source !== window.parent) return;
    const m = e.data as { source?: unknown; type?: unknown; right?: unknown } | null;
    if (m?.source !== 'aios') return;
    if (m.type === 'deselectAgent') release(os);
    if (m.type === 'viewportInset') {
      insetRight = typeof m.right === 'number' && m.right > 0 ? m.right : 0;
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && release(os)) tellHostSelection(os);
  };
  window.addEventListener('message', onMessage);
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('keydown', onKey);
  };
}

/** Largest integer zoom that fits the occupied part of the layout with some
 *  air around it. The upstream default (2 × dpr) leaves the office small in
 *  the panel's wide stage; this only ever raises it. */
export function fittedZoom(
  layout: LayoutExtent,
  canvasWidth: number,
  canvasHeight: number,
  min: number,
  max: number,
): number {
  const box = contentBox(layout);
  const fit = Math.floor(
    Math.min(
      (canvasWidth * 0.9) / (box.cols * TILE_SIZE),
      (canvasHeight * 0.86) / (box.rows * TILE_SIZE),
    ),
  );
  return Math.max(min, Math.min(max, fit));
}
