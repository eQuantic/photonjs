# Photon — Roadmap

Plano de execução em fases. Cada fase tem um **entregável demonstrável** (um app que roda)
e **critérios de aceite**. A regra de ouro: sempre existe um "esqueleto que anda" — nunca
passamos meses sem algo executável.

Legenda de tamanho: 🟢 pequeno · 🟡 médio · 🔴 grande.

---

## Fase 0 — Fundação do monorepo 🟢

**Objetivo:** repositório navegável, tooling pronto, CI verde.

- Workspaces do Bun; `packages/*` e `engine/` vazios com `package.json`/`go.mod`.
- `tsconfig.json` base (strict) + `tsgo` no CI para type-check.
- Biome (lint/format). `bun test` configurado.
- CI: type-check (tsgo) + lint + testes + `go build` do engine.

**Aceite:** `bun install`, `bun test`, `tsgo --noEmit` e `go build ./...` passam no CI.

---

## Fase 1 — Núcleo de widgets + render no cliente 🔴

**Objetivo:** o "hello world" do Photon roda no navegador. **É a fase que prova a tese.**

- `@photon/core`: `Widget`, `StatelessWidget`, `StatefulWidget`, `State`, `Element`
  (`ComponentElement`/`RenderElement`), `BuildContext`, `Key`, `canUpdate`.
- Reconciliador (§3.2 da arquitetura): update no lugar, casamento de filhos por chave,
  agendamento via microtask.
- `@photon/dom`: mount da árvore de `Element`s em DOM real, binding de eventos, patch.
- `@photon/widgets` (mínimo): `Text`, `Box/Div`, `Column`, `Row`, `Button`, `Image`.

**Entregável:** `examples/counter` — contador Stateful reconciliando no cliente.

**Aceite:** clicar no botão atualiza **só** o nó de texto (verificável via mutação de DOM);
`State` preservado entre rebuilds; reordenar lista com `Key` preserva estado dos itens.

---

## Fase 2 — SSR + hidratação 🔴

**Objetivo:** a mesma página renderiza no servidor e "acorda" no cliente.

- `@photon/server`: `Element` tree → string de HTML, com marcadores de hidratação e estado
  serializado. Escape de HTML por padrão.
- `@photon/dom`: modo hidratação — adota o DOM do servidor em vez de recriá-lo.
- Runtime HTTP mínimo com `Bun.serve`.

**Entregável:** `counter` renderizado por SSR e interativo após hidratar.

**Aceite:** HTML válido sem JS (conteúdo visível); após hidratar, interatividade funciona;
sem "flash"/mismatch de hidratação.

---

## Fase 3 — Roteamento por arquivos + CLI 🔴

**Objetivo:** de "uma página" para "um app com rotas".

- `@photon/router`: varredura de `app/`, layouts aninhados, segmentos dinâmicos `[slug]`,
  grupos `(group)`, `not-found`/`error`/`loading`.
- `loader`/`action`; injeção de dados no widget; remoção de código server-only do bundle.
- Rotas **tipadas** (geração de tipos) para `Link` e `router.push`.
- `@photon/cli`: `photon dev` (watch + HMR), `photon build`, `photon start`.
- Navegação client-side (intercepta `Link`, busca dados+chunk, reconcilia).

**Entregável:** `examples/blog` — lista + `/blog/[slug]` com `loader`.

**Aceite:** navegação SPA sem full reload; `loader` roda só no servidor; link tipado quebra
o build se a rota/param estiver errado.

---

## Fase 4 — Estilo: props → CSS atômico 🟡

**Objetivo:** estilizar como no Flutter, com CSS zero-runtime.

- `@photon/styling`: `EdgeInsets`, `Colors`, `BoxDecoration`, `BorderRadius`, `TextStyle`,
  `ThemeData`, `MediaQuery`.
- Extração de CSS atômico em build (dedupe + minify) → folha única com hash imutável.
- Widgets de layout completos (`Stack`/`Positioned`, `Expanded`, `Wrap`, `Center`, `Grid`).
- Tema via `InheritedWidget`; `prefers-color-scheme`.

**Aceite:** duas páginas com estilos iguais compartilham classes atômicas; CSS extraído,
não em runtime; troca de tema sem recarregar.

---

## Fase 5 — Motor Go: imagens, compressão, cache 🔴

**Objetivo:** o diferencial de performance de assets.

- `engine/`: `photon-engine` (Go) — otimização de imagens (AVIF/WebP/JPEG, resize, quality),
  pré-compressão Brotli/Gzip, cache endereçado por conteúdo.
- `@photon/engine-rpc`: cliente JSON-RPC (daemon no dev, batch no build).
- Widget `Image` completo (`srcset`/`<picture>`, `width/height`, `priority`, lazy).
- Distribuição de binários pré-compilados por plataforma.

**Aceite:** `<Image>` gera variantes otimizadas com URL por hash e `Cache-Control:
immutable`; assets servidos pré-comprimidos; cache-hit não reprocessa.

---

## Fase 6 — Avançado: modos de render + hot reload com estado 🔴

**Objetivo:** paridade de recursos com frameworks maduros + a feature-assinatura.

- Modos por rota: **SSG**, **ISR** (revalidação por tag/TTL, `revalidateTag`), **ilhas**
  (partial hydration), **streaming SSR** (`AsyncBuilder`/`FutureBuilder`).
- **Hot reload preservando estado** (re-`build()` sobre `Element`s vivos) — como Flutter.
- Sinais opcionais (`Signal`/`Computed`) como otimização (rumo ao modelo híbrido §3.1-C).

**Aceite:** página de ilhas embarca JS só das ilhas; ISR revalida sob demanda; editar UI no
dev não zera o estado da tela.

---

## Fase 7 — DX, docs e ecossistema 🟡

**Objetivo:** alguém de fora consegue construir um app.

- `create-photon` (scaffolder) com templates (counter, blog, dashboard).
- Site de documentação + referência de API + guia "de Flutter/Next para Photon".
- API de plugins (`photon.config.ts`), devtools (inspetor de árvore de `Element`s).
- Mensagens de erro de primeira linha (dica de hidratação, chave faltando, etc.).

**Aceite:** `bun create photon@latest my-app && bun dev` entrega um app rodando em <1 min.

---

## Marcos (visão macro)

| Marco | Fases | Significa |
| --- | --- | --- |
| **M1 — "Prova da tese"** | 0–2 | Widgets Flutter-like renderizam via SSR e hidratam. |
| **M2 — "Framework usável"** | 3–5 | Rotas, CLI, estilo e imagens/cache. Dá pra fazer um site real. |
| **M3 — "Pronto para gente de fora"** | 6–7 | Modos avançados, hot reload com estado, docs, scaffolder. |

## Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Reconciliador lento vs sinais | Começar simples; medir; migrar para híbrido (§3.1-C) sem quebrar API |
| Ecossistema zero (sem React) | Biblioteca de widgets forte desde a Fase 1; API de plugins cedo |
| Verbal sem JSX | Factory functions ergonômicas + helpers de composição; medir DX real |
| Fronteira server/cliente confusa | Regras explícitas (`loader`/`action`/`*.server.ts`); erros didáticos |
| Distribuição do binário Go | Padrão esbuild (optional-deps por plataforma) + fallback de build local |
