# Photon (web) — Arquitetura

> Documento vivo. Registra as decisões de design do **PhotonJS** e o racional por trás delas.
> **[DECISÃO ABERTA]** = ainda depende de você.
>
> **Decisões tomadas (jul/2026):** abstração-base **`Component`** (não "Widget") · núcleo de
> **sinais** (build-once) · hidratação **por ilhas primeiro** · design system **compartilhado
> com o Photon Mobile (`equantic-ui`)**.

---

## 0. Photon é cross-platform; PhotonJS é o renderer web

O Photon é um **sistema de UI cross-platform**, definido por um design system e um modelo de
composição de `Component`s. Ele tem (pelo menos) dois renderers:

| Alvo | Renderer | Como desenha |
| --- | --- | --- |
| **Mobile** | `equantic-ui` (Photon Mobile) | Motor nativo próprio (SDF, HarfBuzz, FreeType, glyph atlas) |
| **Web** | **PhotonJS** (este repo) | DOM semântico + CSS |

Os dois **compartilham**: o design system (tokens de cor/tipo/espaço/raio/elevação/movimento),
o **inventário de componentes** (`Box`, `Row`, `Column`, `Card`, `Button`, …) e a **API de
`Component`** (composição, Stateless/Stateful). O que difere é só o back-end de desenho.

Consequência prática: um dev que sabe Photon Mobile escreve PhotonJS sem reaprender nada, e o
código de UI tem forte paridade visual entre plataformas. O PhotonJS mantém-se **compatível
com o "v1 fence"** do motor mobile para os componentes compartilhados (mesma aparência),
liberando recursos exclusivos de web só via escape hatches explícitos.

---

## 1. Filosofia

1. **A UI é uma árvore de composição declarativa** de `Component`s — a ergonomia do Flutter,
   com o vocabulário do **composite pattern (GoF)**, onde a abstração-base chama-se, como
   deve, `Component`.
2. **Composite pattern em todo lugar.** `Component` é o _Component_ (base); `Text`/`Image`
   são _Leaves_; `Row`/`Column`/`Card` são _Composites_ (têm `children`). Tudo é `Component`.
3. **Reatividade de granularidade fina.** Muda um valor → muda **só o nó de DOM ligado a
   ele**, sem re-executar `build()`. Modelo de _sinais_ (Solid-like).
4. **Design system de primeira classe.** Cores, tipografia, espaço, raio e elevação são
   **tokens nomeados** do Photon Design System — não valores mágicos soltos.

---

## 2. Conceitos centrais

### 2.1 As três árvores

| Árvore | O que é | Vida | Papel sob sinais |
| --- | --- | --- | --- |
| **Component** | Configuração declarativa. O que `build()` retorna. | Efêmera (montada 1x) | Descreve estrutura e "buracos reativos" |
| **Element** | Instância viva. Dona do **escopo reativo** (efeitos/limpeza), ciclo de vida, contexto (DI), chaves. | Persistente | Owner de efeitos; hospeda reconciliação **local** de `For`/`Show` |
| **Node** | Alvo de render: **DOM** (cliente) / **buffer HTML** (servidor). | Persistente | Atualizado cirurgicamente por efeitos |

Não há diff de árvore inteira: `build()` roda uma vez e estabelece efeitos que atualizam o DOM.
Reconciliação estrutural só acontece **localmente** em `For`/`Show`/`Switch`. Layout e paint
são do navegador (CSS) — a terceira árvore é o DOM.

```
  build() [1x]          efeitos reativos
Component ─────────▶ Element ──────────────▶ Node (DOM | HTML)
(estrutura)          (escopo reativo)    (patch cirúrgico por sinal)
```

### 2.2 Component

```ts
abstract class Component {
  readonly key?: Key;
  abstract createElement(): Element;
}

// O que o usuário escreve:
abstract class StatelessComponent extends Component {
  abstract build(context: BuildContext): Component;
  createElement(): Element { return new StatelessElement(this); }
}

abstract class StatefulComponent extends Component {
  abstract createState(): State<this>;
  createElement(): Element { return new StatefulElement(this); }
}

// Componentes "host" (folhas/composições que viram DOM) — de @photon/components:
//   Text, Box, Row, Column, Stack, Spacer, Icon, Image, Button, Card, ...
```

