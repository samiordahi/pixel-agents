#!/usr/bin/env node
/**
 * animar-agentes.mjs — FORK-LOCAL
 *
 * Traduz as animações que a PixelLab gerou para as 21 posições que o
 * `build-characters.mjs` empacota.
 *
 *   node scripts/animar-agentes.mjs [--raw DIR] [--destino DIR] [--dry]
 *
 * ── O que ele substitui ──────────────────────────────────────────────────
 *
 * O `reduzir-agentes.mjs` resolvia **direção** e **escala** a partir de uma
 * rotação parada, e deixava as sete posições repetindo o mesmo quadro — o
 * agente tinha a cara certa mas não andava, não digitava e não lia. Este
 * script fecha o eixo que faltava: as poses vêm animadas da PixelLab, uma
 * sequência por direção, e aqui elas viram os 16×32 do app.
 *
 * ── De onde vem a arte ───────────────────────────────────────────────────
 *
 * Os personagens da PixelLab **são** os que ela desenhou: o Cody e a Stella já
 * estavam lá, e a Bella foi rotacionada a partir do sprite dela (`create_character`
 * em modo v3 com `reference_image_base64`, que gira o teu sprite em vez de
 * inventar um). Nada aqui vem de premade de terceiro.
 *
 * O `scripts/gerar-animacoes.mjs` é quem fala com a API e deixa os quadros
 * crus em `<raw>/<Agente>/<animação>/<direção>/N.png`. Este script só lê disco.
 *
 * ── Por que a escala é uma só ────────────────────────────────────────────
 *
 * Reduzir cada quadro pela própria caixa — que é o certo para um quadro
 * parado — dá a cada pose uma escala diferente: quem abre as pernas para andar
 * fica mais baixo que quem está de pé, e o agente pulsa de tamanho a cada
 * passo sem nada dar erro. A escala sai da **união** de todos os quadros do
 * agente, e o chão também; só o centro horizontal é por direção, senão o
 * boneco de perfil fica encostado numa borda do quadro.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PNG } from 'pngjs';

import { ALTURA_ALVO, LARGURA_MAX, caixa, previa, reduzir, uniao } from './_arte.mjs';

const RAW_PADRAO = 'D:/Documentos/pixel-agents-assets/ordahi-office/raw';
const DESTINO_PADRAO = 'D:/Documentos/Ordahi AIOS/brand-assets/agents-topdown';

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const RAW = arg('--raw', RAW_PADRAO);
const DESTINO = arg('--destino', DESTINO_PADRAO);
const SECO = process.argv.includes('--dry');

/** Como a PixelLab chama as direções × como o `folha.json` chama. */
const DIRECOES = [
  { app: 'baixo', px: 'south' },
  { app: 'cima', px: 'north' },
  { app: 'direita', px: 'east' },
];

/**
 * As 21 posições, na ordem que o `build-characters.mjs` espera.
 *
 * O andar sai de um ciclo de 8 quadros e o app toca `0,1,2,1`: os **contatos**
 * têm de cair em 0 e 2 e a **passada** em 1, ou o boneco patina. Num ciclo de
 * 8 os contatos são os quadros 0 e 4 (um pé à frente, depois o outro) e a
 * passada é o 2, no meio do caminho — daí `[0, 2, 4]`.
 *
 * Digitando e lendo são laços de dois quadros gerados com 4: pegar 0 e 2 pega
 * os dois extremos do laço, que é onde a diferença entre as mãos aparece.
 */
const POSICOES = [
  { rotulo: 'andar/contato-A', anim: 'andar', quadro: 0 },
  { rotulo: 'andar/passada', anim: 'andar', quadro: 2 },
  { rotulo: 'andar/contato-B', anim: 'andar', quadro: 4 },
  { rotulo: 'digitando/1', anim: 'digitando', quadro: 0 },
  { rotulo: 'digitando/2', anim: 'digitando', quadro: 2 },
  { rotulo: 'lendo/1', anim: 'lendo', quadro: 0 },
  { rotulo: 'lendo/2', anim: 'lendo', quadro: 2 },
];

const nomeArquivo = (dir, pos) => `${dir}-${pos.rotulo.replace('/', '-')}.png`;

