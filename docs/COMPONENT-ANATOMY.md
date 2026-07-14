# PhotonJS — Anatomia de um componente (letra A)

> Como um `Component` do inventário é modelado **de ponta a ponta**: da API pública → tokens do
> design system → implementação (composto de primitivas) → acessibilidade → **HTML + CSS atômico
> emitidos**. Dois casos: `Button` (ação, variantes, estados) e `TextInput` (formulário,
> controlado por sinal, erro reativo).
>
> Contrato geral no fim (§5). Relacionado: ARCHITECTURE §5 (estilo/tokens), ADR 0001/0002.

---

## 1. O contrato de um componente

Todo componente do `@photon/components`:

1. Expõe **props tipadas**, com valores estáticos **ou** reativos (`Reactive<T>`).
2. Usa **apenas tokens** do design system para estilo (sem número mágico).
3. É montado a partir de **primitivas** (Fase A: `Box`, `Row`, `Text`, `Icon`, `Pressable`).
4. Emite **HTML semântico** + **classes atômicas** (o token vira CSS custom property).
5. Respeita as regras de **a11y** do design system (contraste, focus ring 2dp, disabled 38%,
   touch target mínimo).
6. Mantém **paridade com o "v1 fence"** do motor mobile (mesma aparência cross-platform).

---

## 2. `Button`

### 2.1 API pública

```ts
interface ButtonProps {
  label?: Reactive<string>;                 // estático ou thunk/sinal
  onPressed?: () => void;
  variant?: "primary" | "secondary" | "destructive" | "ghost";   // default: "primary"
  size?: "sm" | "md" | "lg";                // default: "md"
  leading?: IconName;  trailing?: IconName; // ícones opcionais (Lucide)
  disabled?: Reactive<boolean>;
  loading?:  Reactive<boolean>;             // troca o conteúdo por Spinner + aria-busy
  fullWidth?: boolean;
  type?: "button" | "submit";               // "submit" integra com <form>/action
}
export function Button(props: ButtonProps): Component;
```

### 2.2 `variant` → os 5 sub-tokens + estados

Cada variante mapeia para **uma família de cor** do design system; os **estados** escolhem o
sub-token certo (nada é hardcoded):

| Estado | Fonte do token (ex.: `variant="primary"`) |
| --- | --- |
| repouso (bg / texto) | `Primary.Base` / `Primary.OnBase` |
| `:hover` | mistura sutil (overlay 4–8%) sobre `Base` |
| `:active` (pressed) | `Primary.Pressed` |
| `:focus-visible` | anel `Focus` (2dp de offset) |
| `disabled` | grupo a 38% de opacidade (regra do design system) |
| `variant="ghost"` | fundo transparente → `Subtle` no hover; texto `Primary.Base` |

`secondary` → família `Secondary`; `destructive` → `Destructive`. `size` mapeia altura de
controle + padding + papel tipográfico: `sm`=32/`Label`, `md`=40/`Label`, `lg`=48/`Body/M`.

### 2.3 Implementação (composto de primitivas)

```ts
export function Button(p: ButtonProps): Component {
  const variant = p.variant ?? "primary";
  const size = p.size ?? "md";
  return Pressable({                                   // primitiva de gesto + foco + estados
    role: "button",
    type: p.type ?? "button",
    disabled: p.disabled,
    onPress: p.onPressed,
    semantics: { busy: p.loading },
    style: buttonStyle(variant, size, p.fullWidth),    // resolve tokens → props de estilo
    child: Show({
      when: () => resolve(p.loading) === true,
      child: Spinner({ size: "sm", tone: onColorOf(variant) }),
      fallback: Row({
        gap: Space.S2, align: "center", justify: "center",
        children: [
          p.leading ? Icon(p.leading, { size: iconOf(size) }) : null,
          p.label ? Text(p.label, { style: labelStyleOf(size) }) : null,
          p.trailing ? Icon(p.trailing, { size: iconOf(size) }) : null,
        ].filter(Boolean),
      }),
    }),
  });
}
```

`Pressable` centraliza: `:hover/:active/:focus-visible`, `disabled` (bloqueia eventos + 38%),
teclado (Enter/Espaço), e o **focus ring** via token — para todos os componentes clicáveis.

### 2.4 HTML + CSS emitidos

Para `Button({ label: "Salvar", variant: "primary" })`:

```html
<button class="ph-btn ph-btn--md bg-primary text-on-primary rounded-md focus-ring"
        type="button" aria-busy="false">
  <span class="ph-row ph-row--center gap-8">
    <span class="label-13 text-on-primary">Salvar</span>
  </span>
</button>
```

