# Status do Projeto

**Projeto:** Controle Financeiro Mensal (CFM)  
**Última atualização:** 10 de julho de 2026  
**Etapa atual:** Etapa 5 — Importador definitivo `cfm.import.v1`

---

## Etapa 5 — concluída

### Objetivo

Substituir integralmente o contrato provisório da Etapa 4 pelo contrato definitivo `cfm.import.v1`, com persistência idempotente e proteção contra dupla contagem.

### Contrato oficial (`cfm.import.v1`)

Campos de entrada: `schemaVersion`, `generatedAt`, `currency`, `incomes`, `cards`, `invoices`, `expenses`.

Sem compatibilidade com o contrato anterior (`source`, `accounts`, `transactions`, etc.).

### Fluxo da página Importar

1. Selecionar ou arrastar JSON
2. Validar
3. Apresentar revisão (contagens, distribuição expense/fee/refund, parcelas, novos/atualizados/existentes/conflitos)
4. Confirmar importação
5. Persistir
6. Mostrar resultado

Nenhum dado é salvo antes da confirmação.

### Regras de persistência

| Entidade | Idempotência | Comportamento |
|----------|--------------|---------------|
| `incomes` | `canonicalFingerprint` | Renda recebida (`settled`) |
| `expenses` diretas | `canonicalFingerprint` | `paid` → liquidada; `pending` → pendente; `refund` reduz líquido; `fee` é despesa |
| `expenses` de cartão | `canonicalFingerprint` | Com `cardId` + `invoiceId`: `in_invoice`, parcelas preservadas, detalhamento apenas |
| `cards` | `id` do arquivo | Upsert; preserva issuer, last4, aliasesLast4, closingDay, dueDay |
| `invoices` | `id` do arquivo | Upsert; valores e status podem atualizar na reimportação; coerência `invoiceTotal + credit = paid + due` |

### Anti dupla contagem

- Receita recebida e despesa direta entram no realizado/comprometido.
- Compras `in_invoice` não entram nos totais — obrigação vem da fatura (`amountDueCents` / `invoiceTotalCents`).
- `amountPaidCents` informa liquidação; não cria nova despesa.
- `creditBalanceCents` reduz obrigação; nunca vira renda.

### Modelo local (`cfm.local.v2`)

Extensões opcionais em `Transaction`, `Card` e `Invoice` (`ledgerStatus`, `expenseKind`, `installment`, `issuer`, `invoiceTotalCents`, etc.). Dados existentes continuam carregando sem migração.

### Validação com arquivo aprovado

`cfm_import_20260710_2107_corrigido.json` (fixture: `src/fixtures/cfm-import-v1-valid.json`):

- 2 incomes, 4 cards, 9 invoices, 328 expenses
- 309 expense, 13 fee, 6 refund
- 123 parcelas, 330 fingerprints únicos

### Validação técnica

- `npm run typecheck`, `npm test` (52), `npm run build` — OK.
- Screenshots em `docs/screenshots-etapa5/` (1440, 768, 390 px).

---

## Etapa 4 — substituída pela Etapa 5

Contrato provisório removido. Ver histórico no git (`feat: add local financial import flow` → `feat: finalize monthly financial importer`).

---

## Etapa 3E — concluída

Fundação visual encerrada. Identidade, componentes e ritmo geométrico preservados na Etapa 5.

### Limitações conscientes

Sem Firebase; sem rotas novas; sem contas correntes no importador; registros manuais nunca sobrescritos.
