# PhotonJS — Look & feel (a sintaxe real)

> Um app pequeno **de verdade** escrito em PhotonJS, para sentir a ergonomia antes de codar o
> framework. Mostra: `Component` stateless e stateful, **sinais**, `For`/`Show`, `loader`,
> `island`, **tokens do design system**, tema light/dark e componente-função.
>
> Cenário: um **board de tarefas** (usa o inventário "Dashboard" do design system).

---

## 0. As regras que você precisa ter na cabeça

1. **Estrutura como no Flutter:** componha `Component`s aninhados. `build()` roda **1x**.
2. **Estado = sinal.** Muta com atribuição (`x.value = ...`), sem `setState`.
3. **Valor estático → escreva o valor** (`Text("Olá")`). **Valor reativo → thunk/sinal**
   (`Text(() => ...)`).
4. **Estrutura que muda → `Show`/`For`/`Switch`** (não `if`/`for`).
5. **Estilo = tokens**, nunca números mágicos: `Space.S4`, `Radius.Lg`, `Colors.Primary.Base`.
6. **Layout gap-owned:** espaçamento é `gap` + padding interno. Sem margens.

---

## 1. Tokens num relance

```ts
import { Colors, Space, Radius, Elevation } from "@photon/tokens";

Space.S1 // 4   Space.S3 // 12   Space.S4 // 16   Space.S6 // 24
Radius.Md // 10   Radius.Lg // 14   Radius.Full // pill
Colors.Surface            // superfície de card       (light/dark automático)
Colors.Text.Secondary     // texto secundário
Colors.Primary.Base       // ação primária            + .OnBase .Pressed .Subtle .OnSubtle
Colors.Success.Base  Colors.Warning.Base  Colors.Destructive.Base
Elevation.E1              // "card em repouso" (no dark ganha borda 1px sozinho)
```

---

## 2. Um `Component` stateless — composição + tokens

Sem estado próprio: só recebe dados e compõe. Repare que **estilo são props com tokens**.

```ts
// components/task-card.component.ts
import { StatelessComponent, BuildContext, Component } from "@photon/core";
import { Card, Row, Column, Spacer, Text, Title, Caption, Avatar, Checkbox,
         IconButton, Icons } from "@photon/components";
import { Colors, Space, Radius, Elevation, EdgeInsets, BoxDecoration } from "@photon/tokens";
import type { Task } from "../lib/tasks";

export class TaskCard extends StatelessComponent {
  constructor(
    readonly task: Task,
    readonly onToggle: (id: string) => void,
    readonly onDelete: (id: string) => void,
  ) { super(); }

  build(ctx: BuildContext): Component {
    const t = this.task;
    return Card({
      padding: EdgeInsets.all(Space.S4),
      decoration: BoxDecoration({ borderRadius: Radius.Lg, boxShadow: Elevation.E1 }),
      child: Row({
        align: "center",
        gap: Space.S3,
        children: [
          Checkbox({ checked: t.done, onChanged: () => this.onToggle(t.id) }),

          Column({ gap: Space.S1, children: [
            Title(t.title),
            Caption(`Responsável: ${t.assignee.name} · vence ${t.due}`,
                    { color: Colors.Text.Muted }),
          ]}),

          Spacer(),                                   // empurra o resto para a direita

          PriorityChip(t.priority),                   // componente-função (§6)
          Avatar({ src: t.assignee.avatar, size: Space.S8, radius: Radius.Full }),
          IconButton({ icon: Icons.trash, onPressed: () => this.onDelete(t.id),
                       tone: "destructive" }),
        ],
      }),
    });
  }
}
```

---

## 3. Um `Component` stateful — sinais + `For` + `Show`

O board mantém o estado (tarefas + busca) em **sinais**. `build()` roda uma vez; o que muda
depois é ligado por thunk/`For`/`Show`.

