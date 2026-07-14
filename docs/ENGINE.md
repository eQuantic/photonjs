# PhotonJS — `photon-engine` (motor Go)

> Detalhamento da letra **D**: o binário auxiliar em Go. Cobre papel, arquitetura de processo,
> **protocolo JSON-RPC** (com mensagens concretas), **pipeline de imagem**, **chave de cache
> endereçada por conteúdo**, **compressão** e **distribuição do binário**.
>
> Resumo na ARCHITECTURE §10–§11. Aqui é a especificação.

---

## 1. Papel e escopo

O `photon-engine` é um binário Go que faz o trabalho **CPU-bound e de sistema** que o JS faz
mal, mantendo a experiência do dev 100% TypeScript:

- **Otimização de imagens** — decode, resize, reencode AVIF/WebP/JPEG/PNG, com qualidade.
- **Compressão de assets** — Brotli + Gzip pré-computados.
- **Cache endereçado por conteúdo** — hash das entradas → saída; store/stat/GC.
- **(Fase avançada, opcional)** servidor estático/edge para `photon start`.

O que ele **não** faz: nada de UI, reatividade ou regras de negócio — isso é do lado TS.

---

## 2. Arquitetura de processo

Dois modos, um binário:

| Modo | Uso | Forma |
| --- | --- | --- |
| **Daemon** | `photon dev` / `photon start` | Processo persistente, **JSON-RPC sobre stdio**; otimização sob demanda sem custo de spawn |
| **Batch** | `photon build` | `photon-engine batch <manifest.json>`; processa tudo em lote e sai |

O cliente TS **`@photon/engine-rpc`** gerencia o ciclo de vida: spawn, handshake (`engine.info`),
supervisão (restart em crash com backoff), timeouts por requisição e desligamento limpo. O
engine usa um **worker pool** (tamanho ≈ `GOMAXPROCS`); o lado TS aplica **concorrência
limitada** (pipeline) para não inundar o pool.

```
  @photon/build ──┐
                  ├─▶ @photon/engine-rpc ──(JSON-RPC/stdio)──▶ photon-engine (Go, worker pool)
  runtime (dev) ──┘                                                   │
                                                             cache endereçado por conteúdo (disco)
```

**Transporte:** enquadramento estilo LSP — cabeçalho `Content-Length: N\r\n\r\n` + payload JSON
(o mesmo esquema do LSP do tsgo; robusto e simples de parsear). **Bytes de imagem não trafegam
no pipe:** o protocolo passa **referências de arquivo** (caminho + hash); o engine lê da origem
e escreve no cache, devolvendo caminhos/URLs. Isso evita serializar megabytes em JSON.

---

## 3. Protocolo JSON-RPC

Handshake / versão (o cliente valida que a versão do engine casa com a do framework):

```json
→ {"jsonrpc":"2.0","id":1,"method":"engine.info"}
← {"jsonrpc":"2.0","id":1,"result":{
     "version":"0.1.0","imageBackend":"libvips 8.15",
     "formats":["avif","webp","jpeg","png"],"maxConcurrency":8,"hash":"blake3"}}
```

### 3.1 `image.optimize` — otimização sob demanda (dev/SSR)

```json
→ {"jsonrpc":"2.0","id":42,"method":"image.optimize","params":{
     "source":{"path":"public/hero.jpg","contentHash":"blake3:9f2c…","bytes":184320},
     "ops":{"widths":[640,960,1280],"formats":["avif","webp","jpeg"],
            "quality":80,"fit":"cover","stripMetadata":true},
     "output":{"dir":".photon/cache/img","urlBase":"/_photon/img"}}}

← {"jsonrpc":"2.0","id":42,"result":{
     "cacheHit":false,"tookMs":38,
     "variants":[
       {"format":"avif","width":640,"height":360,"bytes":12044,
        "hash":"blake3:9a3f…","file":".photon/cache/img/9a3f8b21….avif",
        "url":"/_photon/img/9a3f8b21….avif"},
       {"format":"webp","width":640,"height":360,"bytes":15980,"hash":"blake3:c1d7…", "...":"…"},
       {"format":"jpeg","width":1280,"height":720,"bytes":88210,"hash":"blake3:77aa…",
        "fallback":true, "...":"…"}
     ]}}
```

O componente `Image` usa esse resultado para emitir `<picture>` com `srcset` por formato/largura,
`width/height` (sem layout shift) e o `<img>` de `fallback`.

### 3.2 `image.batch` — build

