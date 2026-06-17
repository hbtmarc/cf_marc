# UX/UI Guide

Guia visual e de experiência — Controle Financeiro Mensal.

> **Decisão de produto (ADR-010):** O tema oficial é **claro**. Não há dark mode no MVP. Ver `docs/DECISOES_TECNICAS.md`.

---

## Identidade do produto

- **Posicionamento:** Produto financeiro pessoal premium — clareza, organização, confiança.
- **Tom visual:** Limpo, respirado, confiável. Não ansioso, não genérico.
- **Idioma:** PT-BR em toda a interface.
- **Moeda:** Real (BRL), formato `R$ 1.234,56` na UI; centavos internamente (`amountCents`).

---

## Tema oficial: Claro premium

O design do produto é inspirado em fintechs modernas: fundo off-white suave, cards brancos com sombra discreta, tipografia forte e acentos controlados por semântica financeira.

### Paleta de tokens CSS

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-bg` | `#f5f7fb` | Fundo principal (off-white azulado) |
| `--color-surface` | `#ffffff` | Superfície de cards e sidebar |
| `--color-surface-soft` | `#f8fafc` | Superfícies secundárias, dropzone |
| `--color-surface-hover` | `#f1f5f9` | Hover em linhas de tabela e nav |
| `--color-border` | `#e2e8f0` | Bordas padrão |
| `--color-border-strong` | `#cbd5e1` | Bordas de ênfase |
| `--color-text` | `#0f172a` | Texto principal (slate-900) — contraste 19.1:1 |
| `--color-text-muted` | `#475569` | Texto secundário (slate-600) — contraste 7.6:1 |
| `--color-text-subtle` | `#64748b` | Labels, hints (slate-500) — contraste 4.6:1 |
| `--color-primary` | `#2563eb` | Ação primária, nav ativa |
| `--color-primary-soft` | `#dbeafe` | Fundo de elemento primário ativo |
| `--color-primary-hover` | `#1d4ed8` | Hover em botão primário |
| `--color-success` | `#059669` | Entradas / positivo |
| `--color-success-soft` | `#d1fae5` | Fundo de badge de entrada |
| `--color-danger` | `#dc2626` | Saídas / negativo |
| `--color-danger-soft` | `#fee2e2` | Fundo de badge de saída |
| `--color-warning` | `#b45309` | Avisos (legível sobre fundo claro) |
| `--color-warning-soft` | `#fef3c7` | Fundo de notice de aviso |
| `--color-warning-border` | `#fde68a` | Borda de notice de aviso |

### Sombras

| Token | Valor | Uso |
|-------|-------|-----|
| `--shadow-sm` | `0 1px 3px rgba(15,23,42,.06)` | Elementos de apoio |
| `--shadow-card` | `0 1px 8px rgba(15,23,42,.08), 0 0 0 1px rgba(15,23,42,.04)` | Cards padrão |
| `--shadow-lg` | `0 8px 32px rgba(15,23,42,.14)` | Sidebar off-canvas no mobile |

### Border-radius

| Token | Valor |
|-------|-------|
| `--radius-sm` | `6px` |
| `--radius-md` | `10px` |
| `--radius-lg` | `16px` |
| `--radius-xl` | `20px` |
| `--radius-card` | `24px` |

---

## Tipografia

- **UI geral:** stack de sistema (`Segoe UI`, `system-ui`, `-apple-system`)
- **Valores numéricos:** `font-variant-numeric: tabular-nums` — alinhamento preciso
- **Labels técnicas e schema:** `font-family: var(--font-mono)` (`Cascadia Code`, `Consolas`)

### Hierarquia

| Elemento | Tamanho | Peso | Cor |
|----------|---------|------|-----|
| Título de página | 1.625rem | 700 | `--color-text` |
| Subtítulo / descrição | 0.9375rem | 400 | `--color-text-muted` |
| Valor de indicador | 1.75rem | 700 | semântica (success/danger/text) |
| Label de card | 0.6875rem | 600 | `--color-text-subtle` — uppercase |
| Corpo / hint | 0.8125rem | 400 | `--color-text-muted` |

---

## Ícones (Phosphor)

