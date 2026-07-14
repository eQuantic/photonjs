# Photon — Arquitetura

> Documento vivo. Registra as decisões de design do Photon e o racional por trás delas.
> Marcações **[DECISÃO ABERTA]** indicam pontos onde a escolha final ainda depende de você.
>
> **Decisões já tomadas (jul/2026):** núcleo baseado em **sinais de granularidade fina**
> (modelo _build-once_) · hidratação **por ilhas primeiro** (Astro-like).

---

## 1. Filosofia

O Photon parte de três convicções:

1. **A UI é uma árvore de composição declarativa.** Você não muta o DOM na mão; você
   descreve a estrutura compondo _widgets_ — a ergonomia do Flutter.
2. **Composite pattern em todo lugar.** Existe uma única abstração — `Widget` — e tudo,
   de um texto a uma página inteira, é um `Widget`. Folhas e composições implementam a
   mesma interface. É o que dá a sensação "Flutter" na escrita.
3. **A reatividade é de granularidade fina.** Quando um valor muda, **só o nó de DOM ligado
   a ele muda** — sem re-executar `build()`, sem difar a árvore. Esse é o modelo de
   _sinais_ (Solid/preact-signals), e é o que dá ao Photon o desempenho de um app nativo.

A tensão interessante — e o coração do design — é **casar a escrita do Flutter com a
reatividade de sinais**. A §3 mostra como. O resumo: você mantém a composição e os
conceitos Stateless/Stateful do Flutter; o que muda é que estado vira **sinal** e `build()`
roda **uma vez** (montagem do grafo), não a cada mudança.

O resultado: **experiência de desenvolvimento 100% TypeScript**, com desempenho que não é
limitado pelo TypeScript (sinais no cliente; Go para imagens/compressão/cache).

---

## 2. Conceitos centrais

### 2.1 As três árvores

Herdado do Flutter, adaptado para a web **e para o modelo de sinais**:

| Árvore | O que é | Vida | Papel sob sinais |
| --- | --- | --- | --- |
| **Widget** | Configuração declarativa. O que `build()` retorna. | Efêmera (montada 1x) | Descreve a estrutura e onde estão os "buracos reativos" |
| **Element** | Instância viva. Dona do **escopo reativo** (efeitos, limpeza), do ciclo de vida, do contexto (DI) e das chaves. | Persistente | Owner de efeitos; hospeda reconciliação **localizada** de `For`/`Show` |
| **Node** | Alvo de render: **DOM no cliente**, **buffer de HTML no servidor**. | Persistente | Atualizado cirurgicamente por efeitos |

Diferença central vs. Flutter/React: **não há diff de árvore inteira**. O `build()` roda uma
vez e estabelece efeitos reativos que atualizam o DOM diretamente. Reconciliação estrutural
só acontece **localmente**, dentro de `For` (listas) e `Show`/`Switch` (condicionais). Layout
e paint continuam delegados ao navegador (CSS), então a terceira árvore é só o DOM.

```
  build() [1x]          efeitos reativos
Widget ───────────▶ Element ──────────────▶ Node (DOM | HTML)
(estrutura)         (escopo reativo)    (patch cirúrgico por sinal)
```

### 2.2 Widget

Interface única. Duas famílias que o usuário escreve, e uma terceira interna (host):

```ts
abstract class Widget {
  readonly key?: Key;
  abstract createElement(): Element;
}

// Componentes que o usuário escreve:
abstract class StatelessWidget extends Widget {
  abstract build(context: BuildContext): Widget;
  createElement(): Element { return new StatelessElement(this); }
}

abstract class StatefulWidget extends Widget {
  abstract createState(): State<this>;
  createElement(): Element { return new StatefulElement(this); }
}

// Widgets "host" (folhas que viram DOM) — de @photon/widgets:
//   Text, Div/Box, Image, Button, Input, Anchor, Column, Row, Stack, ...
```

