#!/usr/bin/env node
/**
 * reduzir-agentes.mjs — FORK-LOCAL
 *
 * Traduz a arte que a Samira exporta (`brand-assets/agents/<Agente>/`) para o
 * formato que o `build-characters.mjs` empacota (`agents-topdown/<Agente>/`).
 *
 *   node scripts/reduzir-agentes.mjs [--origem DIR] [--destino DIR] [--dry]
 *
 * ── Por que existe uma tradução no meio ──────────────────────────────────
 *
 * A exportação dela é uma **rotação**: um canvas de 76×76 por quadro, oito
 * quadros girando o personagem 360° numa pose só. O app quer o contrário —
 * três direções fixas com sete poses cada, num quadro de 16×32. Nada aqui
 * inventa pose: o que este script resolve é o eixo **direção** e a **escala**.
 * O eixo **pose** continua vindo da ferramenta que animar os quadros.
 *
 * ── Escala: 61 px de personagem para 28 ──────────────────────────────────
 *
 * O personagem dela ocupa ~24×61 px do canvas. O quadro do app é 16×32, e
 * dentro dele os personagens embutidos medem 14×28 com os pés em y=29
 * (`webview-ui/public/assets/characters/char_0.png`). Não é margem estética:
 * é onde o chão está. Reduzir para 28 de altura e assentar os pés em 29 é o
 * que faz o agente dela ter o mesmo tamanho que todo mundo no escritório, em
 * vez de pairar sobre a cadeira ou afundar no piso.
 *
 * A redução é por **maioria da caixa**, não bilinear: cada pixel de saída
 * recebe a cor que mais aparece na caixa de origem correspondente, e só existe
 * se metade da caixa era opaca. Interpolar cores criaria tons que não estão na
 * paleta dela e uma borda meio-transparente em volta do boneco — em pixel art
 * de 28 px de altura isso aparece como sujeira, não como suavidade.
 *
 * ── Direção: a posição na rotação, conferida no pixel ────────────────────
 *
 * Os quadros vêm com nomes sequenciais (`_0001`…`_0008`) que não dizem para
 * onde o personagem olha. Quem diz é a **posição**: a rotação começa de frente
 * e gira para a direita em passos iguais, então frente=0, direita=N/4,
 * costas=N/2 — a mesma ordem nos três agentes exportados até aqui.
 *
 * Só que um quadro trocado não daria erro nenhum: faria o boneco andar de
 * costas para onde vai, e ninguém descobriria olhando o arquivo. Duas defesas,
 * porque nenhuma sozinha basta:
 *
 * 1. **O sentido do giro é conferido no pixel.** Entre a frente e as costas o
 *    rosto tem de puxar para a direita; se puxar para a esquerda, a rotação
 *    veio invertida e a direita vira esquerda — o pior erro silencioso que
 *    existe aqui, e o único que dá para reprovar sem chutar.
 * 2. **O resto é conferido no olho.** Distinguir frente de 3/4 por contagem de
 *    pele não funciona (o 3/4 mostra mais pescoço e mão que a frente, e passa
 *    na frente dela na conta). Então o script escreve `_previa.png` com as três
 *    direções ampliadas e imprime as medidas: dois segundos de olhada resolvem
 *    o que nenhum limiar resolveria.
 *
 * Esquerda não se exporta — o app espelha a direita sozinho.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PNG } from 'pngjs';

import { ALFA, ALTURA_ALVO, caixa, previa, reduzir } from './_arte.mjs';

const ORIGEM_PADRAO = 'D:/Documentos/Ordahi AIOS/brand-assets/agents';
const DESTINO_PADRAO = 'D:/Documentos/Ordahi AIOS/brand-assets/agents-topdown';

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const ORIGEM = arg('--origem', ORIGEM_PADRAO);
const DESTINO = arg('--destino', DESTINO_PADRAO);
const SECO = process.argv.includes('--dry');

/** As três direções que o arquivo carrega, na ordem das linhas da folha. */
const DIRECOES = ['baixo', 'cima', 'direita'];
/** As sete posições da linha; por enquanto todas recebem o mesmo quadro. */
const POSES = 7;

/** Tom de pele: r>g>b bem separados. Serve só para achar o rosto. */
const ehPele = (r, g, b) =>
  r > 170 && g > 110 && g < 210 && b > 80 && b < 180 && r > g && g > b && r - b > 50;

/**
 * Quanta pele o quadro mostra e para que lado ela puxa, olhando só o terço
 * superior — é ali que está a cabeça, e o resto do corpo só faria ruído.
 */
function rosto(p, c) {
  const limite = c.y0 + Math.round(c.h * 0.35);
  const centro = (c.x0 + c.x1) / 2;
  let soma = 0,
    n = 0;
  for (let y = c.y0; y <= limite; y++) {
    for (let x = c.x0; x <= c.x1; x++) {
      const i = (y * p.width + x) * 4;
      if (p.data[i + 3] > ALFA && ehPele(p.data[i], p.data[i + 1], p.data[i + 2])) {
        soma += x;
        n++;
      }
    }
  }
  return { pele: n, desloc: n ? soma / n - centro : 0 };
}

