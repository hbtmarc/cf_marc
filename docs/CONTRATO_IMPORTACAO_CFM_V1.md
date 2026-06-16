# Contrato canônico — cfm.import.v1

Documento normativo para **Importador CFM** e **Gerador JSON**.  
Versão: Fase 0.3.9 · schema `cfm.import.v1`

> Complementa [SCHEMA_IMPORTACAO_JSON.md](./SCHEMA_IMPORTACAO_JSON.md) com invariantes testáveis e correções objetivas para o Gerador JSON.

---

## 1. Identificação

| Campo | Valor |
|-------|-------|
| `schemaVersion` | `"cfm.import.v1"` (obrigatório, exato) |

Qualquer breaking change exige nova versão (`cfm.import.v2`) e migration documentada.

---

## 2. Estrutura raiz

### Arrays principais

| Array | Obrigatório | Descrição |
|-------|-------------|-----------|
| `source` | **sim** (objeto) | Metadados da exportação |
| `transactions` | recomendado | Núcleo operacional |
| `accounts` | opcional | Contas bancárias |
| `cards` | opcional | Cadastro estrutural de cartões |
| `cardSnapshots` | opcional | Posição de limite (prioritária) |
| `invoices` | opcional | Faturas e referências |
| `installmentPlans` | opcional | Parcelamentos e financiamentos |
| `recurringRules` | opcional | Recorrências importadas |
| `review` | opcional | Metadados de revisão humana |

Todos os arrays, quando presentes, devem ser **arrays JSON** (nunca `null`).

### Campos proibidos na raiz

Nunca emitir na exportação:

- CPF, RG, senha, PIN
- Número completo de cartão
- Linha digitável / código de barras em claro
- Payload bruto de extrato sem sanitização

---

## 3. Contrato `source`

| Campo | Tipo | Obrigatório | Regra |
|-------|------|-------------|-------|
| `institution` | string | **sim** | Nome da instituição |
| `documentType` | string | **sim** | ex.: `bank_statement`, `credit_card_bill` |
| `label` | string | não | Rótulo legível |
| `exportedAt` | ISO8601 | não | Data da exportação |
| `periodStart` / `periodEnd` | YYYY-MM-DD | não | Período coberto |
| `rawHash` | string | não | **Somente** `sha256:<64 hex>` |
| `canonicalFingerprint` | string | não | Impressão legível (não hash) |
| `externalRef` | string | não | ID opaco da exportação |

### Invariantes

- `source.rawHash` **nunca** contém texto legível — use `canonicalFingerprint`.
- `badRawHashCount` no importador deve ser **0** após normalização.

---

## 4. Contrato `accounts[]`

| Campo | Tipo | Regra |
|-------|------|-------|
| `id` | string | Estável, único |
| `name` | string | Nome amigável |
| `type` | enum | `checking`, `savings`, `investment` |
| `institution` | string | |
| `lastFour` | string | Máx. 4 caracteres |
| `currency` | string | Default `BRL` |
| `isActive` | boolean | |

---

## 5. Contrato `cards[]` (cadastro estrutural)

| Campo | Tipo | Regra |
|-------|------|-------|
| `id` | string | **Estável** — FK para transações/faturas |
| `name` | string | |
| `brand` | enum | `visa`, `mastercard`, `elo`, `other` |
| `lastFour` / `last4` | string | Máx. 4 dígitos — **nunca** número completo |
| `closingDay` / `dueDay` | 1–28 | |
| `limitCents` | int+ | Cadastro — posição real vem de `cardSnapshots` |
| `accountId` | string? | Conta de débito |
| `externalRef` | string? | Referência alternativa |

### Invariantes

1. `cards[].id` deve ser estável entre exportações.
2. Cartão sem final real → UI exibe **“final não informado”** (não inventar `0000` como dado real).
3. **Limite / usado / disponível** na UI vêm de `cardSnapshots[]`, **não** de `cards[]`.
4. Se `cards[]` contiver `usedCents`/`availableCents`, o Gerador JSON deve migrar para `cardSnapshots[]`.

---

## 6. Contrato `cardSnapshots[]`

