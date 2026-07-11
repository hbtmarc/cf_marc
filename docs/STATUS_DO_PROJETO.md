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

| Competência | Recebido | Pago | Devido | Saldo após pagos | Projetado |
|-------------|----------|------|--------|------------------|-----------|
| 2026-06 | 570328 | 581902 | 0 | -11574 | -11574 |
| 2026-07 | 579067 | 568047 | 484624 | 11020 | -473604 |
| 2026-08 | 0 | 0 | 151159 | — | -151159 |

Primeira importação: **343 criados**. Reimportação: **343 existentes**, sem duplicatas.

### Validação técnica

- `npm run typecheck`, `npm test` (58+), `npm run build` — OK.
- Screenshots em `docs/screenshots-etapa5/` (fluxo real via navegador).
- Testes `*-real*.test.ts` rodam somente se o JSON aprovado existir localmente.

---

## Etapa 3E — fundação visual

Identidade e ritmo geométrico preservados. Sem redesign nesta etapa.

### Limitações conscientes

Sem Firebase; sem rotas novas; registros manuais nunca sobrescritos; dados financeiros reais fora do git.