/**
 * Posição na rotação → direção, e a conferência de que a rotação é essa.
 * Devolve `{ baixo, cima, direita, queixas }`; `queixas` vazio = confere.
 */
function direcoes(quadros) {
  const n = quadros.length;
  const idx = { baixo: 0, direita: n / 4, cima: n / 2 };
  const m = quadros.map((q) => rosto(q.png, q.caixa));
  const queixas = [];

  // Entre a frente e as costas o personagem gira para a direita: o rosto tem
  // de puxar para lá em média, ou a rotação veio invertida e o boneco andaria
  // espelhado. É a única afirmação forte o bastante para reprovar sozinha.
  const meia = m.slice(idx.baixo + 1, idx.cima);
  const giro = meia.reduce((s, x) => s + x.desloc, 0) / (meia.length || 1);
  if (!(giro > 0)) {
    queixas.push(
      `entre a frente e as costas o rosto devia puxar para a direita, e puxa ${giro.toFixed(2)} —` +
        ' a rotação está invertida, e a direita sairia espelhada',
    );
  }

  const pico = Math.max(...m.map((x) => x.pele)) || 1;
  const rostoEm = (i) => `${Math.round((m[i].pele / pico) * 100)}%`;
  const nota =
    `rosto ${rostoEm(idx.baixo)} na frente, ${rostoEm(idx.direita)} no perfil, ` +
    `${rostoEm(idx.cima)} nas costas · giro ${giro > 0 ? '+' : ''}${giro.toFixed(2)}`;

  return { ...idx, queixas, nota };
}

if (!existsSync(ORIGEM)) {
  console.error(`✗ origem não existe: ${ORIGEM}`);
  process.exit(1);
}

const agentes = readdirSync(ORIGEM, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

if (agentes.length === 0) {
  console.error(`✗ nenhuma pasta de agente em ${ORIGEM}`);
  process.exit(1);
}

let erro = false;

for (const nome of agentes) {
  const pasta = join(ORIGEM, nome);
  const pngs = readdirSync(pasta)
    .filter((f) => /\.png$/i.test(f))
    .sort();

  if (pngs.length < 4 || pngs.length % 4 !== 0) {
    console.error(
      `✗ ${nome}: ${pngs.length} quadro(s). A rotação tem de ser múltipla de 4 —` +
        ' frente, direita, costas e esquerda precisam cair em quadros exatos.',
    );
    erro = true;
    continue;
  }

  const quadros = [];
  for (const f of pngs) {
    const png = PNG.sync.read(readFileSync(join(pasta, f)));
    const c = caixa(png);
    if (!c) {
      console.error(`✗ ${nome}/${f}: quadro vazio`);
      erro = true;
      break;
    }
    quadros.push({ arquivo: f, png, caixa: c });
  }
  if (quadros.length !== pngs.length) continue;

  const d = direcoes(quadros);
  if (d.queixas.length) {
    console.error(`\n✗ ${nome}: a rotação não está na ordem esperada —`);
    for (const q of d.queixas) console.error(`     ${q}`);
    console.error('   Reordene a exportação ou ajuste este script; não vou adivinhar.\n');
    erro = true;
    continue;
  }

  const saida = join(DESTINO, nome);
  const plano = {
    _origem: `${nome} — rotação de ${pngs.length} quadros, reduzida para ${ALTURA_ALVO} px`,
    _pose: 'INTERINO: as 7 posições repetem o mesmo quadro parado — ainda sem andar/digitar/ler',
  };

  const reduzidos = [];
  for (const dir of DIRECOES) {
    const q = quadros[d[dir]];
    const arquivo = `${dir}.png`;
    const png = reduzir(q.png, q.caixa);
    reduzidos.push(png);
    if (!SECO) {
      mkdirSync(saida, { recursive: true });
      writeFileSync(join(saida, arquivo), PNG.sync.write(png));
    }
    plano[dir] = Array(POSES).fill(arquivo);
  }

  if (!SECO) {
    writeFileSync(join(saida, 'folha.json'), JSON.stringify(plano, null, 2) + '\n');
    writeFileSync(join(saida, '_previa.png'), PNG.sync.write(previa(reduzidos)));
  }

  console.log(`  ✓  ${nome.padEnd(14)} ${d.nota}`);
  console.log(
    `     ${DIRECOES.map((dir) => `${dir}←${quadros[d[dir]].arquivo.match(/\d+(?=\.png$)/i)?.[0] ?? '?'}`).join('  ')}`,
  );
}

if (erro) process.exitCode = 1;
else {
  console.log(`\n${SECO ? '(seco) ' : ''}${agentes.length} agente(s) em ${DESTINO}`);
  console.log('Agora: node scripts/build-characters.mjs');
}
