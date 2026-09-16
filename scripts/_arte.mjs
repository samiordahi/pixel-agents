/**
 * _arte.mjs — FORK-LOCAL
 *
 * A geometria que os scripts de arte compartilham: medir o boneco dentro do
 * canvas, reduzi-lo ao quadro do app e mostrá-lo ampliado para conferência.
 *
 * Existe porque dois scripts precisam **exatamente** da mesma redução:
 * `reduzir-agentes.mjs` (rotação parada → 3 direções) e `animar-agentes.mjs`
 * (animação da PixelLab → 21 poses). Duas cópias da mesma conta divergiriam no
 * primeiro ajuste, e o sintoma seria o pior possível — o agente mudando de
 * tamanho conforme a pose, sem nada dar erro.
 */
import { PNG } from 'pngjs';

/** O quadro que o app lê. `core/src/assets/constants.ts` fixa; o mundo é em tiles de 16. */
export const Q_W = 16;
export const Q_H = 32;

/**
 * Medidas tiradas do `char_0.png` embutido: é o tamanho de todo mundo lá
 * dentro. Não é margem estética — `BASE_Y` é onde o chão está.
 */
export const ALTURA_ALVO = 28;
export const BASE_Y = 29;
export const LARGURA_MAX = 14;

/** Abaixo disso o pixel é fundo, não boneco. */
export const ALFA = 8;

/** Caixa dos pixels opacos, ou `null` se o quadro está vazio. */
export function caixa(p) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (p.data[(y * p.width + x) * 4 + 3] > ALFA) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * A caixa que cobre todas as outras.
 *
 * É o que separa um quadro parado de uma animação. Reduzir cada quadro pela
 * **própria** caixa dá a cada pose uma escala diferente: o boneco que abre as
 * pernas para andar fica mais baixo que o boneco de pé, e o agente pulsa de
 * tamanho a cada passo. Uma caixa só para a sequência inteira fixa a escala e
 * o chão, e aí a perna que levanta aparece como perna levantando — que é o
 * que se queria animar.
 */
export function uniao(caixas) {
  const c = caixas.filter(Boolean);
  if (!c.length) return null;
  const x0 = Math.min(...c.map((b) => b.x0));
  const y0 = Math.min(...c.map((b) => b.y0));
  const x1 = Math.max(...c.map((b) => b.x1));
  const y1 = Math.max(...c.map((b) => b.y1));
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Reduz o recorte `c` de `p` para `ALTURA_ALVO` e assenta os pés em `BASE_Y`.
 *
 * `c` não precisa ser a caixa de `p` — passar a mesma caixa para uma sequência
 * inteira é justamente como se mantém a escala estável entre as poses.
 *
 * `escalaFixa` separa as duas coisas que `c` decide junto: **quanto** encolher
 * e **onde** assentar. Numa animação as três direções têm de encolher pelo
 * mesmo fator (ou o agente muda de tamanho ao virar), mas cada uma se centra
 * na própria largura (ou o boneco de perfil fica torto no quadro). Quem anima
 * passa a escala de fora e um `c` com o x da direção e o y de todos.
 *
 * A redução é por **maioria da caixa**, não bilinear: cada pixel de saída
 * recebe a cor que mais aparece na caixa de origem, e só existe se metade dela
 * era opaca. Interpolar criaria tons fora da paleta e uma borda
 * meio-transparente em volta do boneco — a 28 px de altura isso lê como
 * sujeira, não como suavidade.
 */
export function reduzir(p, c, escalaFixa = null) {
  const escala = escalaFixa ?? Math.min(ALTURA_ALVO / c.h, LARGURA_MAX / c.w);
  const nw = Math.max(1, Math.round(c.w * escala));
  const nh = Math.max(1, Math.round(c.h * escala));
  const q = new PNG({ width: Q_W, height: Q_H });
  q.data.fill(0);
  const offX = Math.floor((Q_W - nw) / 2);
  const offY = BASE_Y - nh + 1;

  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const sx0 = c.x0 + Math.floor(x / escala),
        sx1 = c.x0 + Math.ceil((x + 1) / escala);
      const sy0 = c.y0 + Math.floor(y / escala),
        sy1 = c.y0 + Math.ceil((y + 1) / escala);
      const cont = new Map();
      let opacos = 0,
        total = 0;
      for (let sy = sy0; sy < sy1 && sy < p.height; sy++) {
        for (let sx = sx0; sx < sx1 && sx < p.width; sx++) {
          const i = (sy * p.width + sx) * 4;
          total++;
          if (p.data[i + 3] > ALFA) {
            opacos++;
            const k = `${p.data[i]},${p.data[i + 1]},${p.data[i + 2]}`;
            cont.set(k, (cont.get(k) || 0) + 1);
          }
        }
      }
      if (!total || opacos * 2 < total) continue;
      let cor = null,
        max = -1;
      for (const [k, n] of cont) {
        if (n > max) {
          max = n;
          cor = k;
        }
      }
      const [r, g, b] = cor.split(',').map(Number);
      const d = ((offY + y) * Q_W + (offX + x)) * 4;
      q.data[d] = r;
      q.data[d + 1] = g;
      q.data[d + 2] = b;
      q.data[d + 3] = 255;
    }
  }
  return q;
}

/**
 * Os quadros lado a lado, ampliados sobre fundo escuro, uma linha por lista.
 *
 * A 16×32 o quadro é pequeno demais para julgar no visualizador do sistema, e
 * é justamente o que nenhum limiar decide — frente contra 3/4, esquerda contra
 * direita, contato contra passada — que se resolve olhando.
 */
export function previa(linhas, zoom = 8) {
  const grade = Array.isArray(linhas[0]) ? linhas : [linhas];
  const colunas = Math.max(...grade.map((l) => l.length));
  const p = new PNG({ width: Q_W * zoom * colunas, height: Q_H * zoom * grade.length });
  for (let i = 0; i < p.data.length; i += 4) {
    p.data[i] = 24;
    p.data[i + 1] = 24;
    p.data[i + 2] = 28;
    p.data[i + 3] = 255;
  }
  grade.forEach((linha, l) => {
    linha.forEach((q, n) => {
      for (let y = 0; y < Q_H; y++) {
        for (let x = 0; x < Q_W; x++) {
          const s = (y * q.width + x) * 4;
          if (q.data[s + 3] <= ALFA) continue;
          for (let zy = 0; zy < zoom; zy++) {
            for (let zx = 0; zx < zoom; zx++) {
              const py = l * Q_H * zoom + y * zoom + zy;
              const px = n * Q_W * zoom + x * zoom + zx;
              const d = (py * p.width + px) * 4;
              p.data[d] = q.data[s];
              p.data[d + 1] = q.data[s + 1];
              p.data[d + 2] = q.data[s + 2];
              p.data[d + 3] = 255;
            }
          }
        }
      }
    });
  });
  return p;
}
