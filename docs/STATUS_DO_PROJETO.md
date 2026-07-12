# Status do Projeto

**Projeto:** Controle Financeiro Mensal (CFM)  
**Última atualização:** 12 de julho de 2026  
**Etapa atual:** Etapa 8.1 — Motor de recorrências mensais

---

## Regra permanente — campos interativos

Campos interativos não podem estar dentro de subárvores substituídas a cada evento de input. Durante digitação, atualizar somente o estado e os elementos dependentes, preservando o nó DOM, o foco e a posição do cursor.

Aplicada na revisão de importação (dias de cartão) e na busca de Lançamentos.

---

## Etapa 8.1 — motor de recorrências mensais

### Objetivo

Criar o modelo local e o motor derivado de receitas previstas e despesas recorrentes mensais. Nesta etapa não há interface, rota, formulário ou integração visual com o Dashboard.

### Estrutura `RecurringRule`

Campo opcional em `AppData`: `recurringRules?: RecurringRule[]`. Dados antigos sem o campo carregam com `recurringRules: []`.

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | string | Identificador único |
| `kind` | `income` \| `expense` | Tipo da recorrência |
| `description` | string | Obrigatória |
| `amountCents` | number | Inteiro > 0 |
| `category` | string | Categoria |
| `dayOfMonth` | number | 1–31 |
| `startMonth` | string | `YYYY-MM`, inclusivo |
| `endMonth` | string? | `YYYY-MM`, inclusivo; não pode ser anterior a `startMonth` |
| `status` | `active` \| `paused` | Somente `active` gera ocorrências |
| `billingMode` | `direct` \| `card` | `income` exige `direct`; `expense` aceita ambos |
| `cardId` | string? | Obrigatório em `card`; proibido em `direct` |
| `createdAt` / `updatedAt` | string | ISO |

### Regras suportadas (MVP)

- Periodicidade **somente mensal**.
- Valor **somente fixo** (`amountCents`).
- Sem semanal, anual, valor variável ou calendário complexo.
- Validação em `validateRecurringRule()` (`src/recurrences.ts`).

### Ocorrências derivadas (não persistidas)

Tipo `ProjectedRecurringOccurrence`, calculado em memória por `buildRecurringOccurrences()` e `recurringOccurrencesForMonth()`.

- **Não** entram em `AppData` nem no `localStorage`.
- **Não** criam `Transaction` nem `Invoice`.
- **Não** conciliam com lançamentos reais nesta etapa.

**ID determinístico:** `recurring:<ruleId>:<competenceMonth>` (ex.: `recurring:rule_internet:2026-08`).

**Datas:** `recurringOccurrenceDate(competenceMonth, dayOfMonth)` usa o último dia válido do mês quando `dayOfMonth` excede o calendário (ex.: dia 31 em fevereiro → 28/02; abril → 30/04). Virada de ano (dez → jan) via iteração por competência `YYYY-MM`, sem `setMonth` sobre datas com dia 29–31.

### Limitações do MVP (Etapa 8.1)

- Sem UI, formulários, rotas ou impacto no Dashboard.
- Sem integração com cálculos financeiros (`calculateCompetenceSummary` inalterado).
- Sem conciliação com transações/faturas reais.
- Sem recorrências semanais, anuais ou de valor variável.

### Próximos passos — Etapa 8.2

- Formulários e CRUD de regras recorrentes.
- Exibição em Lançamentos e/ou Dashboard.
- Integração com totais planejados da competência.
- Conciliação opcional com lançamentos reais.

---

## Etapa 7 — organização de Lançamentos

A página **Lançamentos** está dividida em três seções:

1. **Receitas** — transações reais `kind: income` da competência.
2. **Despesas** — despesas diretas (sem `ledgerStatus: in_invoice` e sem `invoiceId`).
3. **Faturas e cartões** — blocos por cartão com fatura real ou projeção quando não há fatura.

**Fatura real:** usa totais oficiais da entidade `Invoice`; linhas internas listadas somente no detalhe expandido.

**Projeção:** exibida quando não há fatura real para `cardId + competenceMonth`; badge `PROJETADA`; não persiste entidade Invoice.

Cada seção possui ordenação independente. Busca e filtros atuam nas três seções.

---

## Etapa 7 — concluída

### Motor derivado de parcelas

Projeções são calculadas **em memória** a partir de compras parceladas já observadas (`kind: expense`, `ledgerStatus: in_invoice`, parcela válida, `cardId` definido). Não há persistência em `AppData`, nem alteração do schema `cfm.local.v2` ou do contrato `cfm.import.v1`.

**Geração:** a partir da observação mais recente de cada assinatura (`cardId` + descrição normalizada + `amountCents` + `installment.total`), usa o maior `installment.current` da competência mais recente e projeta parcelas `current+1 … total` com `shiftCompetenceMonth()` sobre a competência de origem.