**Composite pattern explícito:** `Widget` é o _Component_; `Text`/`Image` são _Leaves_;
`Column`/`Row`/`Container` são _Composites_ (têm `children`). `build()` compõe a árvore.

> Nota: sob _build-once_, um `StatelessWidget` é essencialmente uma **função de setup** que
> roda uma vez. Por isso o Photon também aceita **componentes-função** como alternativa leve
> (`const Avatar = (p) => Image({...})`). Mantemos as classes para o modelo mental Flutter,
> `Key` e ciclo de vida.

### 2.3 Stateless vs Stateful (com sinais)

O conceito é idêntico ao Flutter — **Stateless** não possui estado próprio; **Stateful**
possui estado + ciclo de vida. O que muda: estado é **sinal**, e `build()` roda uma vez.

```ts
// Sem estado: estrutura pura a partir de props/sinais recebidos.
class Avatar extends StatelessWidget {
  constructor(readonly url: string, readonly size = 40) { super(); }
  build(context: BuildContext): Widget {
    return Image({ src: this.url, width: this.size, height: this.size,
      decoration: BoxDecoration({ borderRadius: BorderRadius.circle() }) });
  }
}

// Com estado: os campos do State são SINAIS. build() roda 1x e monta o grafo reativo.
class Counter extends StatefulWidget {
  constructor(readonly start = 0) { super(); }
  createState() { return new CounterState(); }
}

class CounterState extends State<Counter> {
  count = signal(this.widget.start);
  doubled = computed(() => this.count.value * 2);

  override initState() { /* efeitos, timers, assinaturas */ }
  override dispose()   { /* limpeza — efeitos do escopo são liberados automaticamente */ }

  build(context: BuildContext): Widget {
    return Row({
      gap: 12,
      children: [
        // valor REATIVO: passe um thunk (ou o próprio sinal). O framework assina.
        Text(() => `Contagem: ${this.count.value} (x2 = ${this.doubled.value})`),
        // mutação direta — sem setState. Batching automático por microtask.
        Button({ label: "+1", onPressed: () => this.count.value++ }),
      ],
    });
  }
}
```

Regra ergonômica única: **valor estático → escreva o valor** (`Text("Olá")`); **valor
reativo → passe um thunk ou sinal** (`Text(() => ...)` / `Text(count)`).

Ciclo de vida do `State`: `initState` (monta, 1x) → `build` (1x) → (efeitos reativos rodam
sob demanda) → `dispose`. Não há `didUpdateWidget` no sentido de "rebuild": props que mudam
devem ser **sinais** passados para baixo (a leitura reativa substitui o `didUpdateWidget`).

### 2.4 BuildContext

É o próprio `Element` (como no Flutter), exposto como interface — a "localização" do widget
na árvore e o canal para dados ambientais:

```ts
interface BuildContext {
  dependOnInherited<T>(type: InheritedType<T>): T;  // injeção de dependência (§4)
  readonly router: Router;                          // navegação
  readonly theme: ThemeData;                        // tema
  readonly media: MediaQueryData;                   // viewport, prefers-color-scheme...
  readonly request?: RequestContext;                // SÓ no servidor: headers, cookies, params
  onDispose(fn: () => void): void;                  // registra limpeza no escopo reativo
}
```

### 2.5 Key

Identidade de reconciliação, como no Flutter — relevante sobretudo dentro de `For`. Sem
`Key`, o casamento é por posição; com `Key` (`ValueKey`, `ObjectKey`, `UniqueKey`), por
identidade — essencial para listas reordenáveis preservarem estado e DOM.

---

## 3. Reatividade: sinais + escrita Flutter

**[DECISÃO TOMADA]** Núcleo baseado em **sinais de granularidade fina** com rastreamento
automático de dependências e modelo **build-once**.

### 3.1 O modelo de execução

- `build()` roda **uma única vez** por `Element` (fase de _setup_): estabelece a estrutura e
  os "buracos reativos".
- Estado vive em **sinais**. Ler `signal.value` dentro de um escopo reativo (um thunk de
  prop, um `computed`, um `effect`, um `Show/For`) **assina** aquele sinal automaticamente.
