# PhotonJS — O motor reativo por dentro (letra C)

> Como `@photon/reactive` funciona: grafo de **sinais** com rastreamento automático,
> **memoização** de derivados sem *glitches*, **agendamento** por microtask, **ownership** para
> limpeza determinística, reconciliação **keyed** de `For`, e **no-op no SSR**. É o coração que
> sustenta o modelo build-once (ARCHITECTURE §3).

---

## 1. Objetivos

1. **Granularidade fina:** escrever um sinal toca só quem o leu.
2. **Sem glitches:** num diamante (A→B, A→C, B&C→D), `D` roda **uma vez**, com valores
   consistentes — nunca com estado intermediário.
3. **Auto-tracking:** dependências são descobertas ao **ler** `.value` durante a execução de um
   escopo reativo — sem declarar arrays de deps.
4. **Limpeza determinística:** efeitos criados por um `Element` morrem com ele (ownership).
5. **SSR barato:** no servidor, tudo é leitura síncrona; nada agenda nem assina.

---

## 2. `signal` — a célula

```ts
class Signal<T> {
  private v: T;
  private observers = new Set<Computation>();   // quem depende deste sinal
  get value(): T { track(this); return this.v; }              // leitura registra dependência
  set value(next: T) { if (next === this.v) return;           // igualdade → no-op
    this.v = next; for (const o of this.observers) o.markDirty(); schedule(); }
}
```

- **`track`** liga o sinal ao *observer atual* (§3).
- **Escrita** marca observers como *dirty* e **agenda** um flush (§5). Igualdade (`Object.is`)
  evita trabalho à toa.

## 3. Auto-tracking — a pilha do observer

Existe um **observer corrente** global (uma pilha). Quando um `computed`/`effect` executa, ele
se coloca no topo; toda leitura de sinal durante a execução registra a aresta
`sinal → computation`. Ao terminar, ele **substitui** o conjunto de dependências (as arestas
antigas que não reapareceram são desligadas). Assim as dependências são sempre **exatas e
dinâmicas** (um `if` pode mudar as deps entre execuções).

## 4. `computed` — derivado memoizado (push-pull)

```ts
const doubled = computed(() => count.value * 2);
```

- **Lazy:** só calcula quando **lido**; memoiza o resultado.
- **Push-pull (estilo Reactively/Solid):** uma escrita **empurra** um flag `dirty`/`maybeDirty`
  pelas arestas (barato, sem recalcular). Na **leitura**, o computed **puxa**: se `maybeDirty`,
  verifica se alguma dependência realmente mudou (comparando versões) e só então reexecuta. Isso
  dá **zero glitches** e evita recomputo desnecessário no diamante.
- Um `computed` é, ao mesmo tempo, **observer** (das suas deps) e **sinal** (para quem o lê).

## 5. `effect`, agendamento e `batch`

```ts
effect(() => label.textContent = `${count.value}`);   // roda agora e a cada mudança de deps
```

- Um `effect` roda imediatamente (registra deps) e é reexecutado quando uma dep muda.
- **Agendamento:** escritas marcam efeitos dirty e enfileiram um flush via `queueMicrotask`.
  Vários `signal.value = …` no mesmo tick → **um** flush, efeitos rodam **uma vez**, em ordem
  topológica (deps antes de dependentes).
- **`batch(fn)`** agrupa explicitamente; **`untrack(fn)`** lê sem criar dependência.
- **Limpeza entre execuções:** um effect pode registrar `onCleanup(fn)`; antes de reexecutar (ou
  ao ser descartado), os cleanups anteriores rodam (ex.: cancelar timer/fetch).

## 6. Ownership — limpeza determinística

Todo escopo reativo tem um **owner** (dono). Quando um `Element` é montado, ele cria um owner;
os `computed`/`effect` criados durante o `build()` (e dentro de `For`/`Show`) são **filhos**
desse owner, formando uma **árvore de escopos**.

```
Element(owner) ─┬─ effect (texto reativo)
                ├─ computed (derivado)
                └─ For(owner) ─┬─ item[a](owner) ─ effects…
                               └─ item[b](owner) ─ effects…
```

`element.dispose()` descarta o owner → roda todos os `onCleanup`, desliga todas as assinaturas e
libera os filhos, **recursivamente**. Sem vazamento, sem desassinatura manual. (É o que torna
`Show`/`For` seguros ao trocar/remover subárvores.)

## 7. `For` — reconciliação keyed local

```ts
For({ each: () => todos.value, key: t => t.id, builder: t => TodoRow(t) })
```

Algoritmo (estilo `mapArray` do Solid):

1. Mantém um mapa `key → { node, itemSignal, owner }`.
2. Quando `each` muda, difa a lista nova contra o mapa **por chave**:
   - chave nova → cria item num **owner próprio** (o `builder` roda 1x);
   - chave sumiu → `dispose()` do owner do item (limpa efeitos + remove DOM);
   - chave permaneceu → **reusa** node/estado; se a posição mudou, **move** o DOM;
   - se só o **conteúdo** do item muda, atualiza via `itemSignal` (sem recriar).
3. Emite o mínimo de inserções/remoções/movimentos no DOM.

Cada item ter seu owner é o que faz o estado/efeitos do item viverem e morrerem com ele.

## 8. `Show` / `Switch` — troca de ramo

`Show({ when, child, fallback })` avalia `when` num `computed`. Quando o booleano **vira**:
descarta o owner do ramo atual (limpeza) e monta o outro (build 1x). Enquanto `when` não
**muda de valor**, mudanças não relacionadas **não** remontam nada (o computed memoiza).
`Switch`/`Match` generalizam para N ramos.

## 9. SSR — o mesmo grafo, em modo no-op

No servidor, o objetivo é **um passe síncrono → HTML**, sem reatividade viva:

- Ler `signal.value`/`computed` retorna o valor atual **sincronamente**; nenhuma assinatura é
  retida.
- `effect` **não agenda**: ou não roda, ou roda uma vez de forma síncrona se necessário para
  produzir conteúdo (efeitos de DOM são inertes no servidor).
- `For`/`Show` avaliam uma vez pelo valor corrente.
- Ao fim do render, o owner raiz é descartado. Sem timers, sem retenção → **sem vazamento entre
  requisições**.

O mesmo código de componente roda nos dois lados; o *ambiente* (cliente vs servidor) troca o
comportamento do agendador e dos efeitos de DOM.

## 10. Interop, performance e memória

- **`Listenable`/`ValueNotifier`:** adaptadores para fontes externas observáveis (ou um sinal
  visto como `Listenable`) — ponte para padrões vindos do Flutter.
- **Custo por sinal:** um valor + um `Set` de observers; leitura é O(1); escrita é O(nº de
  observers). Igualdade evita propagação inútil.
- **Memória:** as arestas são desligadas ao recomputar/descartar; owners liberam tudo no
  `dispose`. Sem listeners órfãos.
- **Devtools (Fase 7):** inspetor do grafo (sinais, computeds, efeitos, owners) e de ilhas.

## 11. Onde isso encaixa nas fases

- **Fase 1** entrega `signal`/`computed`/`effect`/`batch`/`untrack`, ownership e o agendador, mais
  `For`/`Show`/`Switch` no cliente.
- **Fase 2** adiciona o modo **no-op de SSR**.
- **Fase 6** pode explorar o transform de auto-thunks (ARCHITECTURE §3.5) e otimizações do
  algoritmo push-pull.