> Sob _build-once_, um `StatelessComponent` é uma **função de setup** que roda uma vez. Por
> isso o Photon também aceita **componentes-função** (`const Avatar = (p) => Image({...})`).
> Mantemos as classes para o modelo mental, `Key` e ciclo de vida.

### 2.3 Stateless vs Stateful (com sinais)

**Stateless** = sem estado próprio; **Stateful** = estado (sinais) + ciclo de vida.

```ts
class Avatar extends StatelessComponent {
  constructor(readonly url: string, readonly size = Space.S10) { super(); }
  build(ctx: BuildContext): Component {
    return Image({ src: this.url, width: this.size, height: this.size,
      decoration: BoxDecoration({ borderRadius: Radius.Full }) });
  }
}

class Counter extends StatefulComponent {
  constructor(readonly start = 0) { super(); }
  createState() { return new CounterState(); }
}

class CounterState extends State<Counter> {
  count = signal(this.component.start);           // this.component = a config (era this.widget)
  doubled = computed(() => this.count.value * 2);

  override initState() { /* efeitos, timers */ }
  override dispose()   { /* limpeza (efeitos do escopo são liberados sozinhos) */ }

  build(ctx: BuildContext): Component {
    return Row({
      gap: Space.S3,
      children: [
        Text(() => `Contagem: ${this.count.value} (x2 = ${this.doubled.value})`),
        Button({ label: "+1", onPressed: () => this.count.value++ }),  // sem setState
      ],
    });
  }
}
```

Regra ergonômica: **valor estático → escreva o valor**; **valor reativo → thunk ou sinal**.

Ciclo de vida do `State`: `initState` (1x) → `build` (1x) → efeitos sob demanda → `dispose`.
Sem `didUpdateWidget`: props que mudam são **sinais** passados para baixo.

### 2.4 BuildContext

```ts
interface BuildContext {
  dependOnInherited<T>(type: InheritedType<T>): T;  // DI (§4)
  readonly router: Router;
  readonly theme: ThemeData;                        // tokens do design system (§5)
  readonly media: MediaQueryData;                   // viewport, prefers-color-scheme...
  readonly request?: RequestContext;                // servidor: headers, cookies, params
  onDispose(fn: () => void): void;
}
```

### 2.5 Key

Identidade de reconciliação (sobretudo em `For`). `ValueKey`/`ObjectKey`/`UniqueKey` — casa por
identidade para listas reordenáveis preservarem estado e DOM.

---

## 3. Reatividade: sinais + escrita de componentes

**[DECISÃO TOMADA]** Sinais de granularidade fina, auto-tracking, modelo **build-once**.

### 3.1 Modelo de execução

`build()` roda **1x** (setup). Estado em **sinais**; ler `signal.value` num escopo reativo
assina; escrever atualiza **só** os nós que leram. Batching por microtask; `batch(fn)` agrupa.

### 3.2 Primitivas (`@photon/reactive`)

```ts
const count   = signal(0);
const doubled = computed(() => count.value * 2);
effect(() => console.log(count.value));
batch(() => { count.value++; count.value++; });
untrack(() => count.value);
```

**Props reativas** — toda prop aceita valor estático ou reativo:

```ts
type Reactive<T> = T | Signal<T> | (() => T);
// Text("Olá")                    → nó fixo
// Text(() => user.name.value)    → atualiza só este texto
```

### 3.3 Controle de fluxo reativo

Como `build()` roda 1x, use componentes reativos (não `if`/`for`):

```ts
Show({ when: () => auth.loggedIn.value, child: Dashboard(), fallback: Login() })
For({ each: () => todos.value, key: (t) => t.id, builder: (t) => TodoRow(t) })  // ~ list builder
Switch({ children: [ Match({ when: ..., child: ... }), ... ] })
```

`For`/`Show`/`Switch` são os únicos pontos de reconciliação estrutural — **local e keyed**.

### 3.4 `setState`? Substituído por sinais

Estado é sinal; mutação é atribuição; `batch` agrupa. (Interop: `Signal<T>` implementa
`Listenable`, então padrões `ValueListenableBuilder` do Flutter têm equivalente direto.)

### 3.5 DX: transform opcional p/ thunks automáticos

Um plugin de build pode envolver leituras de sinal em thunks, dando ergonomia Solid-like sem
thunk manual. **[DECISÃO ABERTA]** explícito na v1 (recomendado), transform depois.

