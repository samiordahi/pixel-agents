# Atualizações do Pixel Agents no fork Ordahi

> **Bike Method — Phase 1:** toda atualização ainda passa por revisão humana.
>
> Adapted from The Three Ms of AI™ © 2026 Nate Herk.

Este repositório continua sendo a distribuição da Ordahi. O remoto oficial é
somente a fonte de atualizações:

- `origin`: `samiordahi/pixel-agents`, onde vivem as integrações e identidades;
- `upstream`: `pixel-agents-hq/pixel-agents`, somente leitura;
- `main`: versão Ordahi aprovada e publicável;
- `automation/upstream-<sha>`: branch descartável de integração.

## Fluxo automático

O workflow `Prepare upstream update` consulta `upstream/main` diariamente e
permanece silencioso quando não há novidade. Quando encontra commits novos:

1. cria uma branch de integração a partir do `main` Ordahi;
2. tenta o merge sem tocar no `main`;
3. interrompe e abre uma issue se houver conflito;
4. executa typecheck, testes unitários e empacotamento;
5. abre uma pull request apenas quando essa validação passa;
6. deixa publicação e atualização dos usuários fora da automação.

A CI normal da pull request executa a validação completa. O merge depende da
revisão das identidades, da ponte externa, da persistência e do Painel AIOS.

## Regra de distribuição

Usuários nunca recebem `upstream/main` diretamente. O futuro botão **Atualizar**
consulta exclusivamente releases assinadas/publicadas pelo fork Ordahi. Assim,
uma atualização oficial pode ser testada e adaptada sem substituir layout,
configuração ou dados locais de quem já instalou o AIOS.

## Limites da Phase 1

- não faz merge automático em `main`;
- não publica pacote ou release;
- não resolve conflitos por conta própria;
- não força nem sobrescreve branches já preparadas;
- não altera o remoto oficial.

Depois de várias atualizações reais sem regressão, a fase pode evoluir. A
aprovação da versão distribuída continua humana mesmo nas fases seguintes.
