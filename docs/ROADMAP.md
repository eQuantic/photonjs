# PhotonJS — Roadmap

Plano de execução em fases. Cada fase tem um **entregável demonstrável** e **critérios de
aceite**. Regra de ouro: sempre existe um "esqueleto que anda".

Direção fixada: base **`Component`** · núcleo de **sinais** (build-once) · **ilhas primeiro** ·
**design system Photon** compartilhado com o mobile (`equantic-ui`).

Legenda: 🟢 pequeno · 🟡 médio · 🔴 grande. Fases de componentes seguem o inventário do design
system: **A** (Primitivas), **B** (Dashboard), **C** (Surfaces & Patterns).

---

## Fase 0 — Fundação do monorepo 🟢

- Workspaces do Bun; `packages/*` (inclui `@photon/tokens`) e `engine/`.
- `tsconfig` strict + `tsgo` no CI. Biome. `bun test`.
- `@photon/tokens`: transcrever os tokens do Photon Design System (cores light/dark com os 5
  sub-tokens por variante, `Space.S1..S16`, `Radius`, `Elevation.E0..E5`, papéis tipográficos,
  `Motion`, ícones Lucide) como fonte única, agnóstica de plataforma.

**Aceite:** `bun install`, `bun test`, `tsgo --noEmit`, `go build ./...` verdes; tokens
importáveis e tipados.

---

## Fase 1 — Sinais + núcleo + Primitivas (A) 🔴

**Objetivo:** o "hello world" reativo roda no navegador. **Prova a tese.**

- `@photon/reactive`: `signal`, `computed`, `effect`, `batch`, `untrack` (auto-tracking,
  batching por microtask, disposição por escopo).
- `@photon/core`: `Component`, `StatelessComponent`, `StatefulComponent`, `State`, `Element`
  (dono do escopo reativo), `BuildContext`, `Key`. `build()` roda **1x**.
- `@photon/dom`: mount 1x + efeitos (patch cirúrgico), eventos, reconciliação **local** de
  `For`/`Show`/`Switch`.
- `@photon/components` (**Fase A**, mínimo p/ o exemplo): `Box`, `Row`, `Column`, `Stack`,
  `Spacer`, `Text`, `Icon`, `Image`, `Button`, `IconButton` + `Show`/`For`/`Switch`.

**Entregável:** `examples/counter` — contador com `signal` + lista com `For`/`Key`.

**Aceite:** mudar o sinal atualiza **só** o nó ligado (sem re-`build()`); `For` reordena
preservando estado por chave; efeitos liberados no `dispose`.

---

## Fase 2 — SSR + ilhas 🔴

- `@photon/server`: árvore → HTML (sinais lidos pelo valor atual), marcador + JSON por ilha,
  escape por padrão.
- `island(component, { on })` + diretivas `load|idle|visible|media(...)`.
- `@photon/dom`: hidratação de ilha (build 1x, adota DOM, liga efeitos/eventos); fora: 0 JS.
- Runtime HTTP mínimo (`Bun.serve`).

**Entregável:** `examples/blog` — post estático (0 JS) + ilhas.

**Aceite:** conteúdo sem JS; só ilhas baixam JS, no momento da diretiva; sem mismatch.

---

## Fase 3 — Roteamento por arquivos + CLI 🔴

- `@photon/router`: `app/`, layouts aninhados, `[slug]`, grupos, `not-found`/`error`/`loading`,
  `route.ts`. `loader`/`action`; remoção de server-only do bundle; rotas **tipadas**.
- `@photon/cli`: `photon dev` (HMR), `build`, `start`. Navegação client-side.

**Entregável:** `blog` com `/blog/[slug]` + `loader`, navegação SPA e ilhas.

**Aceite:** navegação sem full reload; `loader` só no servidor; link tipado quebra o build se
errado.

---

## Fase 4 — Estilo (tokens → CSS atômico) + Dashboard (B) 🔴

**Objetivo:** o design system, materializado na web.