---

## 4. Estado compartilhado e injeção de dependência

- **`InheritedComponent` / `Provider<T>`** — fornece um valor (tipicamente um **store de
  sinais**) para baixo, lido em O(1) via `context.dependOnInherited(Type)`. Base de tema,
  sessão, router, stores.
- **Stores** — objeto com sinais/`computed`, fornecido por `Provider`, consumido em qualquer
  componente.
- **`Listenable`** — interop com fontes observáveis externas.

```ts
const CartProvider = createProvider<CartStore>();
CartProvider.provide(new CartStore(), { child: AppShell() });
const cart = ctx.dependOnInherited(CartProvider);
Text(() => `Total: ${cart.total.value}`);
```

---

## 5. Design system — tokens do Photon na web

**[DECISÃO TOMADA]** O PhotonJS adota **os tokens canônicos do Photon Design System**
(definidos em `equantic-ui`). O pacote `@photon/tokens` guarda os valores agnósticos de
plataforma; `@photon/styling` os materializa na web.

### 5.1 Estilo = props tipadas com tokens → CSS atômico

Nada de CSS solto: estilo são **props de `Component` usando tokens nomeados**, compiladas em
**CSS atômico** extraído em build + uma camada de **CSS custom properties** para os tokens
(que dá o theming light/dark sem custo de runtime).

```ts
Container({
  padding: EdgeInsets.all(Space.S4),          // 16
  color: Colors.Surface,                        // var(--ph-surface)
  decoration: BoxDecoration({
    borderRadius: Radius.Lg,                    // 14
    boxShadow: Elevation.E1,                     // sombra "card em repouso"
    border: Border.all(Colors.Border),
  }),
  child: Title("Olá"),                          // papel tipográfico (§5.4)
});
```

→ em build:

```css
:root{--ph-surface:#FFFFFF;--ph-border:#E2E5EA;/* ...todos os tokens... */}
:root[data-theme="dark"]{--ph-surface:#14181E;--ph-border:#2A323D;/* ... */}
.p-16{padding:16px}.bg-surface{background:var(--ph-surface)}.rounded-lg{border-radius:14px}
.shadow-e1{box-shadow:0 1px 3px rgba(15,23,32,.10)}.border-1{border:1px solid var(--ph-border)}
```

Props de estilo **reativas** (ex.: `color: () => …`) trocam classe/var por efeito — cirúrgico.

### 5.2 Cores (tokens)

Valores canônicos vêm do design system; a API espelha o esquema `Variante.SubToken`:

- **Base/superfície:** `Colors.Background`, `Colors.Surface`, `Colors.SurfaceSubtle`,
  `Colors.Border`, `Colors.BorderStrong`.
- **Texto:** `Colors.Text.Primary | Secondary | Muted | Inverse`.
- **Variantes interativas** (cada uma com 5 sub-tokens): `Primary`, `Secondary`, `Destructive`,
  `Success`, `Warning`, `Info` — `Colors.Primary.Base | OnBase | Pressed | Subtle | OnSubtle`.
- **Funcionais:** `Colors.Focus`, `Colors.Scrim`, `Colors.Link`.

Todos com par light/dark; contraste WCAG já verificado no design system. Na web, cada token é
uma custom property (`--ph-primary-base`, …) trocada por `[data-theme]` + `prefers-color-scheme`.

### 5.3 Espaço, raio, elevação, movimento

| Escala | API | Valores (do design system) |
| --- | --- | --- |
| **Espaço** (base 4) | `Space.S1..S16` | 4·8·12·16·20·24·32·40·48·64 |
| **Raio** | `Radius.{Xs,Sm,Md,Lg,Xl,Full}` | 4·6·10·14·20·pill |
| **Elevação** | `Elevation.E0..E5` | sombras; **dark: E1–E2 ganham borda 1px** |
| **Movimento** | `Motion.{Standard,Decelerate,Spring}` + `Duration.{Fast,Base,Slow}` | 100/200/300ms; respeita `prefers-reduced-motion` (crossfade 120ms) |

**Modelo de layout gap-owned:** sem margens — espaçamento é `gap` (em `Row`/`Column`) + padding
interno. Componentes não usam valores fora da escala. (Idêntico à regra do design system.)

### 5.4 Tipografia