- Escrever no sinal (`signal.value = x`) atualiza **apenas** os nós/efeitos que o leram.
  Sem re-`build()`, sem diff de árvore.
- Atualizações são **agrupadas por microtask** (batching automático); `batch(fn)` força
  agrupamento explícito de várias escritas.

Isso preserva a **escrita** do Flutter (composição de widgets, Stateless/Stateful) trocando
o **motor** (rebuild+diff → sinais). É o modelo do SolidJS com a fachada do Flutter.

### 3.2 Primitivas reativas (`@photon/reactive`)

```ts
const count   = signal(0);                       // estado
const doubled = computed(() => count.value * 2); // derivado (memoizado)
effect(() => console.log(count.value));          // efeito (roda ao mudar)
batch(() => { count.value++; count.value++; });  // uma só notificação
untrack(() => count.value);                       // lê sem assinar
```

**Props reativas.** Toda prop de widget aceita um valor estático **ou** reativo:

```ts
type Reactive<T> = T | Signal<T> | (() => T);
// static:   Text("Olá")                   → nó fixo
// reativo:  Text(() => user.name.value)    → atualiza só este nó de texto
//           Visibility({ visible: isOpen }) → assina o sinal isOpen
```

### 3.3 Controle de fluxo reativo

Como `build()` roda uma vez, condicionais e listas dinâmicas usam **widgets reativos** (não
`if`/`for` imperativos) — o análogo dos `builder`s do Flutter:

```ts
Show({ when: () => auth.loggedIn.value, child: Dashboard(), fallback: Login() })

For({                                   // ~ ListView.builder do Flutter
  each: () => todos.value,
  key: (t) => t.id,
  builder: (t) => TodoRow(t),
})

Switch({ children: [
  Match({ when: () => status.value === "loading", child: Spinner() }),
  Match({ when: () => status.value === "error",   child: ErrorBox() }),
]})
```

`For`/`Show`/`Switch` são os **únicos** pontos que fazem reconciliação estrutural — e ela é
**local e keyed** (cria/move/remove só o necessário). O resto é efeito reativo puro.

### 3.4 `setState`? Substituído por sinais

Não há `setState`. Estado é sinal; mutação é atribuição. Para quem vem do Flutter, isso
elimina o boilerplate de `setState(() => ...)`. Quando precisar agrupar várias escritas numa
única atualização, use `batch(() => { ... })`. (Interop: um `Signal<T>` implementa a
interface `Listenable`/`ValueNotifier`, então padrões Flutter de `ValueListenableBuilder`
têm equivalente direto via `Show`/thunk.)

### 3.5 DX: transform opcional para thunks automáticos

O custo de não ter JSX é escrever thunks (`Text(() => ...)`) para valores reativos. Um
**transform de build-time** (plugin do Bun) pode detectar leituras de sinal dentro de props
e envolvê-las em thunks automaticamente — dando ergonomia Solid-like (`Text(user.name)` já
reativo) sem thunk manual. **[DECISÃO ABERTA]** fazer isso na v1 ou manter thunks explícitos
primeiro (mais simples, mais previsível). Recomendo **explícito primeiro**, transform depois.

---

## 4. Estado compartilhado e injeção de dependência

Sinais são o primitivo de estado; a distribuição na árvore usa, em camadas:

- **`InheritedWidget` / `Provider<T>`** — fornece um valor (tipicamente um **store de
  sinais**) para baixo na árvore, lido em O(1) via `context.dependOnInherited(Type)`. Base de
  tema, sessão, router, stores globais.
- **Stores** — um objeto com sinais/`computed` (ex.: `class CartStore { items = signal([]);
  total = computed(...) }`), fornecido por `Provider` e consumido em qualquer widget.
- **`Listenable`** — interface de interop para fontes externas observáveis.

