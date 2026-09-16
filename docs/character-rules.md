# Personagens por nome, e como gerar os seus

Duas coisas que andam juntas: **fixar** qual agente usa qual personagem, e
**produzir** os personagens no formato certo.

> Fork-local. Nada aqui existe no upstream.

## 1. Fixar o personagem pelo nome

O upstream sorteia: `assignPaletteIfNeeded` escolhe o personagem menos usado
entre os agentes vivos. É o certo enquanto os personagens são anônimos — o
escritório enche de gente visivelmente diferente. Deixa de ser certo quando os
personagens **são alguém**: um agente que é sempre a mesma pessoa precisa ter a
mesma cara, ou o escritório não diz quem está trabalhando.

`characterRules`, em `~/.pixel-agents/config.json` — o que está valendo hoje:

```json
{
  "characterRules": [
    { "match": "cody", "palette": 3, "field": "agentName" },
    { "match": "bella", "palette": 6, "field": "agentName" },
    { "match": "stella", "palette": 7, "field": "agentName" },
    { "match": "lead", "palette": 3, "field": "role" }
  ]
}
```

A última linha é a que faz **a conversa principal ser sempre o Cody**, em
qualquer projeto. Ela precisa do campo `role` porque a sessão principal **não
tem nome**: `agentName` só existe para quem é colega de alguém, e
`linkTeammates` acha o lead justamente procurando quem está sem ele. Uma regra
por `agentName` nunca pegaria você; casar o caminho do projeto erraria por dois
lados — pegaria os subagentes daquele projeto junto e perderia o lead assim que
você abrisse uma sessão em outra pasta.

O resto continua como estava: subagente com regra ganha a cara dele, subagente
sem regra volta para o sorteio por diversidade — que é o comportamento certo
enquanto ele ainda não é ninguém.

| campo     | o que é                                                                                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match`   | **substring literal, sem maiúscula/minúscula** — não é regex. `"ordahi-aios"` com hífen NÃO casa com o caminho `D:\Documentos\Ordahi AIOS`; tem que ser `"Ordahi AIOS"`.                                  |
| `palette` | índice do personagem carregado. Os embutidos são a sequência estrita `char_0.png`…`char_6.png`; personagens externos são anexados depois dela.                                                            |
| `field`   | onde procurar: `agentName` (papel dentro do time), `teamName`, `folderName` (pasta do workspace), `projectDir` (caminho do projeto), `role`, ou `any` (o padrão — tenta os quatro primeiros nessa ordem). |

`role` é o único que não é um nome que você escreveu em algum lugar: nós que
derivamos, e vale **`lead`** para a sessão principal ou **`teammate`** para
subagente. Por isso ele fica **de fora do `any`** — um campo derivado caindo
numa busca ampla por acaso pintaria o escritório inteiro sem ninguém entender
por quê. Quem quer o papel pede o papel.

**A ordem importa:** a primeira regra que casa vence. Regra específica em cima,
regra ampla embaixo — se um dia existir um "Tars Growth" ao lado do "Tars", a
regra `growth` tem de vir antes da `tars`, senão os dois caem no mesmo.

Três comportamentos que valem saber:

- **Regra ganha de personagem já gravado.** O sorteio é persistido para o agente
  não trocar de cara a cada reinício; uma regra é você dizendo quem ele é, então
  ela se aplica sempre. Sem isso, editar o arquivo não faria efeito nenhum até
  todo agente antigo ser esquecido, e a função pareceria quebrada.
- **E ganha também do que a aba aberta lembra.** O cliente devolve os assentos
  no handshake (`saveAgentSeats`) com o palette que guardou, e sem a mesma
  guarda ali o servidor atribui o personagem certo no spawn e a aba o desfaz
  meio segundo depois — devolvendo um valor que pode ser de antes de a regra
  existir. **O assento é do cliente; a cara não é.** Onde a pessoa sentou
  continua sendo decisão de quem arrastou.
- **`hueShift` vai a zero** quando a regra casa. A folha foi feita para parecer
  com aquela pessoa; girar a matiz dela é exatamente o que um pino serve para
  impedir.
- **Regra apontando para personagem que não existe é aparada**, não ignorada — se
  o diretório externo sair, `palette: 9` vira o último personagem carregado em
  vez de um índice fora de faixa.

Quem não casa com regra nenhuma segue no sorteio de sempre.

Recarregue o app depois de editar (as regras entram junto com os assets).

## 2. Gerar os personagens

`node scripts/build-characters.mjs` monta os `char_N.png` a partir dos seus
quadros. Ele **não desenha e não redimensiona** — só recorta, ordena e empacota.

> Esta seção é o formato de destino. A arte que existe hoje ainda não chega
> nele: vem como rotação de 8 quadros a 76×76, e quem faz a ponte é a **§3**.

### O que a arte precisa ser

|                   |                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------- |
| Tamanho do quadro | **16 px de largura × 32 px de altura**, exatamente                                      |
| Ângulo            | top-down de jogo — câmera alta, olhando o personagem de cima em diagonal                |
| Direções          | três: **de frente** (andando para baixo), **de costas** (para cima), **perfil direito** |
| Quadros           | 7 por direção = 21 no total                                                             |

O 16×32 não é escolha: `core/src/assets/constants.ts` fixa o quadro, e o mundo
é construído em tiles de 16 px. Personagem maior fica gigante ao lado da própria
cadeira. **Esquerda não se desenha** — o app espelha a direita sozinho.

### As sete poses, na ordem

| #   | pose              | o que é                               |
| --- | ----------------- | ------------------------------------- |
| 0   | andar — contato A | um pé à frente                        |
| 1   | andar — passada   | pernas passando, o meio do ciclo      |
| 2   | andar — contato B | o outro pé à frente                   |
| 3   | digitando 1       | sentado, braços à frente, mãos vazias |
| 4   | digitando 2       | o mesmo, mãos em outra posição        |
| 5   | lendo 1           | sentado, segurando o documento        |
| 6   | lendo 2           | o mesmo, variação                     |

A ordem do andar não é arbitrária: o app toca `0,1,2,1`, então os contatos
precisam estar em 0 e 2 e a passada em 1 — assim sai contato → passada →
contato → passada. Contatos em 0 e 1 fazem o boneco patinar.

Digitando e lendo são laços de dois quadros. A diferença entre os dois pares é
o que o escritório usa para dizer se o agente está trabalhando ou lendo, então
vale desenhá-los diferentes de verdade — mãos vazias contra mãos segurando algo.

### Como entregar

Uma pasta por agente, os PNGs dentro com o nome que a exportação deu, e um
`folha.json` dizendo quem vai em cada posição:

```
assets-source/characters/
  Cody/
    folha.json
    cody_walk_front_0.png
    ...
