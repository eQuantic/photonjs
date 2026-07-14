# ADR 0002 — Convenção de nomes de arquivo (`nome.papel.ts`, estilo NestJS)

- **Status:** Aceita
- **Data:** 2026-07-14
- **Decisores:** Edgar (eQuantic)
- **Relacionado:** ADR 0001 (tudo `.ts`); ARCHITECTURE §7 (rotas), §8 (fronteira), §14 (estrutura)

---

## Contexto

Precisamos de uma convenção de nomes previsível para os arquivos de um app Photon. A referência
escolhida é o **NestJS**: um **sufixo de papel antes da extensão** (`*.controller.ts`,
`*.service.ts`, `*.module.ts`), com um **nome livre** na frente (`users.controller.ts`).

Isso resolve três coisas de uma vez:
1. **Clareza semântica** — o papel do arquivo é óbvio na aba do editor e na busca (fim dos N
   arquivos `page.ts` indistinguíveis).
2. **Classificação para o framework** — router e bundler decidem o tratamento pelo **sufixo**,
   não pelo basename exato.
3. **Fronteira server/cliente no nome** — `*.server.ts` e `*.island.ts` tornam o boundary
   **explícito e greppável**.

Fica 100% dentro do ADR 0001: **são arquivos `.ts`** — intellisense, lint e format de graça.

> Importante: adotamos a **convenção de nomes** do NestJS, **não** o seu roteamento por
> decorators/módulos. O PhotonJS continua **file-based routing** (pasta = URL).

## Decisão

Todo arquivo com papel no framework usa **`nome.papel.ts`**, com **nome em kebab-case**.

### Tabela de sufixos

| Sufixo | Papel | Exporta | Boundary |
| --- | --- | --- | --- |
| `*.page.ts` | Página roteável | `default` Component (+ `loader`/`action`/`metadata`/`config`) | universal |
| `*.layout.ts` | Layout que envolve rotas filhas | `default` Component (recebe `children`) | universal |
| `*.route.ts` | Handler de API | `GET`/`POST`/… | **server** |
| `*.component.ts` | Component reutilizável | Component (`default` ou nomeado) | universal |
| `*.island.ts` | **Fronteira de hidratação** (cliente) | `default` Component | **client** (chunk próprio) |
| `*.server.ts` | Módulo **server-only** (db, segredos, IO) | livre | **server** (fora do bundle) |
| `*.store.ts` | Store de sinais (estado compartilhado) | classe/objeto com `signal`/`computed` | universal |
| `*.loader.ts` | Data loader co-locado (opcional) | `loader` fn | **server** |
| `*.action.ts` | Mutação co-locada (opcional) | `action` fn | **server** |
| `*.error.ts` | Boundary de erro de rota | `default` Component | universal |
| `*.loading.ts` | Fallback de carregamento | `default` Component | universal |
| `*.not-found.ts` | 404 de rota | `default` Component | universal |
| `*.theme.ts` | Tokens/tema (overrides) | `ThemeData` | universal |
| `*.spec.ts` | Teste (`bun test`) | — | — |

### Regra de roteamento

- **Pasta = URL**; `[param]` = segmento dinâmico; `(grupo)` = agrupador que não afeta a URL.
- Dentro de uma pasta de rota, o router encontra **exatamente um** `*.page.ts` (a página) e,
  opcionalmente, `*.layout.ts`, `*.error.ts`, `*.loading.ts`, `*.not-found.ts`; `*.route.ts`
  define um endpoint de API naquele caminho.
- O **nome** (prefixo) é livre; um lint sugere casá-lo com a pasta ou usar `index`
  (`settings/settings.page.ts` **ou** `settings/index.page.ts`).

### Regra de fronteira (encodada no nome)

- `*.server.ts` / `*.route.ts` / `*.loader.ts` / `*.action.ts` → **nunca** entram no bundle do
  cliente. `loader`/`action` exportados de um `*.page.ts` também são removidos.
- `*.island.ts` → **único** ponto que embarca JS no cliente; o bundler dá um **chunk próprio**.
  O *quando* hidratar vem do use-site: `island(Comp, { on: "load|idle|visible|media" })`.
- Todo o resto é **universal** (renderiza no servidor; só vai ao cliente se alcançável a partir
  de uma ilha).

## Consequências

**Positivas**
- Papel óbvio no editor/busca; **greppável** (`rg --glob '*.island.ts'`).
- Router/bundler classificam por sufixo — mais flexível que basename fixo.
- **Boundary server/cliente explícito** no nome (adianta a "letra B").
- Continua `.ts` → toda a tooling padrão funciona (ADR 0001).

**Negativas (com mitigação)**
- *Stutter* possível (`users/users.controller.ts`, à la Nest) → mitigação: nome livre; `index`
  permitido; lint define o estilo da casa.
- Nomes mais longos → aceitável pelo ganho de clareza; editores mostram o prefixo, não o sufixo.

## Alternativas consideradas

1. **Next-style bare (`page.ts`, `layout.ts`)** — rejeitada: abas idênticas e **nenhum** papel
   para arquivos não-rota (components, stores, server, island).
2. **Extensão própria (`.phts`)** — rejeitada pelo ADR 0001.
3. **Roteamento pelo nome do arquivo (flat routes, estilo Remix/Nuxt)** — **variante** possível
   (`blog.page.ts` → `/blog`), mas complica layouts aninhados; ficamos com **pasta = URL** como
   padrão. Revisitar só se houver demanda real.
