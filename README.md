# PhotonJS

> O **renderer web** do Photon — um sistema de UI cross-platform. Um framework full-stack
> estilo Next.js, **sem React**, com composição de UI inspirada no **Flutter**
> (Stateless/Stateful, composite pattern), escrito para **TypeScript 7** e **Bun**, com um
> motor auxiliar em **Go** (imagens, compressão, cache).

**Status:** 🌱 Planejamento / design. Sem código de implementação ainda.

> **Photon é cross-platform.** O `equantic-ui` é o renderer **mobile** (motor nativo);
> **PhotonJS** é o renderer **web** (DOM + CSS). Os dois compartilham o **design system**
> (tokens), o **inventário de componentes** e a **API de `Component`**.

## A ideia em uma frase

Você descreve a UI compondo _components_ em TypeScript puro — sem JSX, sem `React` — do mesmo
jeito que descreveria uma tela no Flutter. O PhotonJS reconcilia essa árvore em DOM real no
cliente e em HTML no servidor, com roteamento por arquivos, design system, otimização de
imagens e cache de primeira classe.

```ts
class Counter extends StatefulComponent {
  createState() { return new CounterState(); }
}

class CounterState extends State<Counter> {
  count = signal(0);

  build(context: BuildContext): Component {
    return Row({
      gap: Space.S3,
      children: [
        // valor reativo: thunk. Muda o sinal → só este texto atualiza (sem re-build).
        Text(() => `Contagem: ${this.count.value}`),
        Button({ label: "+1", onPressed: () => this.count.value++ }),
      ],
    });
  }
}
```

## Pilares de design

| Pilar | Decisão |
| --- | --- |
| **Modelo mental** | Flutter: `StatelessComponent` / `StatefulComponent`, `build(context)`, `BuildContext`, `Key` |
| **Reatividade** | Sinais de granularidade fina (`signal`/`computed`/`effect`), modelo _build-once_ — muda o valor, muda só o nó ligado |
| **Padrão central** | Composite (GoF) — tudo é `Component`; folhas e composições implementam a mesma interface |
| **Design system** | Tokens do **Photon** (cores/tipo/espaço/raio/elevação) compartilhados com o mobile `equantic-ui` |
| **Linguagem de UI** | TypeScript puro, factory functions + classes. Zero JSX, zero template string |
| **Runtime / bundler** | Bun (servidor, transpile, bundle, package manager, testes) |
| **Type-checking** | TypeScript 7 (`tsgo`, compilador nativo em Go — ~10x mais rápido) |
| **Motor auxiliar** | Go (`photon-engine`): imagens, compressão, cache endereçado por conteúdo |
| **Roteamento** | Baseado em arquivos (`app/`), com layouts aninhados e rotas dinâmicas |
| **Renderização** | **Ilhas primeiro** (partial hydration); SSG/SSR/ISR por rota; full hydration como opt-in |
| **Estilo** | Props tipadas de widget → CSS atômico extraído em build (zero-runtime, cacheável) |

## Documentos

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitetura completa, com esboços de API e decisões.
- [`docs/LOOK-AND-FEEL.md`](docs/LOOK-AND-FEEL.md) — a sintaxe real: um app de exemplo (board de tarefas) com `Component`, sinais, ilhas e tokens.
- [`docs/ENGINE.md`](docs/ENGINE.md) — o motor Go (`photon-engine`): protocolo JSON-RPC, pipeline de imagem, chave de cache, distribuição.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — plano de execução em fases, com marcos e critérios de aceite.
- [`docs/decisions/`](docs/decisions/) — ADRs (registros de decisão). Começa por [ADR 0001 — linguagem e tooling (`.ts`, não `.phts`)](docs/decisions/0001-linguagem-e-tooling.md).

## Por que não React?

Porque o objetivo é um modelo mental **declarativo-composicional à la Flutter**, com controle total sobre a reconciliação, a fronteira servidor/cliente e o pipeline de assets — e um runtime próprio, enxuto, sem a bagagem histórica do React. Ganhamos: hot reload preservando estado (como o Flutter), hidratação parcial nativa, CSS atômico sem runtime e um motor Go acoplado para imagens/cache.