```ts
// components/tasks-board.island.ts   (sufixo .island = fronteira de hidratação / chunk próprio)
import { StatefulComponent, State, BuildContext, Component } from "@photon/core";
import { signal, computed } from "@photon/reactive";
import { Column, Row, Spacer, SearchField, Button, Label, Divider, EmptyState,
         Show, For, Icons } from "@photon/components";
import { Space } from "@photon/tokens";
import { TaskCard } from "./task-card.component";
import type { Task } from "../lib/tasks";

export class TasksBoard extends StatefulComponent {
  constructor(readonly props: { initial: Task[] }) { super(); }
  createState() { return new TasksBoardState(); }
}

class TasksBoardState extends State<TasksBoard> {
  // sinais — semeados com os dados do loader (§4)
  tasks = signal<Task[]>(this.component.props.initial);
  query = signal("");

  // derivados (memoizados; recalculam só quando as dependências mudam)
  filtered = computed(() =>
    this.tasks.value.filter(t => t.title.toLowerCase().includes(this.query.value.toLowerCase())));
  pending  = computed(() => this.filtered.value.filter(t => !t.done).length);

  toggle = (id: string) =>
    this.tasks.value = this.tasks.value.map(t => t.id === id ? { ...t, done: !t.done } : t);
  remove = (id: string) =>
    this.tasks.value = this.tasks.value.filter(t => t.id !== id);

  build(ctx: BuildContext): Component {
    return Column({
      gap: Space.S4,
      children: [
        Row({ align: "center", gap: Space.S3, children: [
          SearchField({
            value: this.query,                        // sinal ligado nos dois sentidos
            onChanged: (v) => this.query.value = v,
            placeholder: "Buscar tarefas…",
          }),
          Spacer(),
          // texto REATIVO: muda sozinho quando `pending` muda — sem re-build do board
          Label(() => `${this.pending.value} pendentes`),
        ]}),

        Divider(),

        // estrutura condicional/repetida = Show/For (nunca if/for no build)
        Show({
          when: () => this.filtered.value.length > 0,
          fallback: EmptyState({ icon: Icons.inbox, title: "Nada por aqui",
                                 message: "Nenhuma tarefa encontrada." }),
          child: Column({ gap: Space.S3, children: [
            For({
              each: () => this.filtered.value,
              key: (t) => t.id,                       // identidade → preserva DOM/estado ao reordenar
              builder: (t) => TaskCard(t, this.toggle, this.remove),
            }),
          ]}),
        }),
      ],
    });
  }
}
```

Repare no que **não** tem: nenhum `setState`, nenhum `key`-hell manual, nenhum re-render do
board quando você digita — só o `Label` e a lista filtrada reagem, cirurgicamente.

---

## 4. A página — `loader` (servidor) → sinal (ilha)

`app/tasks/tasks.page.ts`. O `loader` roda **só no servidor**; seus dados são serializados e
semeiam o sinal da ilha no cliente. Só o board é uma **ilha** — o `AppBar` é HTML estático (0 JS).

```ts
// app/tasks/tasks.page.ts
import { StatelessComponent, BuildContext, Component } from "@photon/core";
import { Scaffold, AppBar, island } from "@photon/components";
import type { LoaderContext, Metadata, RouteConfig } from "@photon/router";
import { listTasks } from "../../lib/tasks.server";        // *.server: fora do bundle do cliente
import { TasksBoard } from "../../components/tasks-board.island";

// server-only: some do bundle do cliente
export const loader = async (ctx: LoaderContext) => ({
  tasks: await listTasks(ctx.request.userId),
});

export const metadata: Metadata = { title: "Tarefas · Photon", description: "Seu board." };
export const config: RouteConfig = { render: "ssr" };   // ssg | ssr | isr | app

export default class TasksPage extends StatelessComponent {
  build(ctx: BuildContext): Component {
    const data = ctx.data<typeof loader>();            // tipado a partir do loader
    return Scaffold({
      appBar: AppBar({ title: "Tarefas" }),            // estático
      body: island(new TasksBoard({ initial: data.tasks }), { on: "load" }),  // interativo
    });
  }
}
```

