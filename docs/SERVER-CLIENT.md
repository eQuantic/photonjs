# PhotonJS — Fronteira servidor/cliente (letra B)

> Como o PhotonJS separa código de servidor e de cliente **sem React Server Components**: dois
> grafos de módulo, remoção de código server-only, **serialização do `loader` → sinal**,
> **marcadores de hidratação**, replay de eventos e navegação. A classificação por nome de
> arquivo vem do ADR 0002; aqui está a mecânica.

---

## 1. O modelo em uma imagem

```
  *.server.ts  *.route.ts        *.page/*.layout/*.component (universal)        *.island.ts
  *.loader/*.action                     │                                           │
        │ (nunca no cliente)            │ (SSR/SSG; vai ao cliente só via ilha)     │ (raiz do bundle cliente)
        ▼                               ▼                                           ▼
   ┌───────────── GRAFO SERVIDOR ─────────────┐                 ┌──── GRAFO CLIENTE (por ilha) ────┐
   │ loader → dados → render HTML (sinais lidos │  ── HTML + ──▶ │ hidrata: build() 1x, adota DOM,   │
   │ pelo valor atual) + estado serializado     │   estado JSON  │ liga efeitos/eventos             │
   └───────────────────────────────────────────┘                 └──────────────────────────────────┘
```

---

## 2. Dois grafos de módulo

O bundler (`@photon/build`, sobre o Bun) constrói **dois grafos** a partir das rotas:

- **Grafo servidor** — entrypoints: `*.page.ts`, `*.layout.ts`, `*.route.ts` e seus `loader`/
  `action`. Pode importar `*.server.ts` livremente. Nunca é enviado ao cliente.
- **Grafo cliente** — entrypoints: **apenas os `*.island.ts`** alcançados pelas páginas. Cada
  ilha vira um **chunk** separado (code-splitting por ilha). Só isso embarca JS.

Um módulo universal (`*.component.ts`, `*.store.ts`, tokens) entra no grafo cliente **só se for
alcançável a partir de uma ilha**. Caso contrário, existe apenas no servidor.

---

## 3. Remoção de código server-only

Como o bundler garante que segredo/DB não vaze:

1. **Por convenção de nome** (ADR 0002): `*.server.ts`, `*.route.ts`, `*.loader.ts`,
   `*.action.ts` são marcados **server-only**; o grafo cliente **recusa** importá-los em posição
   de valor.
2. **Imports type-only são apagados**: `import type { Task } from "../lib/tasks.server"` some no
   output — dá para compartilhar **tipos** sem arrastar código.
3. **`loader`/`action` exportados de um `*.page.ts`** são extraídos e removidos do bundle
   cliente (o `*.page.ts` continua universal para o resto).
4. **Erro de build didático** se um módulo alcançável por ilha importar um server-only em
   posição de valor: aponta o caminho do import ofensor.

---

## 4. `loader` → serialização → sinal

Fluxo de dados (o coração da fronteira):

```ts
// tasks.page.ts (servidor)
export const loader = async (ctx: LoaderContext) => ({
  tasks: await listTasks(ctx.request.userId),      // roda no servidor
});

// build(): a página passa os dados para a ilha
island(new TasksBoard({ initial: ctx.data<typeof loader>().tasks }), { on: "load" });
```

1. No servidor, o `loader` roda e retorna **dados serializáveis**.
2. O framework **serializa** os dados que entram em cada ilha para JSON e os embute no HTML,
   **por ilha** (`<script type="application/json" data-ph-state="…">`).
3. No cliente, a ilha **lê esse JSON** e **semeia o sinal** (`this.tasks = signal(initial)`).
   Como a semente é a mesma, o `build()` do cliente produz o mesmo DOM que o servidor.

**Codec de serialização** (`@photon/server`): um superset de JSON que preserva `Date`, `Map`,
`Set`, `BigInt`, `undefined` e referências circulares (estilo *devalue*/*superjson*), para o
dado voltar como o `loader` o produziu. Valores não-serializáveis (funções, handles) são erro de
build. Streaming-friendly (o JSON de cada ilha é emitido junto do seu marcador).

---

## 5. Marcadores de hidratação e adoção do DOM

O servidor emite, por ilha, um **marcador determinístico**:

```html
<ph-island data-ph-id="i0" data-ph-chunk="tasks-board" data-ph-on="load">
  …HTML já renderizado do board…
</ph-island>
<script type="application/json" data-ph-state="i0">{"initial":[…]}</script>
```

No cliente, o runtime de hidratação:

1. Encontra cada `<ph-island>`; lê `data-ph-chunk` (qual JS baixar) e `data-ph-on` (quando).
2. Ao disparar a diretiva (`load|idle|visible|media`), baixa o chunk e roda o `build()` da ilha
   **uma vez** para montar o grafo de sinais/efeitos.
3. **Adota** o DOM existente em vez de recriá-lo: caminha a árvore de `Element`s ao lado do DOM
   do servidor, associando cada `RenderElement` ao nó correspondente e ligando os efeitos +
   listeners. Sem recriação → sem flash.
4. Determinismo garante o casamento; um *mismatch* é reportado no dev com o caminho do nó.

---

## 6. Eventos antes da hidratação (early events)

Uma ilha `on: "visible"` pode receber clique antes do JS chegar. O runtime instala, no
`document`, um **capturador global leve** (poucos bytes, inline no `<head>`) que **grava** o
primeiro evento sobre uma ilha ainda fria, força a hidratação daquela ilha e **replica** o
evento após montar. O usuário nunca "perde" o clique. (Custa quase nada e evita a maior dor de
partial hydration.)

---

## 7. `action`, formulários e progressive enhancement

```ts
// tasks.page.ts
export const action = async (ctx: ActionContext) => {
  await addTask(ctx.request.userId, await ctx.formData());
  return { ok: true };
};
```

- **Sem JS:** um `Form({ action })` renderiza `<form method="post">`; o submit vai ao servidor,
  o `action` roda, e a resposta re-renderiza a rota. Funciona 100% sem cliente.
- **Com JS (ilha):** o submit é interceptado, vira um **RPC** ao endpoint do `action`, e o
  resultado atualiza sinais — sem full reload. Mesmo código, experiência melhor.

---

## 8. Navegação client-side

Com uma ilha de navegação ativa, clicar num `Link` tipado:

1. busca os **dados** da próxima rota (o `loader` roda no servidor, exposto num endpoint de
   dados) **e** o(s) **chunk(s)** de ilha necessários, em paralelo;
2. troca a subárvore da rota, semeando os sinais com os novos dados;
3. atualiza a URL (History API). Fallback: navegação normal do browser se o JS falhar.

Prefetch: `Link` pode pré-buscar dados/chunk em `hover`/`visible` (configurável).

---

## 9. Garantias de segurança

- Segredos/DB só em `*.server.ts`/`*.route.ts` → **fisicamente ausentes** do bundle cliente.
- Import server-only em posição de valor a partir do cliente = **falha de build**, não aviso.
- Escape de HTML por padrão na serialização e no render (XSS); HTML cru só via `RawHtml`.
- `action` valida no servidor sempre (o cliente é conveniência, não confiança).

---

## 10. Onde isso encaixa nas fases

- **Fase 2** entrega o essencial: render → HTML + estado por ilha, marcadores, adoção, early
  events.
- **Fase 3** adiciona `loader`/`action`, remoção server-only e navegação client-side.
- O codec de serialização e o prefetch amadurecem entre as Fases 2–3.