**Padrão obrigatório:** [Phosphor Icons](https://github.com/phosphor-icons/core) — peso **regular**, via utilitário centralizado.

| Regra | Detalhe |
|-------|---------|
| API | `CFM.icon("check-circle")` ou alias semântico `CFM.icon("success")` |
| HTML estático | `data-cfm-icon="dashboard"` + `CFM.hydrateIcons()` no bootstrap |
| Novos ícones | Copiar SVG de `assets/icons/phosphor/regular/` e registrar path em `src/utils/phosphor-icons.js` |
| Proibido | Emojis como ícone de UI, SVGs inline ad hoc, Feather/Lucide/Material |

**Aliases comuns:** `success`, `error`, `warning`, `info`, `pending`, `file`, `card`, `chart`, `calendar`, `import`, `dashboard`, `history`, `brand`, `spinner`, `positive`, `link`.

**Classes de tamanho:** `cfm-icon--sm`, `--md`, `--lg`, `--xl`, `--hero`; semântica: `--success`, `--warning`, `--danger`, `--info`; animação: `--spin`.

---

## Layout

```
┌──────────────┬────────────────────────────────┐
│ Sidebar      │ Header (sticky, glassmorphism)  │
│ branca/borda │────────────────────────────────┤
│ esquerda     │ Main content (max 1200px)       │
│              │ padding 2rem 1.5rem             │
└──────────────┴────────────────────────────────┘
```

- **Desktop (≥ 901px):** sidebar fixa 260px + main full-width
- **Tablet / Mobile (≤ 900px):** sidebar off-canvas, hamburger menu, main full-width
- **Sem scroll horizontal** em qualquer breakpoint

---

## Uso de cores por semântica financeira

| Contexto | Cor |
|----------|-----|
| Entradas (`flow: in`) | `--color-success` |
| Saídas (`flow: out`) | `--color-danger` |
| Transferências (`flow: neutral`) | `--color-text-muted` |
| Ação primária / CTA | `--color-primary` |
| Aviso / fase de fundação | `--color-warning` |
| Rascunho / placeholder | `--color-text-subtle` |

Evitar vermelho ou verde em grandes áreas de fundo. Usar apenas em valores numéricos e badges pequenos.

---

## Componentes

### Cards de indicador (`.card--stat`)

```
┌──────────────────────────────────┐
│ LABEL UPPERCASE                  │
│                                  │
│ R$ —          ← valor grande     │
│ hint contextual ← texto sutil    │
└──────────────────────────────────┘
```

### Empty states

Obrigatórios em todas as listas/seções sem dados. Estrutura:

1. Ícone em container `--color-primary-soft`
2. Título conciso (ex: "Nenhum cartão cadastrado")
3. Descrição funcional (ex: o que aparecerá quando houver dados)
4. CTA quando aplicável (disabled enquanto a funcionalidade não existe)

### Notices

- `notice--info` (azul): orientação, dica
- `notice--warning` (âmbar): limitação de fase, ação pendente

### Botões

- `btn--primary`: azul sólido com sombra leve — ações destrutivas ou de progresso
- `btn--ghost`: borda sutil — ações secundárias ou desabilitadas

---

## Microcopy

- Linguagem: PT-BR claro, direto, sem jargão excessivo
- Textos de estado vazio: descrevem o que aparece quando há dados (não só "nenhum dado")
- Avisos de fase/placeholder: honestos, não alarmistas

Exemplos corretos:

| Contexto | Texto |
|----------|-------|
| Header importador | "Nada é gravado no Firebase nesta fase." |
| Notice importador | "Persistência desabilitada nesta fase. A gravação no Firebase RTDB será implementada após a integração de autenticação." |
| Feature list | "amountCents sempre positivo; direção definida por flow." |
| Feature list | "competenceMonth obrigatório em transações no formato YYYY-MM." |
| Feature list | "source.rawHash ou externalRef garantem rastreabilidade sem expor dados sensíveis." |

---

## Acessibilidade de contraste

Todos os tokens de cor de texto foram calibrados para passar WCAG AA (≥ 4.5:1) em superfícies claras:

| Token | Valor | Contraste em branco | Resultado |
|-------|-------|---------------------|-----------|
| `--color-text` | `#0f172a` | 19.1:1 | ✅ AAA |
| `--color-text-muted` | `#475569` | 7.6:1 | ✅ AAA |
| `--color-text-subtle` | `#64748b` | 4.6:1 | ✅ AA |
| `--color-primary` | `#2563eb` | 5.9:1 | ✅ AA |
| `--color-success` | `#059669` | 4.7:1 | ✅ AA |
| `--color-danger` | `#dc2626` | 5.1:1 | ✅ AA |
| `--color-warning` | `#b45309` | 5.6:1 | ✅ AA |

> `--color-text-subtle` deve ser usado apenas para texto auxiliar de tamanho normal (≥ 14px) ou texto em negrito (≥ 11px bold). Não usar para texto corrido em tamanhos menores que 14px.

---

## O que evitar

- Dark mode como padrão (ADR-010)
- Toggle dark/light no MVP
- `@media (prefers-color-scheme: dark)` nesta fase
- Vermelho ou verde em grandes blocos de fundo
- Ellipsis em valores financeiros críticos
- Visual de planilha (tabelas densas sem espaçamento)
- Modais empilhados
- Fontes externas (CDN) — usar stack de sistema

---

## Arquivos CSS

| Arquivo | Escopo |
|---------|--------|
| `assets/css/base.css` | Tokens, reset, variáveis |
| `assets/css/layout.css` | Shell, sidebar, header, responsividade |
| `assets/css/components.css` | Cards, buttons, empty states, notices, tabelas |
| `assets/css/pages.css` | Ajustes específicos por página |