Papéis do design system viram componentes/estilos de texto (fonte **Hanken Grotesk**,
self-hosted em woff2; `tnum` para dados):

```ts
Display("1.240")   Heading("Título da tela")   Title("Título do card")
Body("Texto de leitura", { size: "L" | "M" })   Label("CONTROLES")   Caption("há 2 min")
// equivalência: Text("x", { style: TextStyle.Title })
```

| Papel | Size/LH/Weight | Uso |
| --- | --- | --- |
| Display | 34 / 1.18 / 800 | números-herói |
| Heading | 28 / 1.2 / 700 | títulos de tela |
| Title | 20 / 1.3 / 600 | títulos de card/seção |
| Body/L·M | 17·15 / 1.45·1.4 / 400 | leitura / UI densa |
| Label | 13 / 1.23 / 600 | controles, nav, chips |
| Caption | 12 / 1.33 / 500 | meta, timestamps |

### 5.5 Ícones

Set **Lucide** (o mesmo do design system). Na web: SVGs tree-shakeable (ou icon-font),
herdando `currentColor`, tamanhos canônicos `16/20/24/32`:

```ts
Icon(Icons.search, { size: 20 })   IconButton({ icon: Icons.more, onPressed })
```

### 5.6 Inventário de componentes (paridade com o design system)

`@photon/components` implementa o inventário A/B/C na web:

- **A — Primitivas:** `Box`, `Row`, `Column`, `Stack`, `Spacer`, `SafeArea`, `ScrollView`,
  `Divider`, `Text`, `Heading`/`Label`, `Icon`, `Image`, `Button`, `IconButton`.
- **B — Dashboard:** `Card`, `List`/`ListItem`, `AppBar`, `BottomNavigation`, `Tabs`,
  `Avatar`, `Badge`, `Chip`, `TextInput`, `SearchField`, `Checkbox`, `Switch`, `RadioGroup`,
  `ProgressBar`, `Spinner`, `Skeleton`, `EmptyState`, `Banner`.
- **C — Surfaces & Patterns:** `BottomSheet`, `Modal`/`Dialog`, `ActionSheet`, `Toast`,
  `Drawer`, `SegmentedControl`, `Slider`, `Stepper`, `PullToRefresh`, `SwipeableRow`,
  `Accordion`, `PageIndicator`, `Tooltip`, `Select`, `DatePicker`.

Ordem de implementação = ordem das fases (§ROADMAP): A na Fase 1, B na 4–6, C depois.

---

## 6. Renderização: ilhas primeiro

**[DECISÃO TOMADA]** Primária = **ilhas** (partial hydration). Página é HTML estático inerte;
só **ilhas** embarcam JS e hidratam. Com sinais, cada ilha é um grafo pequeno e independente
→ hidratação barata, local, paralelizável.

```ts
export default class Post extends StatelessComponent {
  build(ctx: BuildContext): Component {
    return Article({ children: [
      Prose(this.content),                                  // 0 JS
      island(LikeButton(this.postId), { on: "visible" }),
      island(CommentBox(this.postId), { on: "idle" }),
    ]});
  }
}
```

Diretivas por ilha: `on: "load" | "idle" | "visible" | "media(...)"`.

| Modo (por rota) | Uso |
| --- | --- |
| **SSG** (default) | Estático → CDN; ilhas hidratam |
| **SSR** | Por-requisição; ilhas hidratam |
| **ISR** | SSG + revalidação por tag/TTL |
| **App / full hydration** | Rota inteira vira ilha (opt-in) |

**SSR + hidratação:** servidor monta a árvore (sinais lidos pelo valor atual) → HTML com
marcador + JSON de estado **por ilha**; cliente carrega o chunk da ilha, roda `build()` 1x,
**adota o DOM** e liga efeitos/eventos. **Streaming SSR** via `Bun.serve` + `AsyncBuilder`.
Futuro: _resumability_ (Qwik-like) como evolução.

---

## 7. Roteamento por arquivos (estrutura fixa)

Convenção de nomes **`nome.papel.ts`** (estilo NestJS — ADR 0002); roteamento **por pasta**.

```
app/
  app.layout.ts                       → shell raiz
  home.page.ts                        → "/"
  about/about.page.ts                 → "/about"
  blog/
    blog.layout.ts                    → layout de /blog
    blog.page.ts                      → "/blog"
    [slug]/post.page.ts               → "/blog/:slug"   ([param] = segmento dinâmico)
  (marketing)/pricing/pricing.page.ts → "/pricing"      ((grupo) não afeta a URL)
  api/hello/hello.route.ts            → "/api/hello"
```

