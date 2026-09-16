#!/usr/bin/env node
/**
 * build-characters.mjs — FORK-LOCAL
 *
 * Monta as folhas `char_N.png` dos agentes da Samira a partir dos quadros que
 * ela exporta (PixelLab). Não desenha nada e não redimensiona nada: só recorta,
 * ordena e empacota no formato que o app lê.
 *
 *   node scripts/build-characters.mjs [--origem DIR] [--out DIR] [--dry]
 *
 * ── O que ele espera encontrar ───────────────────────────────────────────
 *
 *   <origem>/
 *     Cody/
 *       folha.json          ← quem vai em cada uma das 21 posições
 *       <os PNGs, com o nome que a exportação deu>
 *     Bella Banker/
 *     ...
 *
 * O `folha.json` existe porque o nome do arquivo exportado muda conforme a
 * ferramenta e conforme o dia, e adivinhar por nome quebraria em silêncio —
 * um quadro trocado não dá erro, só faz o boneco andar de lado. Melhor uma
 * lista explícita, escrita uma vez. Rodar sem ela imprime um modelo com os
 * arquivos que existem na pasta, para preencher e colar.
 *
 * ── O formato de saída, que não é negociável ─────────────────────────────
 * 112×96: três linhas de 32 px (**baixo, cima, direita**) e sete quadros de
 * 16×32 em cada. Esquerda não existe no arquivo — o app espelha a direita
 * (`webview-ui/src/office/sprites/spriteData.ts`). O índice do quadro dentro
 * da linha É o significado, e é isso que o `folha.json` ordena:
 *
 *   0,1,2  andar     — tocado 0,1,2,1, então 0 e 2 são os contatos (pé à
 *                      frente, um de cada lado) e 1 é a passada do meio
 *   3,4    digitando — laço de dois, o agente trabalhando
 *   5,6    lendo     — laço de dois, o agente segurando algo
 *
 * 16×32 não é escolha: `core/src/assets/constants.ts` fixa o quadro, e o mundo
 * inteiro é construído em tiles de 16 px. Um personagem maior ficaria gigante
 * ao lado da própria cadeira.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEM_PADRAO = join(RAIZ, 'assets-source', 'characters');
const SAIDA_PADRAO = join(RAIZ, 'webview-ui', 'public');

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const ORIGEM = arg('--origem', ORIGEM_PADRAO);
const SAIDA = arg('--out', SAIDA_PADRAO);
const SECO = process.argv.includes('--dry');

const Q_W = 16,
  Q_H = 32,
  POR_LINHA = 7,
  LINHAS = ['baixo', 'cima', 'direita'];

/**
 * Ordem dos agentes = ordem dos personagens. É ela que as regras
 * (`characterRules` no config.json) apontam pelo número — reordenar aqui troca
 * a cara de todo mundo em silêncio. Agente novo entra no fim.
 */
const AGENTES = [
  { nome: 'Cody', arquivo: 3, palette: 3 },
  { nome: 'Bella Banker', arquivo: 6, palette: 6 },
  { nome: 'Stella Sales', arquivo: 7, palette: 7 },
  { nome: 'Tars', arquivo: 8, palette: 8 },
  { nome: 'Tars Growth', arquivo: 9, palette: 9 },
];

const personagensDir = join(SAIDA, 'assets', 'characters');

/**
 * O número no nome do arquivo NÃO é o índice que o app usa.
 * `loadCharacterSprites` acha os `char_N.png`, ordena por N e **empilha** na
 * lista — o índice de verdade é a posição na pilha. Escrever
 * char_6 e char_9 com um buraco no meio não deixa buraco nenhum: o char_9 vira
 * o 7, e uma regra apontando para 9 pega a cara errada.
 *
 * Os slots são explícitos porque também são a identidade persistida nas
 * `characterRules`. Cody ocupa o 3 removido pela Samira; Bella fica no 6 e os
 * próximos entram em sequência. Ao adicionar um slot, atualize também
 * `CHAR_COUNT` e os dois fallbacks `PALETTE_COUNT`.
 */

const RODAPE = [
  'andar/contato-A',
  'andar/passada',
  'andar/contato-B',
  'digitando/1',
  'digitando/2',
  'lendo/1',
  'lendo/2',
];

function modelo(pasta) {
  const pngs = readdirSync(pasta)
    .filter((f) => /\.png$/i.test(f))
    .sort();
  const vazio = () => RODAPE.map(() => '');
  return {
    _ajuda: 'Sete arquivos por direção, na ordem: ' + RODAPE.join(', '),
    _encontrados: pngs,
    baixo: vazio(),
    cima: vazio(),
    direita: vazio(),
  };
}

