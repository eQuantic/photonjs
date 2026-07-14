# Photon — Arquitetura

> Documento vivo. Registra as decisões de design do Photon e o racional por trás delas.
> Marcações **[DECISÃO ABERTA]** indicam pontos onde a escolha final depende de você.

---

## 1. Filosofia

O Photon parte de três convicções:

1. **A UI é uma árvore de composição imutável.** Você não muta o DOM; você descreve
   como a árvore _deveria_ ser, e o framework calcula a menor mutação para chegar lá.
   Esse é o modelo do Flutter e do React — o Photon adota a ergonomia do Flutter.
2. **Composite pattern em todo lugar.** Existe uma única abstração — `Widget` — e tudo,
   de um texto a uma página inteira, é um `Widget`. Folhas e composições implementam a
   mesma interface. Isso é o que dá a sensação "Flutter" na escrita.
3. **O trabalho pesado desce para onde ele é mais barato.** Reconciliação e regras de
   negócio ficam em TypeScript. Imagens, compressão e cache — CPU-bound — descem para um
   binário Go. Type-checking sobe para o compilador nativo do TS 7.

O resultado é um framework em que **a experiência do desenvolvedor é 100% TypeScript**,
mas cujo desempenho não é limitado pelo TypeScript.

---

## 2. Conceitos centrais

### 2.1 As três árvores

Herdado do Flutter, adaptado para a web. O Photon mantém **três árvores paralelas**:

| Árvore | O que é | Vida | Análogo Flutter | Análogo React |
| --- | --- | --- | --- | --- |
| **Widget** | Configuração imutável. O que `build()` retorna. Barato de recriar. | Efêmera (recriada a cada build) | `Widget` | Elemento JSX |
| **Element** | Instância viva na árvore. Guarda `State`, ciclo de vida, faz a reconciliação. | Persistente | `Element` | Fiber |
| **Node** | O alvo de render. **DOM no cliente**, **buffer de HTML no servidor**. | Persistente | `RenderObject` | DOM |

Detalhe crucial: no Flutter, a terceira árvore (`RenderObject`) faz _layout e paint_.
Na web, **layout e paint são delegados ao navegador (CSS)**. Então a terceira árvore do
Photon é simplesmente o DOM. Isso simplifica muito o motor — não reimplementamos layout.

```
  build()            inflate/update           mount/patch
Widget ───────────▶ Element ───────────────▶ Node (DOM | HTML)
(imutável)          (persistente, stateful)   (persistente)
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

// Widgets "host" (folhas que viram DOM) — fornecidos por @photon/widgets:
//   Text, Div/Box, Image, Button, Input, Anchor, Column, Row, Stack, ...
// Internamente estendem RenderWidget, que produz/atualiza um Node.
```

**Composite pattern explícito:** `Widget` é o _Component_; `Text`/`Image` são _Leaves_;
`Column`/`Row`/`Container` são _Composites_ (têm `children`). `build()` compõe a árvore.

### 2.3 Stateless vs Stateful

Idêntico ao Flutter, em TypeScript:

```ts
// Sem estado: função pura de (config, context) -> Widget
class Avatar extends StatelessWidget {
  constructor(readonly url: string, readonly size = 40) { super(); }

  build(context: BuildContext): Widget {
    return Image({ src: this.url, width: this.size, height: this.size,
      decoration: BoxDecoration({ borderRadius: BorderRadius.circle() }) });
  }
}

// Com estado: State persiste através de rebuilds
class Counter extends StatefulWidget {
  constructor(readonly start = 0) { super(); }
  createState() { return new CounterState(); }
}

class CounterState extends State<Counter> {
  private count = this.widget.start;      // acesso tipado à config via this.widget

  override initState() { /* assinaturas, timers, fetch client-side */ }
  override dispose() { /* limpeza */ }

  build(context: BuildContext): Widget {
    return Row({
      gap: 12,
      children: [
        Text(`Contagem: ${this.count}`),
        Button({ label: "+1", onPressed: () =>
          this.setState(() => { this.count++; }) }),
      ],
    });
  }
}
```