```css
/* camada de tokens (uma vez, no :root) */
:root{--ph-primary-base:#0050A0;--ph-primary-on-base:#FFFFFF;--ph-primary-pressed:#00427F;
      --ph-focus:#0050A0}
:root[data-theme="dark"]{--ph-primary-base:#5CA2E8;--ph-primary-on-base:#06263F;
      --ph-primary-pressed:#7CB5EE;--ph-focus:#7CB5EE}
/* átomos (deduplicados no build) */
.ph-btn{display:inline-flex;align-items:center;justify-content:center;border:0;cursor:pointer}
.ph-btn--md{height:40px;padding:0 16px}
.bg-primary{background:var(--ph-primary-base)}
.bg-primary:hover{background:color-mix(in srgb,var(--ph-primary-base) 92%,#000)}
.bg-primary:active{background:var(--ph-primary-pressed)}
.text-on-primary{color:var(--ph-primary-on-base)}
.rounded-md{border-radius:10px}
.focus-ring:focus-visible{outline:2px solid var(--ph-focus);outline-offset:2px}
.ph-btn[disabled]{opacity:.38;pointer-events:none}
```

Note: **tema light/dark é só troca das custom properties** — os átomos não mudam. Cache perfeito.

### 2.5 Estados reativos

`disabled`/`loading`/`label` aceitam `Reactive<T>`: um `Button({ loading: () => saving.value })`
liga um efeito que alterna `aria-busy` e o conteúdo (`Show`) **sem re-render** do resto da tela.

---

## 3. `TextInput`

### 3.1 API pública

```ts
interface TextInputProps {
  value: Signal<string>;                    // controlado por sinal (2-way)
  onChanged?: (v: string) => void;
  label?: Reactive<string>;
  placeholder?: string;
  type?: "text" | "email" | "password" | "number";
  error?: Reactive<string | null>;          // mensagem de erro (reativa) → estado "error"
  helper?: Reactive<string>;                // texto de apoio
  leading?: IconName;  trailing?: IconName;
  disabled?: Reactive<boolean>;
  required?: boolean;
}
export function TextInput(props: TextInputProps): Component;
```

### 3.2 Estados → tokens

| Estado | Tokens |
| --- | --- |
| repouso | `bg Surface` · borda `Border` · texto `Text.Primary` · placeholder `Text.Muted` |
| `:focus` | borda `Primary.Base` + focus ring `Focus` |
| `error` (quando `error != null`) | borda `Destructive.Base` · texto de erro `Destructive.Base` |
| `disabled` | grupo 38% |

### 3.3 Erro reativo + a11y

```ts
const email = signal("");
const emailError = computed(() =>
  email.value.includes("@") ? null : "E-mail inválido");

TextInput({ label: "E-mail", type: "email", value: email,
            onChanged: v => email.value = v, error: emailError, required: true });
```

`error` é um `computed`: quando vira não-nulo, o campo entra em estado `error`, mostra a
mensagem e liga `aria-invalid` + `aria-describedby` — tudo **cirúrgico** (só o campo e o texto
de erro reagem).

### 3.4 HTML emitido

```html
<div class="ph-field" data-state="error">
  <label for="f-email" class="label-13 text-secondary">E-mail</label>
  <div class="ph-input h-40 px-12 rounded-md bg-surface border-1 border-destructive">
    <input id="f-email" type="email" class="body-15 text-primary" required
           aria-invalid="true" aria-describedby="f-email-err" />
  </div>
  <p id="f-email-err" class="caption-12 text-destructive">E-mail inválido</p>
</div>
```

`label[for]` ↔ `input[id]`, `aria-invalid`, `aria-describedby` apontando ao erro: acessível por
padrão. `data-state` no wrapper permite estilizar borda/label por estado com um átomo só.

---

## 4. Paridade cross-platform

O mesmo `Button`/`TextInput`, com os mesmos tokens, existe no Photon Mobile — lá o `Pressable`
vira gesto nativo e o "HTML" vira draws SDF, mas **os tokens e os estados são idênticos**. Por
isso os componentes se restringem ao **"v1 fence"** (rrect, borda uniforme, sombra, sem paths
arbitrários) nos elementos compartilhados; extras exclusivos de web (ex.: `backdrop-filter`)
ficam atrás de escape hatch.

---

## 5. O contrato para quem escreve componentes (resumo)

1. **Props = `Reactive<T>`** onde fizer sentido (texto, disabled, loading, error).
2. **Só tokens** (`Colors.*`, `Space.*`, `Radius.*`, `Elevation.*`, `Focus`); nada de literais.
3. **Componha primitivas**; centralize gesto/foco/estado no `Pressable`.
4. **Emita HTML semântico** + classes atômicas; um sub-token por estado.
5. **a11y não é opcional**: role/aria, focus ring por token, disabled 38%, target mínimo.
6. **Fique no v1 fence** para o que é compartilhado com o mobile.
