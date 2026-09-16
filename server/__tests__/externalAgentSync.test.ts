import { describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { parseExternalProviderSnapshot, syncExternalProvider } from '../src/externalAgentSync.js';

const snapshot = (status: 'active' | 'waiting' | 'idle' | 'error' = 'active') => ({
  projectDir: 'D:\\Documentos\\Ordahi AIOS',
  agents: [
    {
      key: 'codex',
      name: 'Codex',
      folderName: 'Ordahi AIOS · local',
      status,
      activity: 'Editando o Painel',
      toolName: 'Edit',
      updatedAt: '2026-09-15T15:00:00.000Z',
      palette: 4,
    },
  ],
});

describe('external provider snapshots', () => {
  it('rejects malformed, duplicate and unbounded actors', () => {
    expect(
      parseExternalProviderSnapshot({ projectDir: 'x', agents: [{ key: '../x' }] }),
    ).toBeNull();
    expect(
      parseExternalProviderSnapshot({
        projectDir: 'x',
        agents: [
          { key: 'same', name: 'A', folderName: 'x', status: 'idle' },
          { key: 'same', name: 'B', folderName: 'x', status: 'idle' },
        ],
      }),
    ).toBeNull();
    expect(
      parseExternalProviderSnapshot({ projectDir: 'x', agents: new Array(65).fill({}) }),
    ).toBeNull();
    expect(
      parseExternalProviderSnapshot({
        projectDir: 'x',
        agents: [
          { key: 'claude', name: 'Claude', folderName: 'x', status: 'idle', palette: 3 },
          { key: 'codex', name: 'Codex', folderName: 'x', status: 'idle', palette: 3 },
        ],
      }),
    ).toBeNull();
  });

  it('adds, updates and removes only the selected provider', () => {
    const store = new AgentStateStore();
    const messages: Record<string, unknown>[] = [];
    store.on('broadcast', (message) => messages.push(message));

    const first = syncExternalProvider(store, 'aios', snapshot());
    expect(first).toEqual({ added: 1, updated: 0, removed: 0 });
    const agent = [...store.values()][0];
    expect(agent.agentName).toBe('Codex');
    expect(agent.providerId).toBe('aios');
    expect(agent.palette).toBe(4);
    expect(messages.some((m) => m.type === 'agentToolStart' && m.toolName === 'Edit')).toBe(true);

    syncExternalProvider(store, 'aios', {
      ...snapshot(),
      agents: [{ ...snapshot().agents[0], palette: 5 }],
    });
    expect(agent.palette).toBe(5);

    messages.length = 0;
    const waiting = syncExternalProvider(store, 'aios', snapshot('waiting'));
    expect(waiting).toEqual({ added: 0, updated: 1, removed: 0 });
    expect(messages.some((m) => m.type === 'agentToolsClear')).toBe(true);
    expect(messages.some((m) => m.type === 'agentStatus' && m.awaitingInput === true)).toBe(true);

    messages.length = 0;
    syncExternalProvider(store, 'aios', snapshot('waiting'));
    expect(messages.some((m) => m.type === 'agentStatus')).toBe(false);

    syncExternalProvider(store, 'aios', snapshot('idle'));
    expect(messages.some((m) => m.type === 'agentStatus' && m.status === 'idle')).toBe(true);
    messages.length = 0;
    syncExternalProvider(store, 'aios', snapshot('idle'));
    expect(messages.some((m) => m.type === 'agentStatus')).toBe(false);

    const removed = syncExternalProvider(store, 'aios', { ...snapshot(), agents: [] });
    expect(removed).toEqual({ added: 0, updated: 0, removed: 1 });
    expect(store.size).toBe(0);
  });
});