```ts
const CartProvider = createProvider<CartStore>();
CartProvider.provide(new CartStore(), { child: AppShell() });   // no topo
const cart = context.dependOnInherited(CartProvider);           // em qualquer lugar
Text(() => `Total: ${cart.total.value}`);                        // reativo
```

---

## 5. Sistema de estilo

### 5.1 Props tipadas → CSS atômico

O Flutter não tem CSS: estilo são _propriedades de widget_. O Photon adota isso e **compila
as props em CSS atômico extraído em build**:

```ts
Container({
  padding: EdgeInsets.symmetric({ horizontal: 16, vertical: 8 }),
  color: Colors.slate[900],
  decoration: BoxDecoration({ borderRadius: BorderRadius.all(12) }),
  child: Text("Olá"),
});
```

vira classes atômicas deduplicadas:

```css
.px-16{padding-left:16px;padding-right:16px}.py-8{padding-top:8px;padding-bottom:8px}
.bg-slate-900{background:#0f172a}.rounded-12{border-radius:12px}
```

O nó final referencia só as classes. **Zero CSS em runtime**, folha única com **hash
imutável** (cache perfeito), reuso máximo entre páginas. Props de estilo **reativas** (ex.:
`color: () => theme.accent.value`) alternam classes via efeito — ainda cirúrgico.

### 5.2 Layout = flexbox/grid

| Widget | CSS |
| --- | --- |
| `Column` / `Row` | `display:flex; flex-direction:column\|row` + `gap`, `justify/align` |
| `Stack` / `Positioned` | `position:relative` + `absolute` |
| `Wrap` | `flex-wrap:wrap` |
| `Expanded` / `Flexible` | `flex:1` / `flex-grow` |
| `Center` / `Align` | `place-items` / `align-self` |
| `SizedBox` | `width`/`height` |
| `Grid` | `display:grid` |

`mainAxisAlignment`, `crossAxisAlignment` etc. têm os mesmos nomes do Flutter.

### 5.3 Escape hatch

O widget `Box` (alias `Div`) aceita `style`, `className` e `attributes` crus; há um widget
para **todo** elemento HTML (`Section`, `Nav`, `Article`, `Svg`, …). Nunca se fica preso.

---

## 6. Renderização: ilhas primeiro

**[DECISÃO TOMADA]** A estratégia primária é **ilhas** (partial hydration, Astro-like):
a página é **HTML estático inerte**; só as **ilhas** — subárvores marcadas como interativas —
embarcam JS e hidratam. Como a reatividade é de sinais, cada ilha é um grafo reativo pequeno
e independente: hidratação **barata, local e paralelizável**.

```ts
// Página de conteúdo: HTML estático + pontos interativos isolados.
export default class Post extends StatelessWidget {
  build(ctx: BuildContext): Widget {
    return Article({ children: [
      Prose(this.content),                                  // HTML morto, 0 JS
      island(LikeButton(this.postId), { on: "visible" }),   // hidrata ao aparecer
      island(CommentBox(this.postId), { on: "idle" }),      // hidrata quando ocioso
    ]});
  }
}
```

**Diretivas de hidratação** (por ilha): `on: "load" | "idle" | "visible" | "media(...)"` —
controlam _quando_ o JS da ilha carrega, minimizando o custo inicial.

### 6.1 Modos de render por rota

| Modo | Quando | Como |
| --- | --- | --- |
| **SSG** (default) | Conteúdo estático | Pré-render em build → HTML no CDN; ilhas hidratam |
| **SSR** | Conteúdo por-requisição | Render no servidor Bun a cada request; ilhas hidratam |
| **ISR** | Estático com revalidação | SSG + revalidação em background por tag/TTL |
| **App / full hydration** | Apps atrás de login (SPA-like) | A rota inteira é uma ilha; opt-in por rota |

Ou seja: **ilhas por padrão**; a hidratação de página inteira é só o caso extremo em que
"a ilha é a página toda". Um único mecanismo, dois pontos da régua.

### 6.2 SSR + hidratação de ilhas