```

```json
{
  "baixo": [
    "andar1.png",
    "andar2.png",
    "andar3.png",
    "dig1.png",
    "dig2.png",
    "ler1.png",
    "ler2.png"
  ],
  "cima": ["...", "...", "...", "...", "...", "...", "..."],
  "direita": ["...", "...", "...", "...", "...", "...", "..."]
}
```

Rode sem o `folha.json` e o script imprime um modelo já com a lista dos arquivos
que achou na pasta — é só preencher e colar.

A tabela `AGENTES` no script fixa explicitamente arquivo e palette. A sequência
embutida é estrita e não aceita buracos: ao adicionar `char_7.png`, atualize
também `CHAR_COUNT` e os dois fallbacks `PALETTE_COUNT` para 8. O script imprime
o mapa pronto para colar no `characterRules`:

```
  ✓  char_3.png  Cody
  ✓  char_6.png  Bella Banker
  ✓  char_7.png  Stella Sales
  ·  Tars          sem pasta ainda — pulado
```

## 3. Fluxo atual de criação

Crie a identidade no PixelLab Character Creator em Humanoid, Pro, 32 px e Low
Top-Down. Use Cody como **Style Character** e a imagem da pessoa como
**Reference Image**. Aprove primeiro as quatro rotações neutras e vazias.

As 21 ações não são inventadas a partir da pose neutra: `char_0.png` é o molde
estrutural obrigatório. Ele define articulação, oclusão, caminhada e postura
sentada; as rotações aprovadas fornecem rosto, cabelo, roupa e paleta. Cody é o
exemplo já aprovado dessa transferência.

Fontes e correções ficam em `assets-source/characters/<Agente>/`. As folhas que
o aplicativo carrega ficam em
`webview-ui/public/assets/characters/char_N.png`. Para Bella, o gerador
reproduzível é `scripts/character-assets/build_bella_positions.py`.

## 4. Fidelidade ao movimento original

A identidade visual é a única camada que deve divergir do upstream. A gramática
de movimento continua nativa: caminhar usa os quadros 0–2, digitar usa 3–4 e
ler usa 5–6. O papel branco que parece um envelope é a própria pose de leitura;
o projeto original não define um estado separado de “entrega de envelope”.

Providers externos devem traduzir consultas para um nome da taxonomia nativa
(`Read`, `Grep`, `Glob`, `WebFetch` ou `WebSearch`). Assim Codex, Hermes e os
demais usam os mesmos quadros de leitura que o Claude, sem duplicar lógica de
animação no cliente.

Ao terminar o trabalho, o personagem precisa caminhar um tile para fora do
assento — de preferência para trás da cadeira — antes de assumir a pose parada.
Trocar diretamente de sentado para idle no tile do assento faz o sprite parecer
em pé sobre a cadeira e não deve ser reintroduzido.
