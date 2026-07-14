# ADR 0001 — Linguagem de autoria e tooling: `.ts`, não `.phts`

- **Status:** Aceita
- **Data:** 2026-07-14
- **Decisores:** Edgar (eQuantic)
- **Relacionado:** ARCHITECTURE §3 (reatividade), §5.1 (estilo), §7 (rotas), §12 (toolchain)

---

## Contexto

O PhotonJS descreve UI em **TypeScript puro** com composite pattern — **sem JSX e sem
template string** (ARCHITECTURE §1). Surgiu a proposta de criar uma extensão de arquivo
própria, `.phts`, tendo **Go como "interpretador"**, com o objetivo declarado de **ganhar
intellisense e outros recursos**.

A avaliação precisa separar três coisas que a proposta mistura:

1. **Runtime/execução** ("interpretador") — quem *roda* o código. No PhotonJS é o **Bun**.
2. **Compilação/transform** — quem *transforma* o código em build. Pode ser um **plugin do Bun**.
3. **Intellisense** — quem dá *completar/checar/quick-fix* no editor. Vem de um **Language
   Server (LSP)**, não de um interpretador.

A distinção decisiva: **intellisense de TypeScript vem do `tsserver`/LSP.** E o **TypeScript 7
(`tsgo`) já é o compilador + LSP do TypeScript escrito em Go** — que o projeto já adotou
(ARCHITECTURE §12). Logo, *"Go dando intellisense ao seu TS"* **já é o cenário atual** ao
manter os arquivos como `.ts`.

Além disso, como a UI é **apenas composição de funções/classes** (não há template nem JSX),
**não existe sintaxe nova para um parser interpretar**. Um interpretador `.phts` reimplementaria
a semântica do TypeScript para obter… a mesma semântica do TypeScript.

## Decisão

1. **Páginas e componentes são escritos em `.ts` padrão.** O intellisense vem do **tsgo/TS7**
   (LSP nativo em Go) — de graça, sem fork.
2. **Recursos Photon-aware são entregues por três mecanismos que *aumentam* a tooling, sem
   substituí-la:**
   - **Bun plugin (`@photon/build`)** — transforms de build: auto-thunks para sinais, extração
     de CSS atômico, split por ilha, remoção de código server-only. (Padrão Solid/Qwik.)
   - **Codegen** — emite `.d.ts` para **rotas e loaders tipados** (`Link`/`router.push`,
     `ctx.data<typeof loader>()`). (Padrão Next/Remix.)
   - **TS Language Service Plugin (`@photon/tsplugin`)** — inteligência Photon no editor:
     completar `Colors.Primary.` → `Base/OnBase/Pressed/Subtle/OnSubtle`; avisar *"use `Show` em
     vez de `if` dentro de `build()`"*; validar `Link({ to, params })` contra as rotas reais;
     quick-fix *"envolver em thunk"* ao ler `.value` numa prop estática.
3. **Go fica reservado para o `photon-engine`** (imagens/compressão/cache — CPU-bound), onde é
   a ferramenta certa. **Não** é usado para tooling de linguagem, porque o tsgo já é a referência.
4. **A identidade do framework** vive na **API** e no **CLI `photon`** — não numa extensão.

## Consequências

**Positivas**
- Intellisense, formatação e lint **funcionam de imediato** (é `.ts`); compatibilidade total
  com o ecossistema.
- **Nada de compilador/LSP próprio para manter** contra um upstream da Microsoft que anda rápido.
- Foco de engenharia no **framework**, não numa linguagem.
- Type-check ponta a ponta (`loader → ctx.data → props → sinais`) com o tsgo.

**Negativas / trade-offs (com mitigação)**
- *Ergonomia de thunks* (`Text(() => x.value)`) até o transform de auto-thunk existir →
  mitigação: regra única e clara agora; transform na Fase 6 (ARCHITECTURE §3.5).
- *Suporte a LS Plugin no TS7 ainda amadurecendo* → mitigação: hoje o plugin roda no
  `tsserver` para o editor; o tsgo cobre o type-check rápido no CI. Acompanhamos a evolução.
- *Sem sintaxe nova* — tudo precisa caber em transform/codegen/LS-plugin → aceitável: era
  justamente a premissa "TypeScript puro".

## Alternativas consideradas

1. **`.phts` + interpretador/compilador próprio em Go** — **rejeitada.** Exigiria **forkar o
   tsgo** ou escrever um LSP do zero (o caminho Vue/Svelte, que sustentam language servers
   inteiros como o Volar a custo permanente). Multi-ano, **compete** com construir o framework,
   **contradiz** a premissa de TS puro e, na prática, **remove** o intellisense em vez de dar.
2. **`.tsx` / JSX** — rejeitada anteriormente (premissa "zero JSX").
3. **DSL de template (estilo `.vue`)** — rejeitada: não há template no modelo
   composite-pattern-em-TS; nada para uma linguagem de template resolver.

## Quando revisitar

Só se emergir uma necessidade real de **formato de autoria com template próprio**. Mesmo então:
extensão de arquivo é decisão de **rótulo + transform**, nunca de "trocar o compilador de TS por
um em Go" — e o intellisense continuaria vindo de um **LSP**, não do interpretador.