| Campo | Tipo | Regra |
|-------|------|-------|
| `cardId` | string | FK → `cards[].id` (ou `cardExternalRef`) |
| `cardExternalRef` | string | Alternativa a `cardId` |
| `snapshotMonth` | YYYY-MM | Mês da posição |
| `snapshotDate` | YYYY-MM-DD | Data do snapshot |
| `limitCents` | int ≥ 0 | |
| `usedCents` | int ≥ 0 | |
| `availableCents` | int ≥ 0 | |
| `source` | **string** | ex.: `import_json`, `manual` — **nunca objeto** |
| `confidence` | enum | `high`, `medium`, `low` |

### Invariantes

1. `cardId` / `cardExternalRef` deve resolver para um `cards[].id` ou `externalRef`.
2. `usedCents + availableCents ≈ limitCents` (tolerância **≤ 1 centavo**).
3. JSON canônico de referência: **1 snapshot por cartão** (4 cartões → 4 snapshots).
4. `source` normalizado como **string segura** — objetos causam `[object Object]` na UI.

---

## 7. Contrato `invoices[]`

| Campo | Tipo | Regra |
|-------|------|-------|
| `id` / `externalRef` | string | Identificador estável |
| `cardId` | string | FK cartão |
| `competenceMonth` | YYYY-MM | **Obrigatório** |
| `totalCents` / `amountDueCents` | int+ | Fatura consolidada |
| `status` | enum | `open`, `closed`, `paid`, … |
| `creditBalanceCents` | int | Saldo credor — **não é receita** |
| `balanceDirection` | enum | `credit` quando saldo a favor |
| `creditBehavior` | string | ex.: `applies_to_next_invoice` |
| `isStub` / `referenceOnly` | boolean | Marca referência/stub |

### Invariantes

1. Stub/referência **explícita** — não confundir com fatura consolidada.
2. `invoiceId` / `invoiceExternalRef` permitem vínculo com transações.
3. Conciliação separa:
   - **Encargos** (compras, tarifas, ajustes − estornos)
   - **Pagamentos/créditos** no demonstrativo
   - **Liquidação bancária** (`credit_card_payment` do período)
   - **Saldo credor** (`creditBalanceCents`) — nunca receita
4. Pagamento/liquidação **não infla** encargos.

---

## 8. Contrato `transactions[]`

| Campo | Tipo | Obrigatório | Regra |
|-------|------|-------------|-------|
| `description` | string | **sim** | |
| `amountCents` | int+ | **sim** | Sempre **positivo** |
| `flow` | enum | **sim** | `in`, `out`, `neutral` |
| `type` | enum | **sim** | Valores canônicos (abaixo) |
| `competenceMonth` | YYYY-MM | **sim** | |
| `accountId` / `cardId` | string | * | Pelo menos um recomendado |
| `invoiceId` / `invoiceExternalRef` | string | não | Vínculo fatura |
| `installmentPlanId` | string | não | Vínculo parcelamento |
| `externalRef` | string | não | Rastreabilidade |
| `source.rawHash` | string | não | Apenas `sha256:<64 hex>` |

### Tipos canônicos (`type`)

`income`, `expense`, `transfer`, `credit_card_purchase`, `credit_card_payment`, `adjustment`, `fee`, `refund`

### Invariantes

1. Direção financeira = `flow`, não sinal de `amountCents`.
2. `credit_card_purchase` deve ter `cardId` quando cartão identificável.
3. Compras de fatura devem ter `invoiceId` ou referência resolvível.
4. Parcelas: `installmentPlanId` ou metadados `installment.current/total` + descrição.
5. Regra segura aplicada → **não** gerar revisão bloqueante redundante.

---

## 9. Contrato `installmentPlans[]`

| Campo | Tipo | Regra |
|-------|------|-------|
| `id` / `externalRef` | string | Estável |
| `description` | string | Merchant / produto |
| `totalInstallments` | int+ | Total de parcelas |
| `currentInstallment` | int | Parcela atual |
| `installmentAmountCents` | int+ | Valor da parcela |
| `kind` | enum | `purchase_installment`, `invoice_installment`, **`financing`** |
| `cardId` | string? | Cartão associado |

### Invariantes

