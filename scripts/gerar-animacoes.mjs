#!/usr/bin/env node
/**
 * gerar-animacoes.mjs — FORK-LOCAL
 *
 * Pede à PixelLab as três animações de cada agente e deixa os quadros crus em
 * disco. É o único script daqui que fala com a rede; o `animar-agentes.mjs`
 * depois só lê o que ele escreveu.
 *
 *   node scripts/gerar-animacoes.mjs [--raw DIR] [--so Cody]
 *
 * ── Por que existe, em vez de baixar na mão ──────────────────────────────
 *
 * São 9 chamadas por agente (3 animações × 3 direções) atrás de um teto de 8
 * jobs simultâneos, cada uma levando minutos, e a API cai de vez em quando.
 * Feito à mão, metade fica pelo caminho e ninguém sabe qual. O script é
 * **retomável**: ele pergunta o que já existe antes de pedir, então rodar de
 * novo depois de uma queda continua de onde parou em vez de gastar geração
 * duplicada.
 *
 * ── O segredo não mora aqui ──────────────────────────────────────────────
 *
 * O token sai de `PIXELLAB_SECRET` ou, se não estiver no ambiente, da config
 * do MCP em `~/.claude.json` — onde ela já o guardou. Nada de credencial em
 * arquivo versionado.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const RAW_PADRAO = 'D:/Documentos/pixel-agents-assets/ordahi-office/raw';

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const RAW = arg('--raw', RAW_PADRAO);
const SO = arg('--so', null);

/**
 * Os personagens que a PixelLab guarda. O Cody e a Stella são a arte que ela
 * já tinha; a Bella foi rotacionada a partir do sprite dela com
 * `create_character` em modo v3 + `reference_image_base64` — que gira o teu
 * sprite em 8 direções em vez de inventar um personagem novo.
 *
 * A ordem aqui não significa nada; quem numera os personagens é o
 * `build-characters.mjs`.
 */
const AGENTES = [
  { nome: 'Cody', id: 'a1c86c9a-d164-49b5-a161-205db0ce65e5' },
  { nome: 'Bella Banker', id: 'beb94682-bacd-4e97-8f6d-9da60fe233a6' },
  { nome: 'Stella Sales', id: '86731fae-1f8f-4a61-b92d-e75cf726a794' },
];

/**
 * Três animações, três direções. A esquerda não se pede — o app espelha a
 * direita sozinho, e pedir seria pagar por um quadro que ele descarta.
 *
 * O andar vem de **template**: 1 geração por direção contra o mesmo esqueleto,
 * que é o que faz os três agentes andarem no mesmo ritmo. Digitar e ler não
 * têm template, então vão em `v3` com descrição — e a descrição fala só de
 * corpo (braços, mãos, cabeça), porque objeto e cenário na frase puxam o
 * modelo para desenhar a mesa em vez da pose.
 */
const ANIMACOES = [
  { nome: 'andar', template: 'walking-8-frames' },
  {
    nome: 'digitando',
    desc: 'typing, standing in place, both forearms raised forward at chest height, fingers tapping, elbows bent',
  },
  {
    nome: 'lendo',
    desc: 'reading, standing in place, both hands holding a page up at chest height, head tilted down',
  },
];
const DIRECOES = ['south', 'north', 'east'];

// ── cliente MCP por HTTP ──────────────────────────────────────────────────

function autorizacao() {
  if (process.env.PIXELLAB_SECRET) return `Bearer ${process.env.PIXELLAB_SECRET}`;
  const cfg = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8'));
  for (const projeto of Object.values(cfg.projects || {})) {
    const px = projeto?.mcpServers?.pixellab;
    if (px?.headers?.Authorization) return px.headers.Authorization;
  }
  throw new Error('sem token: defina PIXELLAB_SECRET ou configure o MCP pixellab');
}