**Servidor:** router casa a rota → resolve layouts + page → roda `loader`s → monta a árvore
(sinais lidos pelo seu valor atual, sem reatividade no servidor) → renderiza HTML, com um
marcador + JSON de estado inicial **por ilha**. Escape de HTML por padrão.

**Cliente:** para cada ilha visível/agendada, carrega seu chunk, roda seu `build()` **uma
vez** para montar o grafo de sinais e efeitos, **adota o DOM existente** (liga efeitos aos
nós já presentes), religa eventos. O restante da página nunca vira JS.

> **Futuro possível:** _resumability_ (estilo Qwik) — serializar o grafo reativo e retomar
> sem re-executar `build()` no cliente. Ilhas + sinais já entregam 90% do ganho; deixamos
> resumability como evolução, não como fundação.

### 6.3 Streaming SSR

Com `Bun.serve` + streams, o servidor envia o shell na hora e faz stream das partes lentas,
com _boundaries_ `AsyncBuilder`/`FutureBuilder` (à la Flutter) que mostram fallback e depois
o conteúdo.

---

## 7. Roteamento por arquivos (estrutura fixa)

Convenção sobre configuração, estilo Next `app/`:

```
app/
  layout.ts            → shell raiz (envolve tudo)
  page.ts              → rota "/"
  error.ts             → boundary de erro
  loading.ts           → fallback de carregamento
  not-found.ts         → 404
  about/page.ts        → "/about"
  blog/
    layout.ts          → layout aninhado do /blog
    page.ts            → "/blog"
    [slug]/page.ts     → "/blog/:slug"  (segmento dinâmico)
  (marketing)/         → grupo de rota (não afeta a URL)
    pricing/page.ts    → "/pricing"
  api/hello/route.ts   → endpoint "/api/hello" (GET/POST/...)
```

Cada `page.ts` exporta:

```ts
export default class HomePage extends StatelessWidget { /* build() */ }

export const loader   = async (ctx: LoaderContext) => { /* server-only, retorna dados */ };
export const action   = async (ctx: ActionContext) => { /* mutação server-only */ };
export const metadata: Metadata     = { title: "...", description: "..." };  // ou função
export const config:   RouteConfig   = { render: "ssg" | "ssr" | "isr" | "app", revalidate: 60 };
```

**Rotas tipadas:** o gerador emite tipos, então `context.router.push("/blog/:slug", { slug
})` e `Link({ to, params })` são **verificados em tempo de compilação** (TS 7).

---

## 8. Fronteira servidor/cliente e dados

Sem React Server Components, a fronteira é **explícita e simples**:

- **`loader`** — roda no servidor antes do render; retorna dados serializáveis injetados no
  widget (vira sinal inicial na ilha, se interativa). Análogo a loader do Remix.
- **`action`** — função server-only para mutações (submit de form), com _progressive
  enhancement_ (funciona sem JS; melhora com JS).
- **Código server-only** — `*.server.ts` (ou marcador `"use server"`) e os próprios
  `loader`/`action` são **removidos do bundle do cliente** pelo grafo do bundler. Segredos e
  acesso a banco nunca vazam.
- **Interatividade** — apenas dentro de `island(...)`; só ilhas embarcam JS.

Cache de dados: `cache(fn, { tags, revalidate })` + `revalidateTag(tag)` para ISR. Backend:
`bun:sqlite`/KV local ou o motor Go (§10/§11) para cache endereçado por conteúdo.

---

## 9. Cache (visão unificada)

Quatro camadas, todas **endereçadas por conteúdo** (hash das entradas → saída):

1. **Build cache** — `hash(fonte + config)` → artefato. Builds incrementais quase instantâneos.
2. **Asset cache** — nomes com hash → `Cache-Control: immutable`, CDN-friendly.
3. **Data cache** — resultados de `loader`/`cache()` com tags e TTL (ISR).
4. **Page cache** — HTML de SSG/ISR com revalidação por tag.