/** Todos os quadros de uma direção, na ordem numérica que a API escreveu. */
function quadrosDe(pasta) {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta)
    .filter((f) => /^\d+\.png$/.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map((f) => PNG.sync.read(readFileSync(join(pasta, f))));
}

const iguais = (a, b) => a.data.equals(b.data);

if (!existsSync(RAW)) {
  console.error(`✗ não achei os quadros crus em ${RAW}`);
  console.error('  Rode antes: node scripts/gerar-animacoes.mjs');
  process.exit(1);
}

const agentes = readdirSync(RAW, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

let erro = false;

for (const nome of agentes) {
  // 1. Ler tudo o que existe para este agente, e reclamar do que falta.
  const bruto = {};
  let faltando = false;
  for (const { app, px } of DIRECOES) {
    bruto[app] = {};
    for (const anim of ['andar', 'digitando', 'lendo']) {
      const qs = quadrosDe(join(RAW, nome, anim, px));
      const precisa = Math.max(...POSICOES.filter((p) => p.anim === anim).map((p) => p.quadro)) + 1;
      if (qs.length < precisa) {
        console.error(
          `✗ ${nome}/${anim}/${px}: ${qs.length} quadro(s), e a folha pede pelo menos ${precisa}`,
        );
        faltando = true;
      }
      bruto[app][anim] = qs;
    }
  }
  if (faltando) {
    erro = true;
    continue;
  }

  // 2. Uma escala para o agente inteiro; o centro horizontal, por direção.
  const porDirecao = {};
  for (const { app } of DIRECOES) {
    const todos = Object.values(bruto[app]).flat();
    porDirecao[app] = uniao(todos.map(caixa));
  }
  const geral = uniao(Object.values(porDirecao));
  const maiorLargura = Math.max(...Object.values(porDirecao).map((c) => c.w));
  const escala = Math.min(ALTURA_ALVO / geral.h, LARGURA_MAX / maiorLargura);

  // 3. Reduzir as 21, com o y de todos e o x da direção.
  const saida = join(DESTINO, nome);
  const plano = {
    _origem: `${nome} — animações da PixelLab, reduzidas para ${ALTURA_ALVO} px`,
    _escala: `${geral.w}×${geral.h} → ${escala.toFixed(3)}× (uma só para as três direções)`,
  };
  const grade = [];
  const avisos = [];

  for (const { app } of DIRECOES) {
    const d = porDirecao[app];
    const recorte = { x0: d.x0, y0: geral.y0, x1: d.x1, y1: geral.y1, w: d.w, h: geral.h };
    const linha = [];
    for (const pos of POSICOES) {
      const q = reduzir(bruto[app][pos.anim][pos.quadro], recorte, escala);
      linha.push(q);
      if (!SECO) {
        mkdirSync(saida, { recursive: true });
        writeFileSync(join(saida, nomeArquivo(app, pos)), PNG.sync.write(q));
      }
    }
    grade.push(linha);
    plano[app] = POSICOES.map((pos) => nomeArquivo(app, pos));

    // Um quadro repetido não dá erro — só faz o agente parecer parado andando.
    if (iguais(linha[0], linha[2])) avisos.push(`${app}: os dois contatos do andar saíram iguais`);
    if (iguais(linha[3], linha[4])) avisos.push(`${app}: as duas poses de digitar saíram iguais`);
    if (iguais(linha[5], linha[6])) avisos.push(`${app}: as duas poses de ler saíram iguais`);
    if (iguais(linha[3], linha[5])) avisos.push(`${app}: digitar e ler saíram iguais`);
  }

  if (!SECO) {
    writeFileSync(join(saida, 'folha.json'), JSON.stringify(plano, null, 2) + '\n');
    writeFileSync(join(saida, '_previa.png'), PNG.sync.write(previa(grade)));
  }

  console.log(`  ✓  ${nome.padEnd(14)} ${plano._escala}`);
  for (const a of avisos) console.log(`     ⚠ ${a}`);
  if (avisos.length) erro = true;
}

if (erro) process.exitCode = 1;
else {
  console.log(`\n${SECO ? '(seco) ' : ''}${agentes.length} agente(s) em ${DESTINO}`);
  console.log('Confira os _previa.png e depois: node scripts/build-characters.mjs');
}