Ciclo de vida do `State` (espelhando Flutter): `initState` → `didChangeDependencies` →
`build` → (`didUpdateWidget` / `setState` → `build`)* → `dispose`.

### 2.4 BuildContext

É o próprio `Element` (como no Flutter), exposto como interface. É a "localização" do
widget na árvore e o canal para dados ambientais:

```ts
interface BuildContext {
  dependOnInherited<T>(type: InheritedType<T>): T;  // injeção de dependência (§4)
  readOnce<T>(type: InheritedType<T>): T;           // sem criar dependência
  readonly router: Router;                          // navegação
  readonly theme: ThemeData;                        // tema
  readonly media: MediaQueryData;                   // viewport, prefers-color-scheme...
  readonly request?: RequestContext;                // SÓ no servidor: headers, cookies, params
}
```

### 2.5 Key

Identidade de reconciliação, como no Flutter. Sem `Key`, o casamento entre widget novo e
`Element` existente é por _posição + tipo_. Com `Key` (`ValueKey`, `ObjectKey`,
`UniqueKey`), o casamento é por identidade — essencial para listas reordenáveis e para
preservar `State` quando itens mudam de posição.

---

## 3. Reatividade e reconciliação

### 3.1 O modelo

**[DECISÃO ABERTA — a mais importante do projeto]**

Adotamos o **modelo Flutter**: `setState()` marca o `Element` como _dirty_; no próximo
frame o framework re-executa `build()` **apenas na subárvore suja** e reconcilia o
resultado contra os `Element`s existentes, aplicando o mínimo de mutações no DOM.

Não é um "VDOM completo re-difado do zero": como no Flutter, `Element`s são reaproveitados
quando `runtimeType` **e** `key` batem (`Widget.canUpdate`), então a reconciliação é local
e barata. Recomendo começar por aqui porque é **exatamente o modelo mental que você pediu**
(Stateless/Stateful, `setState`).

Alternativas consideradas (podemos evoluir depois):

- **(B) Sinais de granularidade fina** (Solid/preact-signals): sem diffing; cada nó de DOM
  ligado a um sinal atualiza sozinho. Mais rápido, menos memória — mas menos "Flutter".
- **(C) Híbrido (recomendação de médio prazo):** API Flutter por fora + sinais para
  _valores folha_ (texto/atributos) por dentro, evitando rebuild de subárvore quando só um
  valor muda. É o melhor dos dois mundos; dá pra introduzir sem quebrar a API.

**Plano:** v1 no modelo (A); introduzir sinais como otimização opt-in (`Signal<T>`,
`Computed<T>`) e migrar para (C) quando o reconciliador estiver maduro. A API pública não
muda.

### 3.2 Algoritmo de reconciliação (Element.update)

Para um `Element` existente recebendo um `Widget` novo:

1. `Widget.canUpdate(old, new)` = `old.runtimeType === new.runtimeType && old.key === new.key`.
2. **Bateu** → atualiza no lugar: guarda a nova config, e (Stateful) chama
   `didUpdateWidget`, marca dirty, re-`build()`. `State` **é preservado**.
3. **Não bateu** → desmonta a subárvore antiga (`dispose`) e monta a nova.
4. **Listas de filhos** → algoritmo de casamento por chave + tipo (o mesmo
   `updateChildren` do Flutter): sincroniza início/fim, casa o miolo por `Key`, e emite
   inserções/remoções/reordenações mínimas no DOM.

Dois tipos de `Element`:

- **ComponentElement** (Stateless/Stateful) — não produz DOM; produz um _filho widget_ via
  `build()`.
- **RenderElement** (host: `Div`, `Text`, `Image`…) — cria/atualiza **um nó de DOM** e
  gerencia os filhos DOM. É onde as mutações reais acontecem.

### 3.3 Agendamento

