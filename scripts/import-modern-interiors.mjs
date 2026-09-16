#!/usr/bin/env node
/**
 * import-modern-interiors.mjs — FORK-LOCAL
 *
 * Transforma as pastas "Singles" do pack Modern Interiors (LimeZu) num
 * diretório de assets externo que o Pixel Agents carrega por
 * `externalAssetDirectories` — Settings → Add Asset Directory.
 *
 * Por que importar em vez de mexer nos assets embutidos: `docs/external-assets.md`
 * descreve exatamente este caminho, e o grid bate sem conversão nenhuma — 1 tile
 * = 16 px nos dois lados. Nada aqui é redimensionado, recortado ou recolorido;
 * o PNG entra como saiu do pack.
 *
 *   node scripts/import-modern-interiors.mjs [--pack DIR] [--out DIR] [--dry]
 *
 * ── LICENÇA (importa, leia) ──────────────────────────────────────────────
 * O Modern Interiors permite uso comercial e **proíbe redistribuir** o asset.
 * Por isso o destino padrão fica FORA de qualquer repositório versionado: o
 * diretório é da máquina, não do Git. Não mova a saída para dentro do
 * `ordahi-aios` nem do `pixel-agents` — o kit que ela vende sairia
 * redistribuindo arte de terceiro. Créditos: limezu.itch.io
 *
 * ── Como o catálogo é montado ────────────────────────────────────────────
 * Cada item já vem como PNG separado no pack, então não há fatiamento: o
 * trabalho é dar **nome e categoria**, que o arquivo não carrega
 * (`Conference_Hall_Singles_Shadowless_37.png` não diz "cadeira"). A tabela
 * `TEMAS` abaixo faz isso por faixa de índice, lida das folhas de contato
 * geradas na revisão de 26/08. Índice é 1-based e casa com o sufixo do
 * arquivo na ordem natural.
 *
 * Geometria derivada do próprio PNG, sem palpite:
 *   footprintW/H = ceil(lado / 16)
 *   backgroundTiles = footprintH - 1 para o que é mais alto que um tile
 *
 * O segundo é a regra que mais engana. O nome sugere "tiles abaixo", mas o
 * renderizador faz o contrário (`layoutSerializer.ts`: *"Skips top
 * backgroundTiles rows so characters can walk through them"*): são as linhas
 * DE CIMA que deixam de bloquear. Só a fileira que encosta no chão segura o
 * personagem, que é como uma estante de 3 tiles deve se comportar — ela ocupa
 * um tile de piso, não três. Item de parede não bloqueia nada e vai a zero.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { PNG } from 'pngjs';

const PACK_PADRAO =
  'D:/Downloads/moderninteriors-win/1_Interiors/16x16/Theme_Sorter_Shadowless_Singles';
const SAIDA_PADRAO = 'D:/Documentos/pixel-agents-assets/ordahi-office';

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const PACK = arg('--pack', PACK_PADRAO);
const SAIDA = arg('--out', SAIDA_PADRAO);
const SECO = process.argv.includes('--dry');

/**
 * Sem sombra, de propósito: o Pixel Agents desenha o piso e a parede por baixo
 * da mobília, e a sombra assada do pack encosta num chão que não é o dele.
 */
