# Status do Projeto

**Projeto:** Controle Financeiro Mensal (CFM)  
**Última atualização:** 10 de julho de 2026  
**Etapa atual:** Etapa 5 — Importador definitivo `cfm.import.v1` (correção final)

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