`setState` não re-renderiza sincronicamente. Marca o `Element` dirty e agenda um _flush_
via microtask/`queueMicrotask` (cliente) coalescendo múltiplos `setState` do mesmo tick.
No servidor o render é sempre síncrono e único (uma passada → HTML).

---

## 4. Estado compartilhado e injeção de dependência

Espelhando Flutter, três mecanismos em camadas:

- **`InheritedWidget`** — propaga dados _para baixo_ na árvore com O(1) de leitura via
  `context.dependOnInherited(Type)`. Base de temas, sessão, router, stores.
- **`Listenable` / `ChangeNotifier`** — objeto observável; widgets se inscrevem e
  reconstroem quando ele notifica. Base de estado mutável compartilhado.
- **`Provider<T>`** — açúcar ergonômico sobre os dois acima (cria `InheritedWidget` +
  assina um `Listenable`), para o caso comum de "estado global tipado".

```ts
// Definição
const SessionProvider = createProvider<Session>();

// Fornecendo no topo
SessionProvider.provide(session, { child: AppShell() });

// Consumindo em qualquer lugar
const session = context.dependOnInherited(SessionProvider);
```

Sinais (§3.1-C) coexistem: um `Signal<T>` pode ser fornecido por `Provider` e lido em
folhas com atualização fina.

---

## 5. Sistema de estilo

### 5.1 Props tipadas → CSS atômico

O Flutter não tem CSS: estilo são _propriedades de widget_ (`padding`, `color`,
`decoration`). O Photon adota isso e **compila as props em CSS atômico extraído em build**:

```ts
Container({
  padding: EdgeInsets.symmetric({ horizontal: 16, vertical: 8 }),
  color: Colors.slate[900],
  decoration: BoxDecoration({ borderRadius: BorderRadius.all(12) }),
  child: Text("Olá"),
});
```

Em build isso vira classes atômicas deduplicadas:

```css
.px-16{padding-left:16px;padding-right:16px}.py-8{padding-top:8px;padding-bottom:8px}
.bg-slate-900{background:#0f172a}.rounded-12{border-radius:12px}
```

E o nó final referencia só as classes. **Zero CSS em runtime**, folha única
**cacheável com hash imutável**, e reuso máximo entre páginas.

### 5.2 Layout = flexbox/grid

Os widgets de layout mapeiam diretamente para CSS moderno:

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

Para controle total: o widget `Box` (alias `Div`) aceita `style`, `className` e
`attributes` crus, e existe um widget para **todo** elemento HTML (`Section`, `Nav`,
`Article`, `Button`, `Input`, `Svg`, …). Você nunca fica preso na abstração.

---

## 6. Renderização: os modos

Por rota você escolhe o modo (default inteligente por tipo de página):

| Modo | Quando | Como |
| --- | --- | --- |
| **SSG** | Conteúdo estático | Pré-renderiza em build → HTML no CDN |
| **SSR** | Conteúdo por-requisição/personalizado | Render no servidor Bun a cada request |
| **ISR** | Estático com revalidação | SSG + revalidação em background por tag/TTL |
| **CSR/SPA** | Apps atrás de login | Shell mínimo + app no cliente |
| **Ilhas** | Páginas de conteúdo com pontos interativos | HTML estático + só as ilhas hidratam |

### 6.1 SSR + hidratação

**Servidor:**
1. Router casa a rota → resolve cadeia de `layout`s + `page`.
2. Executa `loader`s (server-only) → dados.
3. Constrói a árvore de widgets com os dados → infla em `Element`s → renderiza para
   string de HTML, com **marcadores de hidratação** e o estado serializado (`<script
   type="application/json">`).
4. Faz stream do HTML (§6.3), injeta CSS crítico inline, difere o JS.

**Cliente (hidratação):**
1. Bundle carrega, reconstrói a árvore de widgets.
2. Em vez de criar DOM, **adota o DOM existente**: caminha a árvore de `Element`s ao lado
   do DOM do servidor, religa listeners, restaura `State` (config determinística + dados
   do loader serializados).
3. A partir daí, `setState` dirige reconciliação no cliente.