const TEMAS = [
  {
    pasta: '13_Conference_Hall_Singles_Shadowless',
    slug: 'REUNIAO',
    rotulo: 'Reunião',
    grupos: [
      [[1, 11], 'Painel de madeira', 'decor'],
      [[12, 24], 'Praticável', 'decor'],
      [[25, 32], 'Púlpito', 'decor'],
      [[33, 36], 'Miudeza de palco', 'misc'],
      [[37, 40], 'Cadeira de auditório', 'chairs'],
      [[41, 41], 'Painel de controle', 'electronics'],
      [[42, 42], 'Mastro', 'misc'],
      [[43, 43], 'Bebedouro', 'electronics'],
      [[44, 44], 'Mastro', 'misc'],
      [[45, 46], 'Lixeira', 'misc'],
      [[47, 49], 'Faixa de palco', 'misc'],
      [[50, 52], 'Flip chart', 'decor'],
      [[53, 53], 'Caixa de som', 'electronics'],
      [[54, 55], 'Retrato', 'wall'],
      [[56, 57], 'Cadeira dobrável', 'chairs'],
      [[58, 58], 'Miudeza de palco', 'misc'],
      [[59, 59], 'Extintor', 'misc'],
      [[60, 65], 'Cortina', 'decor'],
      [[66, 68], 'Tela de projeção', 'decor'],
    ],
  },
  {
    pasta: '23_Television_and_Film_Studio_Singles_Shadowless',
    slug: 'ESTUDIO',
    rotulo: 'Estúdio',
    grupos: [
      [[1, 4], 'Câmera de cinema', 'electronics'],
      [[5, 6], 'Câmera compacta', 'electronics'],
      [[7, 7], 'Microfone de estúdio', 'electronics'],
      [[8, 11], 'Refletor', 'electronics'],
      [[12, 23], 'Chroma key', 'decor'],
      [[24, 25], 'Praticável verde', 'decor'],
      [[26, 27], 'Chroma key baixo', 'decor'],
      [[28, 31], 'Poltrona', 'chairs'],
      [[32, 34], 'Banqueta', 'chairs'],
      [[35, 40], 'Trilho de travelling', 'misc'],
      [[41, 47], 'Monitor de referência', 'electronics'],
      [[48, 53], 'Quadro de cena', 'wall'],
      [[54, 71], 'Cadeira de diretor', 'chairs'],
      [[72, 74], 'Claquete', 'misc'],
      [[75, 80], 'Cesto de cabos', 'misc'],
    ],
  },
  {
    pasta: '5_Classroom_and_Library_Singles_Shadowless',
    slug: 'BIBLIOTECA',
    rotulo: 'Biblioteca',
    // 50 e 51 saem: o pack desenha um atendente dentro do balcão, e quem
    // desenha gente nesta tela é o próprio Pixel Agents. Móvel com pessoa
    // assada viraria um segundo morador que nenhum agente controla.
    pula: [50, 51],
    grupos: [
      [[1, 4], 'Cadeira escolar', 'chairs'],
      [[5, 24], 'Carteira', 'desks'],
      [[25, 26], 'Mesa de leitura', 'desks'],
      [[27, 30], 'Carteira de frente', 'desks'],
      [[31, 31], 'Mapa-múndi', 'wall'],
      [[32, 32], 'Quadro de avisos', 'wall'],
      [[33, 33], 'Mural de recados', 'wall'],
      [[34, 35], 'Globo terrestre', 'decor'],
      [[36, 36], 'Lousa', 'wall'],
      [[37, 38], 'Ponteiro', 'misc'],
      [[39, 39], 'Lousa com suporte', 'decor'],
      [[40, 40], 'Armário', 'storage'],
      [[41, 42], 'Escada de biblioteca', 'misc'],
      [[43, 48], 'Prateleira', 'storage'],
      [[49, 49], 'Balcão de atendimento', 'desks'],
      [[52, 52], 'Balcão em L', 'desks'],
      [[53, 53], 'Caixote', 'storage'],
      [[54, 54], 'Caixa registradora', 'electronics'],
      [[55, 56], 'Estante baixa', 'storage'],
      [[57, 75], 'Estante de livros', 'storage'],
    ],
  },
  {
    pasta: '7_Art_Singles_Shadowless',
    slug: 'ARTE',
    rotulo: 'Arte',
    grupos: [
      [[1, 4], 'Pote de barro', 'decor'],
      [[5, 11], 'Tinta e pincel', 'decor'],
      [[12, 17], 'Lata de tinta', 'decor'],
      [[18, 20], 'Respingo de tinta', 'decor'],
      [[21, 21], 'Bonsai', 'decor'],
      [[22, 29], 'Bancada de pintura', 'desks'],
      [[30, 33], 'Banqueta de ateliê', 'chairs'],
      [[34, 40], 'Cavalete', 'decor'],
      [[41, 46], 'Quadro emoldurado', 'wall'],
    ],
  },
];