Recebe todas as fontes+ops coletadas do grafo (todas as chamadas de `Image`) e materializa as
variantes de uma vez, devolvendo o mapa `origem+ops → variantes` para o manifest.

### 3.3 `compress.batch` — pré-compressão

```json
→ {"jsonrpc":"2.0","id":7,"method":"compress.batch","params":{
     "inputs":[{"path":".photon/static/app-4f2a.js"},
               {"path":".photon/static/styles-8c1.css"}],
     "encodings":["br","gzip"],"minBytes":1024,"brotliQuality":11}}

← {"jsonrpc":"2.0","id":7,"result":{"outputs":[
     {"path":".photon/static/app-4f2a.js","br":{"file":"app-4f2a.js.br","bytes":40211,"ratio":0.31},
                                           "gzip":{"file":"app-4f2a.js.gz","bytes":48903,"ratio":0.37}},
     {"path":".photon/static/styles-8c1.css","skipped":"below minBytes"}]}}
```

Só comprime texto (js/css/svg/html/json) acima do limiar; pula o que já é comprimido (imagens).
O servidor então serve `.br`/`.gz` conforme `Accept-Encoding`.

### 3.4 `cache.*` — cache endereçado por conteúdo

`cache.stat` (existe? metadados), `cache.get` (caminho por chave), `cache.put` (registrar
artefato externo), `cache.gc` (coleta — §5). Todas operam sobre a **chave** definida em §5.

### 3.5 Erros

Erros JSON-RPC padrão com dados úteis: `{"code":-32001,"message":"decode failed",
"data":{"path":"…","reason":"unsupported ICC profile"}}`. O cliente decide degradar (servir o
original) ou falhar o build conforme o modo.

### 3.6 Interface TS (espelho tipado)

```ts
interface PhotonEngine {
  info(): Promise<EngineInfo>;
  optimizeImage(req: ImageRequest): Promise<ImageResult>;   // { variants, cacheHit, tookMs }
  batchImages(reqs: ImageRequest[]): Promise<ImageResult[]>;
  compress(req: CompressRequest): Promise<CompressResult>;
  cache: { stat(k: Key): Promise<Stat|null>; gc(keep: Key[]): Promise<GcReport> };
}
```

---

## 4. Pipeline de imagem

Etapas por variante (backend **libvips via `govips`** — ver §7):

1. **Decode** a fonte (streaming; guarda contra *decompression bombs* — limites de dimensão e
   de pixels).
2. **Auto-orient** pela EXIF e depois **strip de metadata** (privacidade + bytes), preservando
   só o essencial (ICC quando necessário para cor correta).
3. **Resize** para cada `width` alvo, respeitando `fit` (`cover`/`contain`/`inside`), sem
   *upscaling* além do original.
4. **Encode** por formato: AVIF → WebP → (JPEG|PNG) de fallback, com `quality` por formato
   (padrões sensatos por formato; PNG para fontes com alpha sem foto).
5. **Escrita endereçada por conteúdo** no cache (§5); nome do arquivo = hash.
6. **Retorno** do manifest de variantes (formato, w, h, bytes, hash, url).

Derivação de larguras responsivas: a partir do `width` do componente + um conjunto de DPRs
(`1x/2x/3x`) ou de `sizes`, gerando o `srcset`. `format:"auto"` = AVIF+WebP+fallback.

Determinismo: configurações de encoder fixas por versão → **saída reprodutível** (mesma
entrada+ops+versão ⇒ mesmos bytes), o que torna a chave de cache confiável.

---

## 5. Chave de cache endereçada por conteúdo

A saída é **imutável e reproduzível**. A chave de cada variante:

```
variantKey = blake3( sourceHash ‖ 0x00 ‖ canonicalOps ‖ 0x00 ‖ engineVersion )
```

- **`sourceHash`** = `blake3(bytes da fonte)`. Para arquivos locais, memoizado por
  `(path, mtime, size)` para não re-hashar a cada build. Para remotos, hash dos bytes buscados.
- **`canonicalOps`** = JSON canônico (chaves ordenadas) de `{width, height?, fit, format,
  quality, dpr, strip, …}` — normaliza para que ops equivalentes gerem a mesma chave.
- **`engineVersion`** = versão do engine + do backend de imagem. **Upgrade de encoder invalida o
  cache automaticamente** (sem lixo servido).

Consequências:
- **Nome do arquivo** = `hex(variantKey)[…].${ext}` → **URL imutável** →
  `Cache-Control: public, max-age=31536000, immutable` → cache de CDN/navegador perfeito.
- **Dedup** natural: fontes idênticas com ops idênticas ⇒ um único artefato.