1. Agrupar parcelas por merchant + total + tolerância de centavos.
2. **Financiamento** (ex.: Banco Pan Auto Pan) → `kind: "financing"`.
3. Financiamento **não** é recorrência comum nem semelhança bloqueante.

---

## 10. Contrato `recurringRules[]`

### Campos canônicos (Gerador JSON)

| Campo | Tipo | Regra |
|-------|------|-------|
| `externalRef` | string | **Recomendado** — ID estável |
| `description` | string | |
| `type` | enum | Tipo financeiro |
| `flow` | enum | `in` / `out` |
| `frequency` | enum | `monthly`, `weekly`, `yearly` |
| `expectedAmountCents` | int+ | Valor esperado |
| `categoryLabel` | string | |
| `startCompetenceMonth` | YYYY-MM | |
| `sourcePattern` | string? | |
| `sourceInstitution` | string? | |
| `review` | object? | Revisão humana |

### Campos obsoletos (não emitir)

| Campo | Substituir por |
|-------|----------------|
| `cadence` | `frequency` |
| `amountCents` | `expectedAmountCents` |
| `category` | `categoryLabel` |

### Invariantes

- Deduplicar por **descrição + flow + frequency**.
- Importador normaliza legado, mas o Gerador deve emitir formato canônico.

---

## 11. Vínculos entre entidades

```
accounts ← transactions.accountId
cards ← transactions.cardId / invoices.cardId / installmentPlans.cardId
cardSnapshots → cards (cardId | cardExternalRef)
invoices ← transactions.invoiceId
installmentPlans ← transactions.installmentPlanId
```

Referências quebradas → erro bloqueante no validador de contrato.

---

## 12. Privacidade

O JSON exportado **não pode** conter:

| Verificação | Regra |
|-------------|-------|
| CPF | Padrão detectável → bloqueante |
| Cartão completo | 13–19 dígitos → bloqueante |
| Linha digitável | Padrão boleto → bloqueante |
| Sequência longa sensível | ≥ 12 dígitos isolados → bloqueante |

O validador e o importador **não imprimem** payload completo no console.

---

## 13. Validação automatizada

### Schema básico

Arquivo: `src/schemas/import.schema.js`

### Contrato canônico (Fase 0.3.9)

Arquivo: `src/schemas/import.contract.js`

### Script CLI

```bash
# Fixture sintética versionada
node scripts/validate-import-contract.js data/sample-import.cfm.v1.json

# JSON canônico local (não versionado)
node scripts/validate-import-contract.js ./cfm_import_v1_cardsnapshots.json --canonical
```

Saída inclui:

- totais por array;
- `badRawHashCount`;
- `blockingIssues` / `warnings`;
- resumo seguro do importador;
- seção **CORREÇÕES NECESSÁRIAS NO GERADOR JSON**.

---

## 14. Exemplo sintético mínimo

Ver [data/sample-import.cfm.v1.json](../data/sample-import.cfm.v1.json):

- 1 conta, 2 cartões, 2 snapshots
- 2 faturas consolidadas + 1 stub de referência
- Saldo credor em fatura separada
- Compras, pagamento, parcela e vínculo stub
- 1 plano parcelado, 1 recorrência canônica

**Dados fictícios — seguros para versionar.**

---

## 15. Perfil canônico de referência (local)

Arquivo **`cfm_import_v1_cardsnapshots.json`** (gitignored — nunca commitar):

| Métrica | Esperado |
|---------|----------|
| Lançamentos válidos | 206 |
| Inválidos | 0 |
| Pendências bloqueantes | 0 |
| Cartões | 4 |
| Snapshots | 4 |
| Faturas | 6 |
| Parcelas (planos) | 42 |
| Recorrências | 9 |
| Sugestões opcionais | 4 |
| Observações informativas | 12 |
| Hash inválido | 0 |

Use `--canonical` no script para comparar métricas após importação local.

---

## 16. Evolução

- **Fase 0.3.9:** contrato testável + script CLI.
- **Fase 1 (futuro):** Firebase Auth + RTDB **somente após** contrato PASS no JSON de produção.
- Gerador JSON deve tratar este documento como especificação de emissão.