Fluxo de tipos ponta a ponta: `loader` → `ctx.data<typeof loader>()` → `TasksBoard.props` →
`signal<Task[]>`. Um erro de shape quebra o **build** (TS 7), não o runtime.

---

## 5. Como isso renderiza (ilhas + sinais)

**No servidor** (`render: "ssr"`): monta a árvore, lê os sinais pelo valor atual, cospe HTML.
Só a subárvore da ilha ganha um marcador + o estado inicial:

```html
<main>
  <header class="appbar">…Tarefas…</header>            <!-- estático, 0 JS -->
  <div data-ph-island="TasksBoard" data-ph-on="load"></div>
  <script type="application/json" data-ph-state="TasksBoard">
    {"initial":[{"id":"t1","title":"Revisar PR", …}]}
  </script>
</main>
```

**No cliente:** o runtime vê a ilha `load`, baixa **só o chunk do `TasksBoard`**, roda seu
`build()` 1x para montar o grafo de sinais, **adota o DOM** já presente e liga eventos. O
`AppBar` nunca vira JavaScript. Digitar na busca dispara efeitos que tocam **apenas** o
`Label` e os nós da lista.

---

## 6. Componente-função (alternativa leve ao class)

Para folhas simples, sem estado nem ciclo de vida, um função é suficiente — é `Component` do
mesmo jeito (composite pattern):

```ts
// components/priority-chip.component.ts
import { Chip } from "@photon/components";
import { Colors } from "@photon/tokens";
import type { Priority } from "../lib/tasks";

export const PriorityChip = (p: Priority): Component => {
  const tone = { low: Colors.Success, medium: Colors.Warning, high: Colors.Destructive }[p];
  return Chip({ label: p, color: tone.Base, background: tone.Subtle });
};
```

---

## 7. Tema light/dark — sem esforço

Os tokens de cor são **CSS custom properties** trocadas por `prefers-color-scheme` +
`[data-theme]`. Você escreve `Colors.Surface` uma vez; a troca de tema é só uma troca de
variável — **sem recarregar, sem re-build**, cirúrgica. Um botão de tema:

```ts
Button({
  label: () => ctx.theme.mode.value === "dark" ? "Claro" : "Escuro",
  variant: "secondary",
  onPressed: () => ctx.theme.toggle(),
});
```

---

## 8. Botões e as variantes de cor do design system

`variant` mapeia direto para os 5 sub-tokens da variante (`Base`/`OnBase`/`Pressed`/`Subtle`):

```ts
Button({ label: "Salvar",   variant: "primary",     onPressed })   // Primary.Base / OnBase
Button({ label: "Cancelar", variant: "secondary",   onPressed })   // Secondary.*
Button({ label: "Excluir",  variant: "destructive", onPressed })   // Destructive.*
Button({ label: "Ver",      variant: "ghost",       onPressed })   // Subtle / transparente
Button({ label: "Enviar",   variant: "primary", loading: () => saving.value })  // estado reativo
```

---

## 9. O que este exemplo prova

- A **escrita é Flutter** (composição, Stateless/Stateful), o **motor é sinais** (fino, sem
  re-render), o **estilo é o design system** (tokens, tema grátis) e a **entrega é ilha**
  (quase todo o HTML sem JS).
- O mesmo `TaskCard`/`TasksBoard`, com os mesmos tokens, tem **paridade visual** com o Photon
  Mobile — porque compartilham `@photon/tokens` e o inventário de componentes.
- Tudo **tipado ponta a ponta**: `loader` → `ctx.data` → props → sinais.

> Próximo refino natural: destrinchar **1 componente do inventário** (ex.: `Button` ou
> `TextInput`) da API à emissão de HTML+CSS atômico, ou a **fronteira server/cliente**
> (serialização, split de bundle, `"use server"`).