function quadroDe(caminho) {
  const p = PNG.sync.read(readFileSync(caminho));
  if (p.width !== Q_W || p.height !== Q_H) {
    throw new Error(`${caminho}: é ${p.width}×${p.height}, e o app só lê ${Q_W}×${Q_H}`);
  }
  return p;
}

if (!existsSync(ORIGEM)) {
  console.error(`✗ origem não existe: ${ORIGEM}`);
  console.error('  Crie uma pasta por agente com os quadros exportados dentro.');
  process.exit(1);
}

let erro = false;
let feitos = 0;
const indices = [];

AGENTES.forEach(({ nome, arquivo: indiceArquivo, palette }) => {
  const pastaFonte = join(ORIGEM, nome);
  if (!existsSync(pastaFonte)) {
    console.log(`  ·  ${nome.padEnd(13)} sem pasta ainda — pulado`);
    return;
  }

  const pastaPoses = existsSync(join(pastaFonte, 'poses-16x32', 'folha.json'))
    ? join(pastaFonte, 'poses-16x32')
    : pastaFonte;

  const mapa = join(pastaPoses, 'folha.json');
  if (!existsSync(mapa)) {
    const pronto = join(personagensDir, `char_${indiceArquivo}.png`);
    if (existsSync(pronto)) {
      console.log(`  ·  ${nome.padEnd(13)} folha final já existe; fontes de pose não disponíveis`);
      feitos++;
      indices.push({ nome, indice: palette });
      return;
    }
    console.error(`\n✗ ${nome}: falta o folha.json. Modelo para preencher:\n`);
    console.error(JSON.stringify(modelo(pastaFonte), null, 2));
    erro = true;
    return;
  }

  let plano;
  try {
    plano = JSON.parse(readFileSync(mapa, 'utf8'));
  } catch (e) {
    console.error(`✗ ${nome}: folha.json inválido — ${e.message}`);
    erro = true;
    return;
  }

  const folha = new PNG({ width: Q_W * POR_LINHA, height: Q_H * LINHAS.length });
  folha.data.fill(0);
  let falhou = false;

  LINHAS.forEach((dir, linha) => {
    const lista = plano[dir];
    if (!Array.isArray(lista) || lista.length !== POR_LINHA) {
      console.error(`✗ ${nome}: "${dir}" precisa de exatamente ${POR_LINHA} arquivos`);
      falhou = true;
      return;
    }
    lista.forEach((arquivo, coluna) => {
      if (falhou) return;
      if (!arquivo) {
        console.error(`✗ ${nome}: "${dir}"[${coluna}] (${RODAPE[coluna]}) está vazio`);
        falhou = true;
        return;
      }
      let q;
      try {
        q = quadroDe(join(pastaPoses, arquivo));
      } catch (e) {
        console.error(`✗ ${nome}: ${e.message}`);
        falhou = true;
        return;
      }
      for (let y = 0; y < Q_H; y++) {
        for (let x = 0; x < Q_W; x++) {
          const s = (y * q.width + x) * 4;
          const d = ((linha * Q_H + y) * folha.width + (coluna * Q_W + x)) * 4;
          folha.data[d] = q.data[s];
          folha.data[d + 1] = q.data[s + 1];
          folha.data[d + 2] = q.data[s + 2];
          folha.data[d + 3] = q.data[s + 3];
        }
      }
    });
  });

  if (falhou) {
    erro = true;
    return;
  }

  const destino = join(SAIDA, 'assets', 'characters', `char_${indiceArquivo}.png`);
  if (!SECO) {
    mkdirSync(join(SAIDA, 'assets', 'characters'), { recursive: true });
    writeFileSync(destino, PNG.sync.write(folha));
  }
  console.log(`  ✓  char_${indiceArquivo}.png  ${nome}`);
  indices.push({ nome, indice: palette });
  feitos++;
});

if (erro) process.exitCode = 1;
if (feitos) {
  console.log(
    `\n${SECO ? '(seco) ' : ''}${feitos} de ${AGENTES.length} montados em ${SAIDA}/assets/characters`,
  );
  // A regra aponta o personagem pelo número, e o número só se conhece depois
  // de saber quem tinha arte — então ele sai daqui pronto para colar, em vez
  // de ser contado na mão a cada vez que um agente entra ou sai.
  console.log('\nPara `characterRules` em ~/.pixel-agents/config.json:\n');
  console.log(
    JSON.stringify(
      indices.map(({ nome, indice }) => ({
        match: nome.split(' ')[0].toLowerCase(),
        palette: indice,
        field: 'agentName',
      })),
      null,
      2,
    ),
  );
  console.log('\nA ordem importa e `match` é substring — ver docs/character-rules.md');
}