O **motor Go** mantém o cache endereçado por conteúdo em disco (imagens otimizadas, assets
comprimidos, artefatos), compartilhado entre `dev`, `build` e `start`.

---

## 10. Imagens e compressão — widget `Image` + motor Go

```ts
Image({ src: "/hero.jpg", width: 1280, quality: 80, format: "auto", priority: true });
```

Em build (SSG) ou sob demanda (SSR/dev), o `photon-engine` (Go): recebe `(fonte, largura(s),
qualidade, formato)` → produz variantes **redimensionadas** e **convertidas** (AVIF → WebP →
JPEG/PNG fallback) → saída **endereçada por conteúdo** no cache → o widget emite `<picture>`
com `srcset` responsivo, `width/height` (sem layout shift) e `loading`/`fetchpriority`
conforme `priority`. URLs por hash ⇒ `Cache-Control: immutable`. O engine também faz
**pré-compressão** (Brotli/Gzip) de todos os assets.

---

## 11. `photon-engine` (Go) — responsabilidades e protocolo

**Por que Go:** tarefas CPU-bound/sistema, distribuíveis como **um binário** por plataforma,
sem depender do runtime JS. (Ironia simpática: o compilador do TS 7 também é Go.)

**Responsabilidades:** otimização de imagens · compressão Brotli/Gzip em batch · cache
endereçado por conteúdo (hash/store/GC) · (fase avançada) servidor estático/edge rápido para
`photon start`.

**[DECISÃO ABERTA] Biblioteca de imagens:**
- **libvips via `govips`** — melhor qualidade/velocidade; exige a lib nativa (link estático
  nos binários). **Recomendado.**
- **Pure-Go** (`x/image` + encoders WebP/AVIF em Go) — distribuição trivial; mais lento,
  AVIF menos maduro.

**Protocolo TS ↔ Go:** **dev** = daemon persistente, **JSON-RPC sobre stdio** (ou socket
Unix), sem custo de spawn por request; **build** = modo batch via CLI. **Distribuição:**
binários pré-compilados por plataforma (padrão esbuild/swc: optional-deps), com fallback de
build local se Go presente.

---

## 12. Toolchain: Bun + TypeScript 7

| Ferramenta | Papel |
| --- | --- |
| **Bun** | Runtime do servidor (`Bun.serve`), transpile TS, bundle/code-splitting, package manager, testes (`bun test`), `bun:sqlite` p/ cache |
| **TypeScript 7 (`tsgo`)** | **Type-checking** (não bundla). Compilador nativo em Go, ~10x mais rápido. Roda em paralelo no `dev` e como gate no CI |
| **Go 1.2x** | `photon-engine` |
| **Biome** | Lint + format (um binário) |

**`dev`:** Bun serve + watcher → save → rebuild incremental → **HMR via WebSocket**. Como a
reatividade é de sinais, o hot reload é naturalmente preciso: recriamos só a ilha editada,
preservando o estado (sinais) das demais.

**`build`:** grafo servidor + cliente → tree-shaking/code-splitting por ilha → extração de
CSS atômico → otimização de imagens + pré-compressão (motor Go) → manifest com hashes.
`tsgo` como gate de tipos.

---

## 13. Monorepo e pacotes

```
photonjs/
  packages/
    reactive/    @photon/reactive   signal, computed, effect, batch, Show/For/Switch, Provider/InheritedWidget
    core/        @photon/core        Widget, Stateless/Stateful, State, Element (escopo reativo), BuildContext, Key
    dom/         @photon/dom         Render no cliente (mount 1x + efeitos), reconciliação local de For/Show, hidratação de ilha
    server/      @photon/server      Render de HTML (SSR/SSG) + streaming + runtime HTTP (Bun.serve)
    widgets/     @photon/widgets     Biblioteca padrão (layout + primitivas HTML + Image, Link, Form...)
    styling/     @photon/styling     Props → CSS atômico (extração em build)
    router/      @photon/router      Roteamento por arquivos, rotas tipadas, navegação, data loading
    build/       @photon/build        Orquestra bundle (Bun), CSS, invoca o engine, manifest, split por ilha
    engine-rpc/  @photon/engine-rpc   Cliente TS do photon-engine (JSON-RPC)
    cli/         @photon/cli          photon dev|build|start|info
    create/      create-photon         Scaffolder (bun create photon)
  engine/                              Módulo Go (photon-engine)
    cmd/photon-engine/  internal/{image,cache,compress,server,rpc}/
  examples/  counter/  blog/  dashboard/
  docs/  package.json  tsconfig.json  biome.json
```