Regra: **pasta = URL**; dentro da pasta o router acha o único `*.page.ts` + opcionais
`*.layout.ts`/`*.error.ts`/`*.loading.ts`/`*.not-found.ts`; `*.route.ts` = endpoint de API. O
prefixo (nome) é livre. Um `*.page.ts` exporta `default` (o `Component`) e opcionais `loader`
(server-only, dados), `action` (mutação server-only), `metadata` (SEO), `config`
(`render: ssg|ssr|isr|app`). **Rotas tipadas:** `Link`/`router.push` verificados em compile-time.

---

## 8. Fronteira servidor/cliente e dados

Fronteira **codificada no nome do arquivo** (ADR 0002):

- **`*.server.ts` / `*.route.ts` / `*.loader.ts` / `*.action.ts`** — server-only; **nunca** vão
  ao bundle do cliente (e `loader`/`action` exportados de um `*.page.ts` idem).
- **`*.island.ts`** — o **único** ponto que embarca JS no cliente; ganha **chunk próprio**. O
  *quando* hidratar vem do use-site: `island(Comp, { on: "load|idle|visible|media" })`.
- **Universal** — todo o resto: renderiza no servidor; só vai ao cliente se alcançável por ilha.
- **`loader`** retorna dados serializáveis (viram sinal inicial na ilha); **`action`** é mutação
  com progressive enhancement.

Cache de dados: `cache(fn, { tags, revalidate })` + `revalidateTag(tag)` (ISR).

---

## 9. Cache (unificado)

Quatro camadas endereçadas por conteúdo: **build** (`hash(fonte+config)`), **asset** (nomes
com hash → `immutable`), **data** (loader/`cache()` com tags+TTL), **page** (HTML SSG/ISR). O
**motor Go** mantém o cache em disco, compartilhado por `dev`/`build`/`start`.

---

## 10. Imagens — `Image` + motor Go

```ts
Image({ src: "/hero.jpg", width: 1280, quality: 80, format: "auto", priority: true });
```

`photon-engine` (Go): resize + AVIF→WebP→JPEG, saída endereçada por conteúdo; o componente
emite `<picture>`/`srcset`, `width/height` (sem layout shift), `loading`/`fetchpriority`. URLs
por hash ⇒ `immutable`. Também faz **pré-compressão** Brotli/Gzip dos assets.

---

## 11. `photon-engine` (Go) — responsabilidades e protocolo

**Responsabilidades:** imagens · compressão Brotli/Gzip · cache endereçado por conteúdo ·
(avançado) servidor estático/edge para `photon start`.

**[DECISÃO ABERTA] Lib de imagens:** libvips via `govips` (qualidade, recomendado) vs pure-Go
(distribuição trivial). **Protocolo:** dev = daemon JSON-RPC sobre stdio; build = batch CLI.
**Distribuição:** binários pré-compilados por plataforma (padrão esbuild) + fallback local.

> Especificação completa (mensagens JSON-RPC, pipeline de imagem, chave de cache endereçada por
> conteúdo, compressão e distribuição): **[`docs/ENGINE.md`](ENGINE.md)**.

---

## 12. Toolchain: Bun + TypeScript 7

| Ferramenta | Papel |
| --- | --- |
| **Bun** | Runtime (`Bun.serve`), transpile, bundle/split, package manager, testes, `bun:sqlite` |
| **TypeScript 7 (`tsgo`)** | Type-check (nativo em Go, ~10x); gate no CI |
| **Go** | `photon-engine` |
| **Biome** | Lint + format |

`dev`: watcher + HMR via WebSocket — com sinais, o hot reload recria só a ilha editada,
preservando o estado das demais. `build`: grafo server+client → split por ilha → CSS atômico +
custom properties → imagens/compressão (Go) → manifest.

---

## 13. Monorepo e pacotes