- `@photon/styling`: props+tokens → **CSS atômico** (dedupe/minify) + **CSS custom properties**
  para theming light/dark (`prefers-color-scheme` + `data-theme`). `EdgeInsets`, `BoxDecoration`,
  `Border`, `TextStyle`, `ThemeData`.
- Layout gap-owned completo (`Stack`/`Positioned`, `Expanded`, `Wrap`, `Center`, `Grid`,
  `Divider`, `SafeArea`, `ScrollView`); tipografia (Hanken Grotesk self-hosted, papéis).
- `@photon/components` (**Fase B**): `Card`, `List`/`ListItem`, `AppBar`, `Tabs`, `Avatar`,
  `Badge`, `Chip`, `TextInput`, `SearchField`, `Checkbox`, `Switch`, `RadioGroup`,
  `ProgressBar`, `Spinner`, `Skeleton`, `EmptyState`, `Banner`, `BottomNavigation`.

**Aceite:** estilos iguais compartilham classes; troca de tema sem recarregar (só troca de
custom properties); componentes B com paridade visual ao design system.

---

## Fase 5 — Motor Go: imagens, compressão, cache 🔴

- `photon-engine` (Go): imagens (AVIF/WebP/JPEG, resize, quality), Brotli/Gzip, cache
  endereçado por conteúdo. `@photon/engine-rpc` (JSON-RPC: daemon no dev, batch no build).
- `Image` completo (`<picture>`/`srcset`, `width/height`, `priority`, lazy). Binários por
  plataforma.

**Aceite:** `Image` gera variantes com URL por hash e `immutable`; assets pré-comprimidos;
cache-hit não reprocessa.

---

## Fase 6 — Avançado: modos de render + Surfaces (C) + DX 🔴

- Modos por rota: **SSG**, **ISR** (`revalidateTag`), **app/full hydration**, **streaming SSR**
  (`AsyncBuilder`/`FutureBuilder`).
- `@photon/components` (**Fase C**): `BottomSheet`, `Modal`/`Dialog`, `Toast`, `Drawer`,
  `SegmentedControl`, `Slider`, `Stepper`, `Accordion`, `Tooltip`, `Select`, `DatePicker`.
- Transform opcional de thunks (DX Solid-like). (Pesquisa) resumability.

**Aceite:** ISR revalida sob demanda; streaming entrega shell + partes lentas; componentes C
respeitam movimento/elevação do design system (`prefers-reduced-motion`).

---

## Fase 7 — DX, docs e ecossistema 🟡

- `create-photon` com templates. Site de docs + referência + guia "de Flutter/Next/Solid para
  Photon". API de plugins; devtools (inspetor de sinais/efeitos e de ilhas). Erros didáticos.

**Aceite:** `bun create photon@latest my-app && bun dev` roda em <1 min.

---

## Marcos

| Marco | Fases | Significa |
| --- | --- | --- |
| **M1 — Prova da tese** | 0–2 | `Component`s + sinais renderizam via SSR e hidratam por ilhas. |
| **M2 — Framework usável** | 3–5 | Rotas, CLI, design system (tokens+B) e imagens/cache. Site real. |
| **M3 — Pronto p/ fora** | 6–7 | Modos avançados, componentes C, DX, docs, scaffolder. |

## Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Ergonomia de thunks sem JSX | Regra única (estático vs thunk); transform na Fase 6 |
| `Show/For` no lugar de `if/for` | Documentar como análogo do list-builder; erros didáticos |
| Ecossistema zero (sem React) | Inventário A/B/C do design system dá base forte; plugins cedo |
| Paridade visual web↔mobile | Tokens únicos em `@photon/tokens`; respeitar o "v1 fence" nos compartilhados |
| Hidratação de ilha com mismatch | Marcadores determinísticos + testes de hidratação (Fase 2) |
| Distribuição do binário Go | Padrão esbuild (optional-deps) + fallback local |
| Sinais: vazamento de efeitos | Disposição por escopo desde a Fase 1; devtools na Fase 7 |
