# Photon — Roadmap

Plano de execução em fases. Cada fase tem um **entregável demonstrável** (um app que roda) e
**critérios de aceite**. Regra de ouro: sempre existe um "esqueleto que anda".

Direção fixada: **núcleo de sinais** (build-once) · **ilhas primeiro** (partial hydration).

Legenda de tamanho: 🟢 pequeno · 🟡 médio · 🔴 grande.

---

## Fase 0 — Fundação do monorepo 🟢

**Objetivo:** repositório navegável, tooling pronto, CI verde.

- Workspaces do Bun; `packages/*` e `engine/` com `package.json`/`go.mod`.
- `tsconfig.json` base (strict) + `tsgo` no CI. Biome. `bun test`.
- CI: type-check (tsgo) + lint + testes + `go build ./...`.

**Aceite:** `bun install`, `bun test`, `tsgo --noEmit` e `go build ./...` passam no CI.

---

## Fase 1 — Sinais + núcleo de widgets + render no cliente 🔴

**Objetivo:** o "hello world" reativo roda no navegador. **É a fase que prova a tese.**

- `@photon/reactive`: `signal`, `computed`, `effect`, `batch`, `untrack` (grafo reativo com
  auto-tracking, batching por microtask, disposição por escopo).
- `@photon/core`: `Widget`, `StatelessWidget`, `StatefulWidget`, `State`, `Element` (dono do
  escopo reativo), `BuildContext`, `Key`. `build()` roda **1x**.
- `@photon/dom`: mount da árvore em DOM (1x) + efeitos que fazem patch cirúrgico; binding de
  eventos; reconciliação **local** de `For`/`Show`/`Switch`.
- `@photon/widgets` (mínimo): `Text` (aceita `Reactive<string>`), `Box/Div`, `Column`,
  `Row`, `Button`, `Image`, e o controle de fluxo `Show`/`For`/`Switch`.

**Entregável:** `examples/counter` — contador com `signal`, e uma lista com `For` + `Key`.

**Aceite:** mudar o sinal atualiza **só** o nó de texto ligado (verificável por contagem de
mutações de DOM), sem re-`build()`; `For` reordena preservando estado/DOM por chave; efeitos
são liberados no `dispose`.

---

## Fase 2 — SSR + ilhas (hidratação parcial) 🔴

**Objetivo:** HTML estático que "acorda" só nas ilhas.

- `@photon/server`: árvore → string de HTML (sinais lidos pelo valor atual), com marcador +
  JSON de estado inicial **por ilha**. Escape por padrão.
- `island(widget, { on })` + diretivas `load|idle|visible|media(...)`.
- `@photon/dom`: hidratação de ilha — roda `build()` 1x, **adota o DOM** existente, liga
  efeitos e eventos. Fora das ilhas: 0 JS.
- Runtime HTTP mínimo com `Bun.serve`.

**Entregável:** `examples/blog` — post estático (0 JS) com ilhas `LikeButton`/`CommentBox`.

**Aceite:** conteúdo visível sem JS; só as ilhas embarcam/baixam JS, no momento da diretiva;
sem mismatch de hidratação.

---

## Fase 3 — Roteamento por arquivos + CLI 🔴

**Objetivo:** de "páginas" para "um app com rotas".

- `@photon/router`: varredura de `app/`, layouts aninhados, `[slug]`, grupos `(group)`,
  `not-found`/`error`/`loading`, `route.ts` de API.
- `loader`/`action`; injeção de dados (vira sinal inicial na ilha); remoção de código
  server-only do bundle.
- Rotas **tipadas** para `Link` e `router.push`.
- `@photon/cli`: `photon dev` (watch + HMR), `photon build`, `photon start`.
- Navegação client-side (intercepta `Link`, busca dados+chunk, monta a rota).

**Entregável:** `blog` com `/blog/[slug]` + `loader`, navegação SPA e ilhas.