```
photonjs/
  packages/
    tokens/      @photon/tokens       Tokens do Photon Design System (cores/tipo/espaço/raio/elevação/movimento) — espelha equantic-ui
    reactive/    @photon/reactive     signal, computed, effect, batch, Show/For/Switch, Provider/InheritedComponent
    core/        @photon/core          Component, Stateless/Stateful, State, Element (escopo reativo), BuildContext, Key
    dom/         @photon/dom           Render no cliente (mount 1x + efeitos), reconciliação local, hidratação de ilha
    server/      @photon/server        Render de HTML (SSR/SSG) + streaming + runtime HTTP (Bun.serve)
    styling/     @photon/styling       Props+tokens → CSS atômico + custom properties (light/dark)
    components/  @photon/components     Inventário A/B/C (Box, Row, Card, Button, ...) na web
    router/      @photon/router        Roteamento por arquivos, rotas tipadas, navegação, data loading
    build/       @photon/build          Orquestra bundle, CSS, invoca engine, manifest, split por ilha
    engine-rpc/  @photon/engine-rpc     Cliente TS do photon-engine (JSON-RPC)
    cli/         @photon/cli            photon dev|build|start|info
    create/      create-photon           Scaffolder
  engine/                               Módulo Go (photon-engine)  cmd/ internal/{image,cache,compress,server,rpc}/
  examples/  counter/  blog/  dashboard/
  docs/  package.json  tsconfig.json  biome.json
```

`tokens`/`reactive`/`core` na base; `styling` depende de `tokens`; `components` de
`core`+`styling`; `dom`/`server` de `core`; `router` de `core`+`server`; `cli` amarra tudo.

---

## 14. Estrutura fixa de um app Photon

```
my-app/
  photon.config.ts
  app/          home.page.ts   app.layout.ts   blog/blog.page.ts   api/hello/hello.route.ts
  components/   task-card.component.ts   tasks-board.island.ts
  stores/       cart.store.ts
  lib/          tasks.server.ts
  public/       styles/theme.ts   package.json
```
Nomes seguem `nome.papel.ts` (ADR 0002). Saída:
`.photon/{server, client(chunks/ilha), static(assets+CSS+imagens), cache, manifest.json}`.

---

## 15. Segurança, acessibilidade, SEO

Escape de HTML por padrão; server-only fora do bundle; CSP gerado; HTML cru só via `RawHtml`.
Primitivas semânticas + `Semantics(...)` (ARIA); a11y herdada do design system (contraste WCAG,
focus ring 2dp, disabled 38%, dynamic type, touch targets). SSG/SSR entregam HTML; `metadata`
gera `<head>`/OG/sitemap/robots.

---

## 16. Decisões

| # | Decisão | Status | Escolha |
| --- | --- | --- | --- |
| 1 | Abstração-base | ✅ | **`Component`** (não "Widget") |
| 2 | Reatividade | ✅ | Sinais finos, build-once, auto-tracking |
| 3 | Hidratação | ✅ | Ilhas primeiro; full = ilha-página (opt-in) |
| 4 | Design system | ✅ | Tokens do Photon (equantic-ui), compartilhados |
| 5 | Transform de thunks | 🟡 | Explícito primeiro; transform depois |
| 6 | Lib de imagens (Go) | 🟡 | libvips via `govips` |
| 7 | Idioma docs/API | 🟡 | Docs PT; API/código EN |
| 8 | Protocolo TS↔Go | 🟡 | JSON-RPC stdio (dev) + batch (build) |

---

## 17. Posicionamento

| | Next.js | Flutter Web | SolidStart/Astro | **PhotonJS** |
| --- | --- | --- | --- | --- |
| Escrita | React/JSX | Widgets (Dart) | JSX/`.astro` | **`Component` (TS puro)** |
| Modelo | Componentes/hooks | Stateless/Stateful | Funções+signals | **Stateless/Stateful+signals** |
| Reatividade | VDOM diff | rebuild+diff | signals | **signals (fina)** |
| Hidratação | full/RSC | full (canvas) | ilhas | **ilhas primeiro** |
| Alvo | DOM | Canvas | DOM | **DOM semântico** |
| Design system | — | Material | — | **Photon (cross-platform c/ mobile)** |
| Trabalho pesado | Node (sharp) | engine C++ | Node | **Go (photon-engine)** |

O PhotonJS é o **renderer web de um sistema de UI cross-platform**: escrita e conceitos do
Flutter, reatividade de sinais e ilhas do estado-da-arte web, DOM semântico, design system
compartilhado com o mobile, e motor Go para o que o JS faz mal.
