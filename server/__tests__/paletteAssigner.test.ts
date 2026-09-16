import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { parseCharacterRules } from '../src/configPersistence.js';
import { HUE_SHIFT_MAX_DEG, PALETTE_COUNT } from '../src/constants.js';
import {
  assignPaletteIfNeeded,
  paletaFixada,
  setCharacterRules,
  setPaletteCount,
} from '../src/paletteAssigner.js';
import type { AgentState } from '../src/types.js';

function createTestAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 1,
    sessionId: 'sess-1',
    terminalRef: undefined,
    isExternal: false,
    projectDir: '/test',
    jsonlFile: '/test/session.jsonl',
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    backgroundAgentToolIds: new Set(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastDataAt: 0,
    linesProcessed: 0,
    seenUnknownRecordTypes: new Set(),
    hookDelivered: false,
    contextTokens: 0,
    maxContextTokens: 200_000,
    ...overrides,
  } as AgentState;
}

describe('paletteAssigner', () => {
  let store: AgentStateStore;

  beforeEach(() => {
    store = new AgentStateStore();
  });

  afterEach(() => {
    // Reset module-level state so tests don't leak into each other.
    setPaletteCount(PALETTE_COUNT);
    setCharacterRules([]);
  });

  describe('assignPaletteIfNeeded', () => {
    it('is a no-op when palette is already set', () => {
      const agent = createTestAgent({ id: 1, palette: 3, hueShift: 10 });
      assignPaletteIfNeeded(agent, store);
      expect(agent.palette).toBe(3);
      expect(agent.hueShift).toBe(10);
    });

    it('assigns a palette in [0, PALETTE_COUNT) with no hue shift on an empty store (first round)', () => {
      const agent = createTestAgent({ id: 1 });
      assignPaletteIfNeeded(agent, store);
      expect(agent.palette).toBeGreaterThanOrEqual(0);
      expect(agent.palette).toBeLessThan(PALETTE_COUNT);
      expect(agent.hueShift).toBe(0);
    });

    it('picks a least-used palette (one of the palettes at the minimum count)', () => {
      // Seed counts: 0->3, 1->2, 2..6->1. minCount=1,
      // available = [2, 3, 4, 5, 6].
      const palettes = [0, 0, 0, 1, 1, 2, 3, 4, 5, 6];
      for (let i = 0; i < palettes.length; i++) {
        store.set(100 + i, createTestAgent({ id: 100 + i, palette: palettes[i], hueShift: 0 }));
      }
      const agent = createTestAgent({ id: 1 });
      assignPaletteIfNeeded(agent, store);
      expect([2, 3, 4, 5, 6]).toContain(agent.palette);
      // minCount > 0 → hue shift in [45, 315].
      expect(agent.hueShift).toBeGreaterThanOrEqual(45);
      expect(agent.hueShift).toBeLessThanOrEqual(HUE_SHIFT_MAX_DEG);
    });

    it('counts only agents with a defined in-range palette', () => {
      // Two agents with undefined palette and one out-of-range must not move
      // the minCount, so the first real assignment stays in the first round
      // (hueShift === 0) and can pick any of [0..6].
      store.set(10, createTestAgent({ id: 10 })); // palette undefined
      store.set(11, createTestAgent({ id: 11, palette: 99 })); // out of range
      const agent = createTestAgent({ id: 1 });
      assignPaletteIfNeeded(agent, store);
      expect(agent.palette).toBeGreaterThanOrEqual(0);
      expect(agent.palette).toBeLessThan(PALETTE_COUNT);
      expect(agent.hueShift).toBe(0);
    });

    it('does not mutate the store', () => {
      store.set(1, createTestAgent({ id: 1, palette: 2, hueShift: 0 }));
      const before = new Map<number, AgentState>();
      for (const [id, a] of store) before.set(id, { ...a });

      const agent = createTestAgent({ id: 2 });
      assignPaletteIfNeeded(agent, store);

      for (const [id, a] of store) {
        const prev = before.get(id);
        expect(prev).toBeDefined();
        expect(a.palette).toBe(prev?.palette);
        expect(a.hueShift).toBe(prev?.hueShift);
      }
    });
  });

  describe('setPaletteCount', () => {
    it('picks from [0, N) when set above the default 7', () => {
      setPaletteCount(8);
      // Seven agents get 0..6; the eighth must pick from [0, 8) -- if the
      // count were still 7, it would re-pick 0..6 and never 7.
      for (let i = 0; i < 7; i++) {
        store.set(100 + i, createTestAgent({ id: 100 + i, palette: i, hueShift: 0 }));
      }
      // minCount across 0..6 is 1, and palette 7 is at count 0.
      const agent = createTestAgent({ id: 999 });
      assignPaletteIfNeeded(agent, store);
      expect(agent.palette).toBe(7);
      expect(agent.hueShift).toBe(0); // minCount === 0 for 7
    });
  });

  describe('characterRules (fork-local)', () => {
    /**
     * Põe um agente já usando `palette` no store, para o sorteio por
     * diversidade nunca escolher esse índice. Sem isso, um teste que afirma
     * "não caiu na regra" falha de vez em quando por puro azar: o sorteio pode
     * devolver o mesmo número que a regra apontava, e o teste não sabe
     * distinguir uma coisa da outra.
     */
    const ocupa = (palette: number) =>
      store.set(900 + palette, createTestAgent({ id: 900 + palette, palette, hueShift: 0 }));

    it('pins the palette when a rule matches, ignoring the diversity draw', () => {
      setPaletteCount(10);
      // O 'match' é substring literal: aqui tem que ser 'ordahi aios' com
      // espaço, porque é o que está no caminho. Slug com hífen não casa.
      setCharacterRules([{ match: 'ordahi aios', palette: 6, field: 'any' }]);
      const agent = createTestAgent({ id: 1, projectDir: 'D:/Documentos/Ordahi AIOS' });
      assignPaletteIfNeeded(agent, store);
      expect(agent.palette).toBe(6);
      expect(agent.hueShift).toBe(0);
    });

    it('overrides a palette that was already persisted', () => {
      // The whole point: editing the rules has to take effect on an agent that
      // already got a random palette, or the feature looks broken.
      setPaletteCount(10);
      setCharacterRules([{ match: 'bella', palette: 7, field: 'agentName' }]);
      const agent = createTestAgent({ id: 1, agentName: 'Bella', palette: 2, hueShift: 130 });
      assignPaletteIfNeeded(agent, store);
      expect(agent.palette).toBe(7);
      expect(agent.hueShift).toBe(0);
    });

    it('leaves the upstream path alone when nothing matches', () => {
      setCharacterRules([{ match: 'nao-existe', palette: 6, field: 'any' }]);
      const agent = createTestAgent({ id: 1, palette: 3, hueShift: 55 });
      assignPaletteIfNeeded(agent, store);
      expect(agent.palette).toBe(3);
      expect(agent.hueShift).toBe(55);
    });

    it('honours rule order — the first match wins', () => {
      setPaletteCount(10);
      setCharacterRules([
        { match: 'growth', palette: 9, field: 'agentName' },
        { match: 'tars', palette: 8, field: 'agentName' },
      ]);
      const agent = createTestAgent({ id: 1, agentName: 'Tars Growth' });
      assignPaletteIfNeeded(agent, store);
      expect(agent.palette).toBe(9);
    });

    it('respects the field restriction instead of matching anywhere', () => {
      setPaletteCount(10);
      ocupa(6);
      setCharacterRules([{ match: 'cody', palette: 6, field: 'agentName' }]);
      // 'cody' is in the path, but the rule only looks at agentName.
      const agent = createTestAgent({ id: 1, projectDir: '/repos/cody', agentName: 'Bella' });
      assignPaletteIfNeeded(agent, store);
      expect(agent.palette).not.toBe(6);
    });

    it('casa a sessão principal por role, que é quem não tem agentName', () => {
      setPaletteCount(10);
      setCharacterRules([{ match: 'lead', palette: 6, field: 'role' }]);
      const principal = createTestAgent({ id: 1, projectDir: '/qualquer/pasta' });
      assignPaletteIfNeeded(principal, store);
      expect(principal.palette).toBe(6);
    });

    it('não pinta o subagente com a regra do lead', () => {
      setPaletteCount(10);
      ocupa(6);
      setCharacterRules([{ match: 'lead', palette: 6, field: 'role' }]);
      const subagente = createTestAgent({ id: 1, agentName: 'Explore' });
      assignPaletteIfNeeded(subagente, store);
      expect(subagente.palette).not.toBe(6);
    });

    it('deixa a regra por nome ganhar do lead quando vem antes', () => {
      setPaletteCount(10);
      setCharacterRules([
        { match: 'stella', palette: 8, field: 'agentName' },
        { match: 'lead', palette: 6, field: 'role' },
      ]);
      const colega = createTestAgent({ id: 1, agentName: 'Stella Sales' });
      const principal = createTestAgent({ id: 2 });
      assignPaletteIfNeeded(colega, store);
      assignPaletteIfNeeded(principal, store);
      expect(colega.palette).toBe(8);
      expect(principal.palette).toBe(6);
    });

    it('mantém role fora do any — campo derivado não entra na busca ampla', () => {
      setPaletteCount(10);
      ocupa(6);
      setCharacterRules([{ match: 'lead', palette: 6, field: 'any' }]);
      const principal = createTestAgent({ id: 1 });
      assignPaletteIfNeeded(principal, store);
      expect(principal.palette).not.toBe(6);
    });

    it('paletaFixada devolve o pino, e null para quem não casa', () => {
      setPaletteCount(10);
      setCharacterRules([{ match: 'lead', palette: 6, field: 'role' }]);
      expect(paletaFixada(createTestAgent({ id: 1 }))).toBe(6);
      expect(paletaFixada(createTestAgent({ id: 2, agentName: 'Explore' }))).toBeNull();
    });

    it('paletaFixada apara o pino contra as folhas carregadas', () => {
      setPaletteCount(6); // o diretório externo saiu
      setCharacterRules([{ match: 'lead', palette: 8, field: 'role' }]);
      expect(paletaFixada(createTestAgent({ id: 1 }))).toBe(5);
    });

    it('clamps a rule that points past the sheets actually loaded', () => {
      setPaletteCount(6); // o diretório externo saiu; char_9 não existe mais
      setCharacterRules([{ match: 'cody', palette: 9, field: 'any' }]);
      const agent = createTestAgent({ id: 1, agentName: 'Cody' });
      assignPaletteIfNeeded(agent, store);
      expect(agent.palette).toBe(5);
    });

    it('drops malformed rules instead of throwing', () => {
      const regras = parseCharacterRules([
        { match: 'ok', palette: 6 },
        { match: '', palette: 1 },
        { match: 'sem-palette' },
        { match: 'negativa', palette: -1 },
        { match: 'fracionada', palette: 1.5 },
        'lixo',
        null,
        { match: 'campo-invalido', palette: 2, field: 'inventado' },
      ]);
      expect(regras).toEqual([
        { match: 'ok', palette: 6, field: 'any' },
        { match: 'campo-invalido', palette: 2, field: 'any' },
      ]);
    });
  });
});