**Aceite:** navegação sem full reload; `loader` roda só no servidor; link tipado quebra o
build se rota/param errado.

---

## Fase 4 — Estilo: props → CSS atômico 🟡

**Objetivo:** estilizar como no Flutter, com CSS zero-runtime.

- `@photon/styling`: `EdgeInsets`, `Colors`, `BoxDecoration`, `BorderRadius`, `TextStyle`,
  `ThemeData`, `MediaQuery`.
- Extração de CSS atômico em build (dedupe + minify) → folha única com hash imutável.
- Props de estilo reativas (troca de classe via efeito).
- Layout completo (`Stack`/`Positioned`, `Expanded`, `Wrap`, `Center`, `Grid`); tema via
  `InheritedWidget`; `prefers-color-scheme`.

**Aceite:** páginas com estilos iguais compartilham classes; CSS extraído (não runtime);
troca de tema sem recarregar, cirúrgica.

---

## Fase 5 — Motor Go: imagens, compressão, cache 🔴

**Objetivo:** o diferencial de performance de assets.

- `engine/`: `photon-engine` (Go) — imagens (AVIF/WebP/JPEG, resize, quality),
  pré-compressão Brotli/Gzip, cache endereçado por conteúdo.
- `@photon/engine-rpc`: cliente JSON-RPC (daemon no dev, batch no build).
- Widget `Image` completo (`<picture>`/`srcset`, `width/height`, `priority`, lazy).
- Distribuição de binários pré-compilados por plataforma.

**Aceite:** `<Image>` gera variantes com URL por hash e `Cache-Control: immutable`; assets
pré-comprimidos; cache-hit não reprocessa.

---

## Fase 6 — Avançado: modos de render + DX 🔴

**Objetivo:** paridade com frameworks maduros.

- Modos por rota: **SSG**, **ISR** (revalidação por tag/TTL, `revalidateTag`), **app/full
  hydration** (rota-ilha), **streaming SSR** (`AsyncBuilder`/`FutureBuilder`).
- Transform opcional de build-time p/ thunks automáticos (DX Solid-like) — §3.5.
- (Pesquisa) _resumability_ estilo Qwik como evolução da hidratação.

**Aceite:** ISR revalida sob demanda; streaming entrega shell + partes lentas; DX de thunks
melhora sem quebrar API.

---

## Fase 7 — DX, docs e ecossistema 🟡

**Objetivo:** alguém de fora constrói um app.

- `create-photon` com templates (counter, blog, dashboard).
- Site de docs + referência de API + guia "de Flutter/Next/Solid para Photon".
- API de plugins (`photon.config.ts`); devtools (inspetor de sinais/efeitos e de ilhas).
- Mensagens de erro de primeira linha.

**Aceite:** `bun create photon@latest my-app && bun dev` entrega app rodando em <1 min.

---

## Marcos

| Marco | Fases | Significa |
| --- | --- | --- |
| **M1 — "Prova da tese"** | 0–2 | Widgets Flutter-like + sinais renderizam via SSR e hidratam por ilhas. |
| **M2 — "Framework usável"** | 3–5 | Rotas, CLI, estilo e imagens/cache. Dá pra fazer um site real. |
| **M3 — "Pronto p/ gente de fora"** | 6–7 | Modos avançados, DX, docs, scaffolder. |

## Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Ergonomia de thunks sem JSX | Regra única (estático vs thunk); transform build-time na Fase 6 |
| `Show/For` no lugar de `if/for` estranha p/ iniciantes | Documentar como análogo do `ListView.builder`; erros didáticos |
| Ecossistema zero (sem React) | Biblioteca de widgets forte desde a Fase 1; plugins cedo |
| Hidratação de ilha com mismatch | Marcadores determinísticos + testes de hidratação na Fase 2 |
| Distribuição do binário Go | Padrão esbuild (optional-deps) + fallback de build local |
| Sinais: vazamento de efeitos | Disposição por escopo (owner) desde a Fase 1; devtools na Fase 7 |