### 6.2 Ilhas (partial hydration)

`island(widget)` marca uma subárvore como interativa; o bundler gera um chunk só para ela
e só ela hidrata. O resto da página é HTML morto (rápido, sem JS). Ótimo para os requisitos
de **performance e cache**. É opt-in por widget.

### 6.3 Streaming SSR

Usando `Bun.serve` e streams, o servidor envia o shell imediatamente e faz stream das
partes que dependem de dados lentos, com _boundaries_ de `Suspense`-like
(`AsyncBuilder`/`FutureBuilder`, à la Flutter) que renderizam um fallback e depois o
conteúdo.

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
  about/
    page.ts            → "/about"
  blog/
    layout.ts          → layout aninhado do /blog
    page.ts            → "/blog"
    [slug]/
      page.ts          → "/blog/:slug"  (segmento dinâmico)
  (marketing)/         → grupo de rota (não afeta a URL)
    pricing/page.ts    → "/pricing"
  api/
    hello/route.ts     → endpoint "/api/hello" (GET/POST/...)
  @modal/              → slot paralelo (opcional, fase avançada)
```

Cada `page.ts` exporta:

```ts
export default class HomePage extends StatelessWidget { /* build() */ }

// Opcionais:
export const loader = async (ctx: LoaderContext) => { /* server-only, retorna dados */ };
export const action = async (ctx: ActionContext) => { /* mutação server-only */ };
export const metadata: Metadata = { title: "...", description: "..." };  // ou função
export const config: RouteConfig = { render: "ssg" | "ssr" | "isr", revalidate: 60 };
```

**Rotas tipadas:** o gerador de rotas emite tipos, então `context.router.push("/blog/:slug",
{ slug })` e `Link({ to, params })` são **verificados em tempo de compilação** (TS 7).

---

## 8. Fronteira servidor/cliente e dados

Sem React Server Components, a fronteira é **explícita e simples**:

- **`loader`** — roda no servidor antes do render. Retorna dados serializáveis que o
  bundler injeta no widget. Análogo a `getServerSideProps`/loader do Remix.
- **`action`** — função server-only para mutações (submit de formulário), com
  _progressive enhancement_ (funciona sem JS; melhora com JS).
- **Código server-only** — arquivos `*.server.ts` (ou o marcador `"use server"`) e os
  próprios `loader`/`action` são **removidos do bundle do cliente** pelo grafo do bundler.
  Segredos e acesso a banco nunca vazam.
- **Interatividade** — `StatefulWidget`s hidratam. Em modo ilha, só a ilha embarca JS.

Cache de dados: helper `cache(fn, { tags, revalidate })` + API `revalidateTag(tag)` para
ISR sob demanda. Backend do cache: `bun:sqlite`/KV local, ou o motor Go (§10) para o cache
endereçado por conteúdo compartilhado com o build.

---

## 9. Cache (visão unificada)

Quatro camadas, todas **endereçadas por conteúdo** (hash das entradas → saída):

1. **Build cache** — `hash(fonte + config)` → artefato. Builds incrementais quase
   instantâneos.
2. **Asset cache** — nomes de arquivo com hash → `Cache-Control: immutable`, CDN-friendly.
3. **Data cache** — resultados de `loader`/`cache()` com tags e TTL (ISR).
4. **Page cache** — HTML de SSG/ISR com revalidação por tag.

O **motor Go** mantém o cache endereçado por conteúdo em disco (imagens otimizadas, assets
comprimidos, artefatos de build), compartilhado entre `dev`, `build` e `start`.

---

## 10. Imagens e compressão — o widget `Image` e o motor Go

```ts
Image({ src: "/hero.jpg", width: 1280, quality: 80, format: "auto", priority: true });
```

Em build (SSG) ou sob demanda (SSR/dev), o `photon-engine` (Go):

1. Recebe `(fonte, largura(s), qualidade, formato)`.
2. Produz variantes **redimensionadas** e **convertidas** (AVIF → WebP → JPEG/PNG fallback),
   otimizadas.
3. Saída **endereçada por conteúdo** (`hash(fonte+params)`), gravada no cache.
4. O widget emite `<picture>` com `srcset` responsivo + formatos modernos, `width/height`
   para evitar layout shift, e `loading=lazy`/`fetchpriority` conforme `priority`.

URLs imutáveis (hash) ⇒ `Cache-Control: immutable` ⇒ cache de CDN/navegador perfeito.

O engine também faz **pré-compressão** (Brotli + Gzip) de todos os assets estáticos, então
o servidor só envia bytes já comprimidos.

---

## 11. `photon-engine` (Go) — responsabilidades e protocolo

**Por que Go:** tarefas CPU-bound e de sistema, distribuíveis como **um único binário** por
plataforma, sem depender do runtime JS. (Ironia simpática: o compilador do TS 7 também é Go.)

**Responsabilidades:**
- Otimização de imagens (redimensionar, AVIF/WebP/JPEG, quality).
- Compressão de assets (Brotli/Gzip) em batch.
- Cache endereçado por conteúdo (hash, store, GC) compartilhado com o build.
- (Opcional, fase avançada) servidor estático/edge rápido para `photon start` (assets
  pré-comprimidos, imutáveis, range requests).

**[DECISÃO ABERTA] Biblioteca de imagens:**
- **libvips via `govips`** — melhor qualidade e velocidade; exige a lib nativa (linkar
  estático nos binários distribuídos). **Recomendado.**
- **Pure-Go** (`x/image` + encoders WebP/AVIF em Go) — distribuição trivial (um binário sem
  deps nativas), porém mais lento e AVIF menos maduro.

**Protocolo TS ↔ Go:**
- **Dev:** daemon persistente, **JSON-RPC sobre stdio** (ou socket Unix), para otimização
  sob demanda sem custo de spawn por request.
- **Build:** modo batch via CLI.
- **Distribuição:** binários pré-compilados por plataforma, baixados no `postinstall` ou
  como optional-dependencies (padrão esbuild/swc). Fallback: build local se Go presente.

---

## 12. Toolchain: Bun + TypeScript 7

| Ferramenta | Papel |
| --- | --- |
| **Bun** | Runtime do servidor (`Bun.serve`), transpile TS (strip de tipos), bundle/code-splitting, package manager, test runner (`bun test`), `bun:sqlite` p/ cache |
| **TypeScript 7 (`tsgo`)** | **Type-checking** (não bundla). Compilador nativo em Go, ~10x mais rápido. Roda em paralelo no `dev` para diagnósticos e no CI como gate |
| **Go 1.2x** | `photon-engine` |
| **Biome** | Lint + format (rápido, um binário) |

**Fluxo `dev`:** Bun serve + file watcher → em cada save, rebuild incremental do módulo
afetado → **HMR via WebSocket**. Diferencial estilo Flutter: **hot reload preservando
estado** — no HMR, re-executamos `build()` sobre a árvore de `Element`s existente,
preservando os objetos `State`. Editar a UI sem perder o estado da tela é uma feature-assinatura.

**Fluxo `build`:** grafo servidor + grafo cliente → tree-shaking/code-splitting (Bun) →
extração de CSS atômico → otimização de imagens e pré-compressão (motor Go) → manifest com
hashes. `tsgo` roda como gate de tipos.

---

## 13. Monorepo e pacotes

Workspaces do Bun:

```
photonjs/
  packages/
    core/        @photon/core       Widget, Stateless/Stateful, State, Element, BuildContext, Key, reconciliador
    reactive/    @photon/reactive   InheritedWidget, ChangeNotifier, Provider, Signal/Computed
    dom/         @photon/dom        Renderer de cliente (mount) + hidratação
    server/      @photon/server     Renderer de HTML (SSR/SSG) + streaming + runtime HTTP (Bun.serve)
    widgets/     @photon/widgets    Biblioteca padrão (layout + primitivas HTML + Image, Link, Form...)
    styling/     @photon/styling    Props → CSS atômico (extração em build)
    router/      @photon/router     Roteamento por arquivos, rotas tipadas, navegação, data loading
    build/       @photon/build       Orquestra bundle (Bun), CSS, invoca o engine, manifest
    engine-rpc/  @photon/engine-rpc  Cliente TS do photon-engine (JSON-RPC)
    cli/         @photon/cli         `photon dev|build|start|info`
    create/      create-photon        Scaffolder (`bun create photon`)
  engine/                             Módulo Go (photon-engine)
    cmd/photon-engine/
    internal/{image,cache,compress,server,rpc}/
  examples/
    counter/  blog/  dashboard/
  docs/
  package.json   tsconfig.json   biome.json