**Continuidade entre competências:** observações anteriores da mesma assinatura são ignoradas (ex.: 5/12 em junho + 6/12 em julho → projeta a partir de 6/12). Compras distintas na mesma competência são preservadas quando têm `canonicalFingerprint` diferente.

**Prioridade da fatura real:** se já existir fatura real para o cartão na competência alvo, as parcelas projetadas daquele cartão **não entram** no comprometido nem são exibidas em Lançamentos — evita dupla contagem com a fatura oficial.

**Impacto financeiro (mês sem fatura para o cartão):** parcelas projetadas compõem `expensePendingCents`, afetam `expensePlannedCents` e `balancePlannedCents`. Não alteram `expensePaidCents` nem `balanceRealizedCents`.

**IDs determinísticos:** `projected:<sourceTransactionId>:<installmentNumber>`.

### UI

- **Lançamentos:** combina reais + projeções; badge `PROJETADA`; filtro de status `Projetado`; sem editar/excluir.
- **Dashboard:** painel compacto **Parcelas projetadas** (subtotal, quantidade, agrupamento por cartão, link para Lançamentos).

Fixture sintética de capturas: `src/fixtures/cfm-import-v1-projections.json`. Screenshots: `docs/screenshots-etapa7/`.

### Limitações do MVP

- Assinatura heurística (descrição + valor + total) pode agrupar compras distintas se importadas sem fingerprints diferentes.
- Não cobre despesas fixas/recorrentes nem gera faturas futuras.
- Não permite editar projeções manualmente.

---

## Etapa 6 — concluída

### Ordenação por coluna

Tabelas nativas (`<table>`) com cabeçalhos ordenáveis via botão, `aria-sort` no `th` ativo, indicador de direção e controle mobile **Ordenar por** compartilhando o mesmo estado.

**Padrões iniciais:** Lançamentos data desc · Faturas vencimento asc · Detalhe da fatura data desc.

**Ordem de status documentada em** `src/table-sort.ts`: lançamentos (Na fatura → Pendente → Pago/Recebido); faturas (Aberta → Parcial → Paga → Credora).

Screenshots: `docs/screenshots-etapa6/`.

---

## Etapa 5 — concluída

### Contrato oficial (`cfm.import.v1`)

Campos de entrada: `schemaVersion`, `generatedAt`, `currency`, `incomes`, `cards`, `invoices`, `expenses`.

Sem compatibilidade com o contrato provisório da Etapa 4.

### Fixture de testes

`src/fixtures/cfm-import-v1-valid.json` é **sintética e sanitizada** (1 renda, 5 despesas, 4 faturas cobrindo paid/open/partial/credora, compra+IOF com `sourceRecordId` compartilhado, parcela, refund, fee).

O arquivo financeiro real **não** é versionado. Validação manual usa `cfm_import_20260710_2107_corrigido.json` fora do repositório.

### Cálculo de pago e comprometido

**Pago (`expensePaidCents`):**

- despesas diretas `paid` no ledger (refunds reduzem o líquido);
- `amountPaidCents` das faturas da competência.

**Comprometido (`expensePendingCents`):**

- despesas diretas `pending`;
- `amountDueCents` das faturas (`invoiceDebtCents`).

**Projetado:** `incomePlanned - (pago + devido)`.

Compras `in_invoice` não entram nos totais. `creditBalanceCents` não é renda.

### Validação com arquivo real (manual, fora do repo)

A validação contra carga financeira real permanece apenas no ambiente local, com JSON fora do repositório. Não há valores reais versionados neste documento.

### Página Faturas — histórico e detalhamento

Cards e tabela exibem totais históricos (`invoiceTotalCents`, `amountPaidCents`, `amountDueCents`, `creditBalanceCents`) com valores nominais positivos.

A ação **Ver fatura** abre um painel inline (mesma rota) com cabeçalho oficial da fatura e lançamentos filtrados por `invoiceId`.

Badge de **Cartões e faturas** conta somente faturas `open`, `partial` ou vencidas com saldo em aberto.

Screenshots: `docs/screenshots-etapa5/faturas-*` e `fatura-detalhe-*`.

### Validação técnica

- `npm run typecheck`, `npm test`, `npm run build` — OK.
- Screenshots em `docs/screenshots-etapa5/` (fluxo sintético via navegador).
- Testes locais `*-real*.test.ts` podem ser criados fora do git (ver `.gitignore`).

---

## Etapa 3E — fundação visual

Identidade e ritmo geométrico preservados. Sem redesign nesta etapa.

### Limitações conscientes

Sem Firebase; sem rotas novas; registros manuais nunca sobrescritos; dados financeiros reais fora do git.
