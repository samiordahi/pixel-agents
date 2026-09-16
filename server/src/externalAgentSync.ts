import type { AgentStateStore } from './agentStateStore.js';
import type { AgentState } from './types.js';

export type ExternalAgentStatus = 'active' | 'waiting' | 'idle' | 'error';

export interface ExternalAgentSnapshot {
  key: string;
  name: string;
  folderName: string;
  status: ExternalAgentStatus;
  activity?: string;
  toolName?: string;
  updatedAt?: string;
  palette?: number;
  hueShift?: number;
}

export interface ExternalProviderSnapshot {
  projectDir: string;
  agents: ExternalAgentSnapshot[];
}

const KEY = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const ACTIVE_TOOL_PREFIX = 'external-provider:';

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : undefined;
}

export function parseExternalProviderSnapshot(value: unknown): ExternalProviderSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { projectDir?: unknown; agents?: unknown };
  const projectDir = cleanText(raw.projectDir, 1024);
  if (!projectDir || !Array.isArray(raw.agents) || raw.agents.length > 64) return null;

  const agents: ExternalAgentSnapshot[] = [];
  const keys = new Set<string>();
  const palettes = new Set<number>();
  for (const item of raw.agents) {
    if (!item || typeof item !== 'object') return null;
    const agent = item as Record<string, unknown>;
    const key = cleanText(agent.key, 80);
    const name = cleanText(agent.name, 80);
    const folderName = cleanText(agent.folderName, 120);
    const status = agent.status;
    if (!key || !KEY.test(key) || keys.has(key) || !name || !folderName) return null;
    if (!['active', 'waiting', 'idle', 'error'].includes(String(status))) return null;
    const palette = Number.isInteger(agent.palette) ? Number(agent.palette) : undefined;
    // Um personagem representa uma identidade. Repetir a mesma folha em dois
    // agentes torna a sala ambígua; snapshots colidentes são recusados inteiros.
    if (palette !== undefined && (palette < 0 || palette > 255 || palettes.has(palette)))
      return null;
    keys.add(key);
    if (palette !== undefined) palettes.add(palette);
    agents.push({
      key,
      name,
      folderName,
      status: status as ExternalAgentStatus,
      activity: cleanText(agent.activity, 160),
      toolName: cleanText(agent.toolName, 80),
      updatedAt: cleanText(agent.updatedAt, 40),
      palette,
      hueShift: Number.isInteger(agent.hueShift) ? Number(agent.hueShift) : undefined,
    });
  }
  return { projectDir, agents };
}

function createAgent(
  store: AgentStateStore,
  providerId: string,
  projectDir: string,
  snapshot: ExternalAgentSnapshot,
): AgentState {
  const id = store.nextAgentId.current++;
  return {
    id,
    sessionId: `${providerId}:${snapshot.key}`,
    isExternal: true,
    projectDir,
    jsonlFile: '',
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    backgroundAgentToolIds: new Set(),
    isWaiting: snapshot.status !== 'active',
    permissionSent: false,
    hadToolsInTurn: snapshot.status === 'active',
    folderName: snapshot.folderName,
    lastDataAt: Date.parse(snapshot.updatedAt ?? '') || Date.now(),
    linesProcessed: 0,
    seenUnknownRecordTypes: new Set(),
    hookDelivered: true,
    hooksOnly: true,
    providerId,
    contextTokens: 0,
    maxContextTokens: 0,
    agentName: snapshot.name,
    palette: snapshot.palette,
    hueShift: snapshot.hueShift,
  };
}

function clearActivity(store: AgentStateStore, agent: AgentState): void {
  if (agent.activeToolIds.size === 0) return;
  for (const toolId of agent.activeToolIds)
    store.broadcast({ type: 'agentToolDone', id: agent.id, toolId });
  agent.activeToolIds.clear();
  agent.activeToolStatuses.clear();
  agent.activeToolNames.clear();
  store.broadcast({ type: 'agentToolsClear', id: agent.id });
}

function applySnapshot(
  store: AgentStateStore,
  agent: AgentState,
  snapshot: ExternalAgentSnapshot,
): void {
  const previousStatus = agent.externalStatus;
  agent.agentName = snapshot.name;
  agent.folderName = snapshot.folderName;
  agent.palette = snapshot.palette;
  agent.hueShift = snapshot.hueShift;
  agent.lastDataAt = Date.parse(snapshot.updatedAt ?? '') || Date.now();
  const active = snapshot.status === 'active';
  const awaitingInput = snapshot.status === 'waiting' || snapshot.status === 'error';
  agent.isWaiting = !active;
  agent.externalStatus = snapshot.status;

  if (!active) {
    clearActivity(store, agent);
    // Idle is a resting state, not a newly finished task. It must clear old
    // bubbles without producing the chime/checkmark used by real transitions.
    if (previousStatus !== snapshot.status) {
      store.broadcast({
        type: 'agentStatus',
        id: agent.id,
        status: snapshot.status === 'idle' ? 'idle' : 'waiting',
        awaitingInput,
      });
    }
    return;
  }

  if (previousStatus !== 'active') {
    store.broadcast({ type: 'agentStatus', id: agent.id, status: 'active', awaitingInput: false });
  }
  const toolId = `${ACTIVE_TOOL_PREFIX}${snapshot.key}`;
  const status = snapshot.activity ?? 'Trabalhando no projeto';
  const toolName = snapshot.toolName ?? 'Agent';
  if (
    agent.activeToolIds.has(toolId) &&
    agent.activeToolStatuses.get(toolId) === status &&
    agent.activeToolNames.get(toolId) === toolName
  )
    return;
  clearActivity(store, agent);
  agent.activeToolIds.add(toolId);
  agent.activeToolStatuses.set(toolId, status);
  agent.activeToolNames.set(toolId, toolName);
  store.broadcast({ type: 'agentToolStart', id: agent.id, toolId, status, toolName });
}

/** Reconciles one provider's complete snapshot without touching other providers. */
export function syncExternalProvider(
  store: AgentStateStore,
  providerId: string,
  snapshot: ExternalProviderSnapshot,
): { added: number; updated: number; removed: number } {
  const existing = new Map<string, AgentState>();
  for (const agent of store.values()) {
    if (agent.providerId === providerId && agent.hooksOnly) existing.set(agent.sessionId, agent);
  }

  let added = 0;
  let updated = 0;
  const keep = new Set<string>();
  for (const item of snapshot.agents) {
    const sessionId = `${providerId}:${item.key}`;
    keep.add(sessionId);
    let agent = existing.get(sessionId);
    if (!agent) {
      agent = createAgent(store, providerId, snapshot.projectDir, item);
      store.set(agent.id, agent);
      added++;
    } else {
      updated++;
    }
    applySnapshot(store, agent, item);
  }

  let removed = 0;
  for (const [sessionId, agent] of existing) {
    if (!keep.has(sessionId)) {
      store.delete(agent.id);
      removed++;
    }
  }
  return { added, updated, removed };
}