```

Grafo de dependências: `core` não depende de nada; `dom`/`server` dependem de `core`;
`widgets` depende de `core`+`styling`; `router` de `core`+`server`; `cli` amarra tudo.

---

## 14. Estrutura fixa de um app Photon

```
my-app/
  photon.config.ts       # config (rendering default, imagens, alias, plugins)
  app/                   # rotas (§7)
    layout.ts  page.ts  ...
  components/            # widgets reutilizáveis
  lib/                   # lógica de negócio, server-only helpers
  public/                # assets estáticos servidos crus
  styles/                # tokens/tema (ThemeData)
  package.json  tsconfig.json
```

Saída de build:

```
.photon/
  server/     # bundle SSR
  client/     # bundle de hidratação + chunks (por ilha/rota)
  static/     # assets com hash + CSS atômico + imagens otimizadas
  cache/      # cache endereçado por conteúdo (motor Go)
  manifest.json
```

---

## 15. Segurança, acessibilidade, SEO

- **Segurança:** escape de HTML por padrão no renderer; `loader`/`action` server-only fora
  do bundle cliente; CSP gerado; sem `dangerouslySetInnerHTML` — HTML cru exige widget
  explícito `RawHtml` (auditável).
- **Acessibilidade:** widgets primitivos emitem HTML semântico; `Semantics(...)` para
  ARIA; lint de a11y em build.
- **SEO:** SSG/SSR entregam HTML completo; `metadata` por rota gera `<head>`, Open Graph,
  sitemap e `robots.txt`.

---

## 16. Decisões em aberto (resumo)

| # | Decisão | Recomendação | Impacto |
| --- | --- | --- | --- |
| 1 | Modelo de reatividade (§3.1) | (A) Flutter agora → (C) híbrido com sinais depois | **Alto** — núcleo do motor |
| 2 | Hidratação default (§6) | Ambos: full-page e ilhas, opt-in por rota | Médio |
| 3 | Lib de imagens no engine (§11) | libvips via `govips` (qualidade) | Médio — distribuição |
| 4 | Nome do framework | "Photon" (do repo) | Baixo — cosmético |
| 5 | Idioma dos docs/API | Docs: PT agora; API/código: EN | Baixo |
| 6 | Protocolo TS↔Go | JSON-RPC stdio (dev) + batch (build) | Baixo |

---

## 17. Como o Photon se posiciona

| | Next.js | Flutter Web | SolidStart | **Photon** |
| --- | --- | --- | --- | --- |
| UI | React/JSX | Widgets (Dart) | Signals/JSX | **Widgets (TS puro)** |
| Modelo mental | Componentes/hooks | Stateless/Stateful | Reativo fino | **Stateless/Stateful** |
| Runtime | Node/Edge | Canvas/DOM próprio | JS | **Bun** |
| Render alvo | DOM | Canvas (pesado) | DOM | **DOM (semântico)** |
| Trabalho pesado | Node (sharp) | engine C++ | JS | **Go (photon-engine)** |
| CSS | CSS/Tailwind | sem CSS | CSS | **props → CSS atômico** |

O Photon fica no cruzamento: **ergonomia de Flutter, alvo DOM semântico como Next, e um
motor Go acoplado** para o que o JS faz mal.