const URL_MCP = 'https://api.pixellab.ai/mcp';
const AUTH = autorizacao();
let sessao = null;
let seq = 0;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function rpc(method, params, notificacao = false) {
  const corpo = notificacao
    ? { jsonrpc: '2.0', method, params }
    : { jsonrpc: '2.0', id: ++seq, method, params };
  const headers = {
    Authorization: AUTH,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-06-18',
  };
  if (sessao) headers['mcp-session-id'] = sessao;

  // A API cai de vez em quando, e uma queda no meio de 27 chamadas longas
  // custa a corrida inteira. Tentar de novo é mais barato que recomeçar.
  let res = null;
  let ultimo = null;
  for (let t = 0; t < 6; t++) {
    try {
      res = await fetch(URL_MCP, { method: 'POST', headers, body: JSON.stringify(corpo) });
      break;
    } catch (e) {
      ultimo = e;
      await espera(3000 * (t + 1));
    }
  }
  if (!res) throw ultimo;

  const sid = res.headers.get('mcp-session-id');
  if (sid) sessao = sid;
  const texto = await res.text();
  if (notificacao) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${texto.slice(0, 400)}`);
  if (texto.includes('data: ')) {
    const dados = texto
      .split('\n')
      .filter((l) => l.startsWith('data: '))
      .map((l) => l.slice(6));
    return JSON.parse(dados[dados.length - 1]);
  }
  return JSON.parse(texto);
}

async function ferramenta(nome, args) {
  const r = await rpc('tools/call', { name: nome, arguments: args });
  if (r.error) throw new Error(JSON.stringify(r.error));
  return (r.result.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

// ── corrida ───────────────────────────────────────────────────────────────

await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'ordahi-gerar-animacoes', version: '1.0.0' },
});
await rpc('notifications/initialized', {}, true);

const alvos = AGENTES.filter((a) => !SO || a.nome.toLowerCase().includes(SO.toLowerCase()));
if (!alvos.length) {
  console.error(`✗ nenhum agente casa com --so ${SO}`);
  process.exit(1);
}

/** O grupo aparece na ficha assim que a animação existe — é o "já tem". */
const temAnimacao = (ficha, nome) => ficha.includes(`  ${nome} —`);

// 1. Pedir o que falta. O teto é de 8 jobs simultâneos e cada animação come 3.
for (const ag of alvos) {
  for (const an of ANIMACOES) {
    const ficha = await ferramenta('get_character', { character_id: ag.id });
    if (temAnimacao(ficha, an.nome)) {
      log('já existe:', ag.nome, an.nome);
      continue;
    }
    const args = { character_id: ag.id, animation_name: an.nome, directions: DIRECOES };
    if (an.template) {
      args.template_animation_id = an.template;
      args.ai_freedom = 0;
    } else {
      args.mode = 'v3';
      args.action_description = an.desc;
      args.frame_count = 4;
    }
    for (let t = 0; t < 40; t++) {
      const saida = await ferramenta('animate_character', args);
      if (!/job slots/.test(saida)) {
        log('pedido:', ag.nome, an.nome);
        break;
      }
      log('sem vaga —', ag.nome, an.nome, '· espero 45s');
      await espera(45000);
    }
  }
}

// 2. Esperar todas ficarem prontas.
for (let t = 0; ; t++) {
  const fichas = {};
  let faltam = 0;
  for (const ag of alvos) {
    fichas[ag.nome] = await ferramenta('get_character', { character_id: ag.id });
    faltam += ANIMACOES.filter((an) => !temAnimacao(fichas[ag.nome], an.nome)).length;
  }
  if (!faltam) {
    // 3. Baixar. Uma linha da ficha traz todos os quadros de uma direção.
    for (const ag of alvos) {
      let atual = null;
      for (const linha of fichas[ag.nome].split('\n')) {
        const cabecalho = linha.match(/^ {2}(\S[^—]*)— \d+ dir/);
        if (cabecalho) {
          atual = cabecalho[1].trim();
          continue;
        }
        const dir = linha.match(/^ {4}([a-z-]+): (https\S+)/);
        if (!dir || !ANIMACOES.some((a) => a.nome === atual)) continue;
        const urls = linha.slice(linha.indexOf('http')).split(', ');
        const destino = join(RAW, ag.nome, atual, dir[1]);
        mkdirSync(destino, { recursive: true });
        for (let n = 0; n < urls.length; n++) {
          const res = await fetch(urls[n].trim());
          writeFileSync(join(destino, `${n}.png`), Buffer.from(await res.arrayBuffer()));
        }
        log('baixado:', ag.nome, atual, dir[1], `${urls.length} quadros`);
      }
    }
    console.log(`\nQuadros crus em ${RAW}`);
    console.log('Agora: node scripts/animar-agentes.mjs');
    process.exit(0);
  }
  if (t > 120) throw new Error(`tempo esgotado — ainda faltam ${faltam} animação(ões)`);
  log('faltam', faltam, 'animação(ões)');
  await espera(30000);
}