**GC (`cache.gc`)**: mark-and-sweep contra o **manifest do build** (conjunto de `variantKey`
referenciados). Não-referenciados além de uma janela (ex.: N dias) são removidos. No `dev`, um
teto **LRU** evita crescimento infinito. A mesma mecânica de chave serve build cache, asset
cache e image cache (ARCHITECTURE §9).

---

## 6. Compressão de assets

- **Brotli** (qualidade 11 no build; menor no on-demand) + **Gzip** de fallback.
- Alvo: texto (`js/css/svg/html/json`) acima de `minBytes`; nunca reprocessa imagens.
- Pré-computa `app.js.br` / `app.js.gz` ao lado do asset; o servidor escolhe por
  `Accept-Encoding` e serve bytes já comprimidos (custo zero em runtime).

---

## 7. Backend de imagem — **[DECISÃO ABERTA]**

| Opção | Prós | Contras |
| --- | --- | --- |
| **libvips via `govips`** *(recomendado)* | Melhor qualidade/velocidade, baixo uso de memória, AVIF/WebP maduros | Depende da lib nativa → precisa **link estático** nos binários distribuídos |
| **Pure-Go** (`x/image` + encoders Go) | Distribuição trivial (um binário, zero deps nativas) | Mais lento; AVIF menos maduro |

Recomendação: **libvips**, com os binários distribuídos já **estaticamente linkados** (o dev
final nunca instala libvips). Mantém-se a possibilidade de um build "pure-Go" como *fallback*
para plataformas exóticas.

---

## 8. Distribuição do binário

Padrão **esbuild/swc**: binários pré-compilados por plataforma, entregues como
**optionalDependencies**, sem compilar nada na máquina do usuário.

- Pacotes por alvo: `@photon/engine-linux-x64`, `@photon/engine-linux-arm64`,
  `@photon/engine-darwin-arm64`, `@photon/engine-darwin-x64`, `@photon/engine-win32-x64`.
- `@photon/engine-rpc` detecta `os/arch` e resolve o binário certo; **verifica checksum**.
- **Ordem de resolução:** `PHOTON_ENGINE_PATH` (override) → pacote da plataforma → *fallback*
  `go build` se houver toolchain Go → erro didático com instruções.
- **Versão travada** à do framework; o handshake `engine.info` recusa versões incompatíveis.

---

## 9. Integração nos fluxos

- **`dev`** — daemon sobe junto; imagens são otimizadas **na primeira requisição** e servidas do
  cache depois; watcher invalida por mudança de `sourceHash`.
- **`build`** — `image.batch` materializa todas as variantes + `compress.batch` pré-comprime os
  estáticos; tudo entra no `manifest.json`; `cache.gc` limpa o não-referenciado.
- **`start`** — serve do cache (imutável). Opcionalmente um **edge server em Go** (mesmo binário)
  para máxima vazão; por padrão o `Bun.serve` já serve os pré-comprimidos — o edge Go é **opt-in**,
  para não obrigar Go em runtime.

---

## 10. Robustez e segurança

- **Allowlist de caminhos:** lê só de raízes permitidas (projeto, `public/`, `node_modules`,
  cache) e escreve só no cache; recusa `..`/absolutos fora das raízes.
- **Limites:** tamanho de entrada, dimensões e total de pixels (anti-bomb); **timeout** por
  requisição; backpressure via fila do worker pool.
- **Privacidade:** strip de EXIF por padrão (mantém orientação aplicada).
- **Observabilidade:** logs estruturados, tempos por etapa, **taxa de cache-hit**; `photon info`
  expõe versão/health/backend do engine.

---

## 11. Alternativa considerada

**Fazer imagens em JS (sharp/wasm)** — rejeitada: pior isolamento do event loop, distribuição
mais frágil e desempenho inferior ao nativo. O Go dá **um binário por plataforma**, paralelismo
real e vazão previsível — exatamente o caso de uso onde ele ganha (coerente com o ADR 0001:
Go para trabalho pesado, TS/tsgo para linguagem e tooling).

---

## 12. Marcos de implementação (recorte da Fase 5)

1. Esqueleto Go + `engine.info` + transporte JSON-RPC + cliente `@photon/engine-rpc`.
2. `image.optimize` (libvips) + cache endereçado por conteúdo + componente `Image`.
3. `image.batch` + `manifest.json` no build.
4. `compress.batch` (Brotli/Gzip) + serviço de pré-comprimidos.
5. `cache.gc` + limites/segurança + `photon info`.
6. Empacotamento por plataforma + checksums + fallback `go build`.