Grafo: `reactive` e `core` na base; `dom`/`server` dependem de `core`; `widgets` de
`core`+`styling`+`reactive`; `router` de `core`+`server`; `cli` amarra tudo.

---

## 14. Estrutura fixa de um app Photon

```
my-app/
  photon.config.ts       # config (render default, imagens, alias, plugins)
  app/                   # rotas (§7)
  components/            # widgets reutilizáveis
  lib/                   # lógica de negócio, server-only helpers
  public/                # assets estáticos crus
  styles/                # tokens/tema (ThemeData)
  package.json  tsconfig.json
```

Saída de build:

```
.photon/
  server/     client/(chunks por ilha)     static/(assets+CSS+imagens, com hash)
  cache/(endereçado por conteúdo)           manifest.json
```

---

## 15. Segurança, acessibilidade, SEO

- **Segurança:** escape de HTML por padrão; `loader`/`action` fora do bundle cliente; CSP
  gerado; HTML cru só via widget explícito `RawHtml` (auditável).
- **Acessibilidade:** primitivas emitem HTML semântico; `Semantics(...)` para ARIA; lint de
  a11y em build.
- **SEO:** SSG/SSR entregam HTML completo; `metadata` gera `<head>`, Open Graph, sitemap,
  `robots.txt`.

---

## 16. Decisões

| # | Decisão | Status | Escolha |
| --- | --- | --- | --- |
| 1 | Modelo de reatividade (§3) | ✅ **Tomada** | Sinais de granularidade fina, _build-once_, auto-tracking |
| 2 | Estratégia de hidratação (§6) | ✅ **Tomada** | **Ilhas primeiro**; full hydration = ilha = página (opt-in) |
| 3 | Transform build-time p/ thunks (§3.5) | 🟡 Aberta | Explícito primeiro; transform depois (recomendado) |
| 4 | Lib de imagens no engine (§11) | 🟡 Aberta | libvips via `govips` (recomendado) |
| 5 | Nome do framework | 🟡 Aberta | "Photon" (do repo) |
| 6 | Idioma dos docs/API | 🟡 Aberta | Docs PT; API/código EN |
| 7 | Protocolo TS↔Go (§11) | 🟡 Aberta | JSON-RPC stdio (dev) + batch (build) |

---

## 17. Como o Photon se posiciona

| | Next.js | Flutter Web | SolidStart / Astro | **Photon** |
| --- | --- | --- | --- | --- |
| Escrita da UI | React/JSX | Widgets (Dart) | JSX / `.astro` | **Widgets (TS puro)** |
| Modelo mental | Componentes/hooks | Stateless/Stateful | Funções + signals | **Stateless/Stateful + signals** |
| Reatividade | VDOM diff | rebuild+diff | **signals** | **signals (fina)** |
| Hidratação | full / RSC | full (canvas) | ilhas / server islands | **ilhas primeiro** |
| Alvo de render | DOM | Canvas (pesado) | DOM | **DOM semântico** |
| Trabalho pesado | Node (sharp) | engine C++ | Node | **Go (photon-engine)** |
| CSS | CSS/Tailwind | sem CSS | CSS | **props → CSS atômico** |

O Photon fica no cruzamento: **escrita e conceitos do Flutter, reatividade de sinais e
hidratação por ilhas do estado-da-arte web, alvo DOM semântico, e um motor Go acoplado** para
o que o JS faz mal.
