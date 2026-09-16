/**
 * Server-side palette assignment helper.
 *
 * Assigns palette and hueShift to agents when they're created, ensuring
 * consistent character appearance across all connected clients.
 */

import { pickDiversePalette } from '../../core/src/paletteUtils.js';
import type { AgentStateStore } from './agentStateStore.js';
import type { CharacterRule } from './configPersistence.js';
import { PALETTE_COUNT } from './constants.js';
import type { AgentState } from './types.js';

/**
 * Runtime palette count. External asset directories can add char_N.png
 * beyond the bundled 6 (loadExternalCharacterSprites accepts any N), so the
 * count is dynamic. Defaults to PALETTE_COUNT until setPaletteCount is
 * called after assets load. Mirrors the setHookProvider / setTeamSwitch
 * module-level setter pattern in transcriptParser.ts.
 */
let currentPaletteCount = PALETTE_COUNT;

/** Set the palette count after asset loading (standalone + VS Code). */
export function setPaletteCount(count: number): void {
  currentPaletteCount = Math.max(1, Math.floor(count));
}

/**
 * FORK-LOCAL: the name → character pins, from config.json. Same module-level
 * setter pattern as the count above, and set from the same place, so every
 * entry point (standalone startup and reload, VS Code startup and reload) sees
 * the same rules without four scattered calls.
 */
let currentRules: CharacterRule[] = [];

/** Replace the character rules after config load. */
export function setCharacterRules(rules: CharacterRule[]): void {
  currentRules = rules;
}

/**
 * The four things an agent can be recognized by, in the order `field: 'any'`
 * tries them. Most specific first: a team ROLE names a person, a project
 * directory only names where they happen to be working.
 */
function identidade(agent: AgentState): Record<string, string | undefined> {
  return {
    agentName: agent.agentName,
    teamName: agent.teamName,
    folderName: agent.folderName,
    projectDir: agent.projectDir,
  };
}

/**
 * FORK-LOCAL: o papel do agente como texto — `lead` para a sessão principal,
 * `teammate` para subagente ou colega de time.
 *
 * Existe porque a sessão principal **não tem nome**: `agentName` só é
 * preenchido para quem é colega de alguém (`transcriptParser.linkTeammates`
 * acha o lead justamente procurando quem está sem ele). Sem este campo não há
 * como escrever "a conversa principal é sempre o Cody" — a única aproximação
 * seria casar o caminho do projeto, o que erraria por dois lados: pegaria os
 * subagentes do mesmo projeto junto, e perderia o lead assim que ela abrisse
 * uma sessão em outra pasta.
 *
 * Fora do `any` de propósito. Os outros quatro campos são nomes que a Samira
 * escreveu em algum lugar; este é derivado por nós, e uma regra ampla que
 * caísse nele por acaso pintaria o escritório inteiro sem ninguém entender por
 * quê. Quem quer o papel pede o papel.
 */
function papel(agent: AgentState): string {
  return agent.agentName ? 'teammate' : 'lead';
}

/**
 * FORK-LOCAL: o personagem que uma regra fixa para este agente, ou `null` se
 * nenhuma casa.
 *
 * Separado de `assignPaletteIfNeeded` porque a atribuição não é o único lugar
 * onde um palette entra: o cliente devolve os assentos (`saveAgentSeats`) com o
 * palette que ele lembra, e sem consultar as regras ali o servidor atribui o
 * personagem certo e o cliente o desfaz meio segundo depois — com a agravante
 * de que o valor lembrado pode ser de antes da regra existir, então o pino
 * pareceria não funcionar sem nada no log.
 *
 * Aparado, não descartado: uma regra apontando além das folhas realmente
 * carregadas (diretório externo removido, char_N apagado) deve cair num
 * personagem real, e não num índice fora de faixa que o renderizador dobraria
 * por módulo em alguém arbitrário.
 */
export function paletaFixada(agent: AgentState): number | null {
  const regra = regraPara(agent);
  return regra ? Math.min(regra.palette, currentPaletteCount - 1) : null;
}

/** First rule whose substring is in the requested field, or null. */
function regraPara(agent: AgentState): CharacterRule | null {
  if (currentRules.length === 0) return null;
  const campos = identidade(agent);
  for (const regra of currentRules) {
    let alvo: (string | undefined)[];
    if (regra.field === 'role') alvo = [papel(agent)];
    else if (regra.field && regra.field !== 'any') alvo = [campos[regra.field]];
    else alvo = Object.values(campos);
    const agulha = regra.match.toLowerCase();
    if (alvo.some((v) => typeof v === 'string' && v.toLowerCase().includes(agulha))) return regra;
  }
  return null;
}

/**
 * Assign palette and hueShift to an agent if not already set.
 * Uses the diversity algorithm to pick a palette that's least used among
 * existing agents.
 *
 * FORK-LOCAL: a matching character rule short-circuits all of that, and does so
 * **even when a palette is already persisted**. That asymmetry is the point.
 * The early return exists so a restart doesn't recolor everyone, and a drawn
 * palette has nothing better to become. A rule is different: it is the user
 * saying who this agent IS, so it has to win over whatever the draw left
 * behind — otherwise editing the rules does nothing until every agent that
 * ever ran is forgotten, and the feature reads as broken.
 *
 * `hueShift` goes to 0 on a rule hit for the same reason: the sheet was made
 * to look like that person, and rotating its hue is exactly the thing a pin is
 * supposed to stop.
 *
 * @param agent - The agent to assign a palette to (mutated in place)
 * @param store - The agent state store (used to count existing palettes)
 */
export function assignPaletteIfNeeded(agent: AgentState, store: AgentStateStore): void {
  const fixada = paletaFixada(agent);
  if (fixada !== null) {
    agent.palette = fixada;
    agent.hueShift = 0;
    return;
  }

  if (agent.palette !== undefined) return;

  const count = currentPaletteCount;
  const paletteCounts = new Array(count).fill(0);
  for (const existing of store.values()) {
    if (existing.palette !== undefined && existing.palette < count) {
      paletteCounts[existing.palette]++;
    }
  }

  const pick = pickDiversePalette(count, paletteCounts);
  agent.palette = pick.palette;
  agent.hueShift = pick.hueShift;
}