const TILE = 16;
/** Item pequeno e solto pousa em cima de mesa; móvel e peça de parede, não. */
const POUSA_EM_MESA = new Set(['decor', 'misc', 'electronics']);

const sanear = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

function grupoDe(tema, i) {
  for (const [[de, ate], nome, categoria] of tema.grupos) {
    if (i >= de && i <= ate) return { nome, categoria, de };
  }
  return null;
}

let total = 0;
const porCategoria = {};
const semGrupo = [];

if (!SECO) {
  // Recriar do zero: rodar de novo depois de mexer na tabela tem que dar o
  // mesmo resultado, e item renomeado deixaria a pasta velha órfã no catálogo.
  if (existsSync(join(SAIDA, 'assets', 'furniture'))) {
    rmSync(join(SAIDA, 'assets', 'furniture'), { recursive: true, force: true });
  }
  mkdirSync(join(SAIDA, 'assets', 'furniture'), { recursive: true });
}

for (const tema of TEMAS) {
  const dir = join(PACK, tema.pasta);
  if (!existsSync(dir)) {
    console.error(`✗ tema não encontrado: ${dir}`);
    process.exitCode = 1;
    continue;
  }
  const arquivos = readdirSync(dir)
    .filter((f) => /\.png$/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  const pula = new Set(tema.pula ?? []);
  const contador = new Map();
  let doTema = 0;

  arquivos.forEach((arquivo, idx) => {
    const i = idx + 1;
    if (pula.has(i)) return;
    const g = grupoDe(tema, i);
    if (!g) {
      semGrupo.push(`${tema.slug}:${i}`);
      return;
    }

    const png = PNG.sync.read(readFileSync(join(dir, arquivo)));
    const footprintW = Math.ceil(png.width / TILE);
    const footprintH = Math.ceil(png.height / TILE);
    const parede = g.categoria === 'wall';

    const n = (contador.get(g.nome) ?? 0) + 1;
    contador.set(g.nome, n);
    const varios = tema.grupos.find((x) => x[1] === g.nome)[0];
    const unico = varios[0] === varios[1];

    const id = `MI_${tema.slug}_${sanear(g.nome)}_${n}`;
    const manifesto = {
      id,
      name: unico ? g.nome : `${g.nome} ${n}`,
      category: g.categoria,
      type: 'asset',
      file: `${id}.png`,
      width: png.width,
      height: png.height,
      footprintW,
      footprintH,
      canPlaceOnWalls: parede,
      canPlaceOnSurfaces:
        !parede && POUSA_EM_MESA.has(g.categoria) && png.width <= TILE && png.height <= TILE,
      backgroundTiles: parede ? 0 : Math.max(0, footprintH - 1),
    };

    if (!SECO) {
      const pasta = join(SAIDA, 'assets', 'furniture', id);
      mkdirSync(pasta, { recursive: true });
      writeFileSync(join(pasta, `${id}.png`), readFileSync(join(dir, arquivo)));
      writeFileSync(join(pasta, 'manifest.json'), JSON.stringify(manifesto, null, 2) + '\n');
    }

    porCategoria[g.categoria] = (porCategoria[g.categoria] ?? 0) + 1;
    doTema++;
    total++;
  });

  console.log(`  ${tema.rotulo.padEnd(12)} ${String(doTema).padStart(3)} itens`);
}

if (semGrupo.length) {
  console.error(`\n✗ ${semGrupo.length} índices fora de qualquer faixa: ${semGrupo.join(', ')}`);
  process.exitCode = 1;
}

console.log(`\n${SECO ? '(seco) ' : ''}${total} itens em ${SAIDA}`);
console.log(
  Object.entries(porCategoria)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `  ${c.padEnd(12)} ${n}`)
    .join('\n'),
);
if (!SECO) {
  console.log(
    `\nAponte o app para ${SAIDA}\n` +
      `  Settings → Add Asset Directory\n` +
      `Arte: Modern Interiors, LimeZu (limezu.itch.io) — créditos obrigatórios, redistribuição proibida.`,
  );
}
