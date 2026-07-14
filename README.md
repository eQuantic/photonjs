# Photon

> Um framework full-stack estilo Next.js, **sem React**, com uma linguagem de composição de UI inspirada no **Flutter** (Stateless/Stateful, composite pattern), escrito para **TypeScript 7** e **Bun**, com um motor auxiliar em **Go** para tarefas pesadas (otimização de imagens, compressão, cache).

**Status:** 🌱 Planejamento / design. Sem código de implementação ainda.

## A ideia em uma frase

Você descreve a UI compondo _widgets_ em TypeScript puro — sem JSX, sem `React` — do mesmo jeito que descreveria uma tela no Flutter. O Photon reconcilia essa árvore em DOM real no cliente e em HTML no servidor, com roteamento por arquivos, otimização de imagens e cache de primeira classe.

```ts
class Counter extends StatefulWidget {
  createState() { return new CounterState(); }
}

class CounterState extends State<Counter> {
  count = 0;

  build(context: BuildContext): Widget {
    return Row({
      gap: 12,
      children: [
        Text(`Contagem: ${this.count}`),
        Button({ label: "+1", onPressed: () => this.setState(() => this.count++) }),
      ],
    });
  }
}
```

## Pilares de design

| Pilar | Decisão |
| --- | --- |
| **Modelo mental** | Flutter: `StatelessWidget` / `StatefulWidget`, `build(context)`, `setState()`, `BuildContext`, `Key` |
| **Padrão central** | Composite — tudo é `Widget`; folhas e composições implementam a mesma interface |
| **Linguagem de UI** | TypeScript puro, factory functions + classes. Zero JSX, zero template string |
| **Runtime / bundler** | Bun (servidor, transpile, bundle, package manager, testes) |
| **Type-checking** | TypeScript 7 (`tsgo`, compilador nativo em Go — ~10x mais rápido) |
| **Motor auxiliar** | Go (`photon-engine`): imagens, compressão, cache endereçado por conteúdo |
| **Roteamento** | Baseado em arquivos (`app/`), com layouts aninhados e rotas dinâmicas |
| **Renderização** | CSR, SSR + hidratação, SSG, ISR e ilhas (partial hydration) por rota |
| **Estilo** | Props tipadas de widget → CSS atômico extraído em build (zero-runtime, cacheável) |

## Documentos

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitetura completa, com esboços de API e decisões.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — plano de execução em fases, com marcos e critérios de aceite.

## Por que não React?

Porque o objetivo é um modelo mental **declarativo-composicional à la Flutter**, com controle total sobre a reconciliação, a fronteira servidor/cliente e o pipeline de assets — e um runtime próprio, enxuto, sem a bagagem histórica do React. Ganhamos: hot reload preservando estado (como o Flutter), hidratação parcial nativa, CSS atômico sem runtime e um motor Go acoplado para imagens/cache.
