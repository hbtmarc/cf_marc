# Schema de Importação JSON — cfm.import.v1

Versão canônica para importação rápida de dados financeiros no Controle Financeiro Mensal.

---

## Identificação

| Campo | Valor |
|-------|-------|
| `schemaVersion` | `"cfm.import.v1"` (obrigatório, exato) |

---

## Estrutura raiz

```json
{
  "schemaVersion": "cfm.import.v1",
  "source": { ... },
  "accounts": [ ... ],
  "cards": [ ... ],
  "invoices": [ ... ],
  "transactions": [ ... ],
  "installmentPlans": [ ... ],
  "recurringRules": [ ... ],
  "review": { ... }
}
```

Arrays opcionais exceto quando vazios (`[]`). `transactions` é o núcleo operacional.

---

## `source` (obrigatório)

Rastreabilidade da origem **sem dados sensíveis**.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `label` | string | sim | Nome legível da fonte (ex: "Export App X") |
| `exportedAt` | ISO8601 | não | Data/hora da exportação |
| `rawHash` | string | não | Hash SHA-256 do arquivo original (dedupe) |
| `externalRef` | string | não | ID opaco no sistema de origem |

**Proibido em `source`:** CPF, conta, agência, cartão completo, boleto, QR Code.

---

## `accounts[]`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | Identificador estável |
| `name` | string | Nome amigável |
| `type` | enum | `checking`, `savings`, `investment` |
| `institution` | string | Nome do banco (fictício OK) |
| `lastFour` | string | Apenas 4 últimos dígitos |
| `currency` | string | Default `BRL` |
| `isActive` | boolean | |

---

## `cards[]`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | |
| `name` | string | |
| `brand` | enum | `visa`, `mastercard`, `elo`, `other` |
| `lastFour` | string | 4 dígitos apenas |
| `closingDay` | 1–28 | Dia fechamento fatura |
| `dueDay` | 1–28 | Dia vencimento |
| `limitCents` | int+ | Limite em centavos (cadastro; snapshot pode sobrepor localmente) |
| `accountId` | string? | Conta de débito vinculada |
| `externalRef` | string? | Referência estável para snapshot/fatura |

> **Fase 0.3.6:** Posição de limite (usado/disponível) pertence a `cardSnapshots`, não à fatura. Overlay local: `card-snapshots.local.js` (gitignored).

---

## `cardSnapshots[]` (conceitual — Fase 0.3.6 / RTDB Fase 1)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `cardExternalRef` | string | FK para cartão |
| `snapshotMonth` | YYYY-MM | Mês da posição |
| `snapshotDate` | YYYY-MM-DD | Data do snapshot |
| `limitCents` | int+ | Limite total |
| `usedCents` | int+ | Limite utilizado |
| `availableCents` | int+ | Limite disponível |
| `source` | string | Origem (import, overlay local, manual) |
| `confidence` | enum | `high`, `medium`, `low` |
| `review.required` | boolean | Revisão se dados ambíguos |

### Entidade enriquecida na UI (Fase 0.3.6-C)

Após merge JSON + overlay local, cada cartão expõe:

| Campo | Descrição |
|-------|-----------|
| `limitCents` | Limite efetivo |
| `usedCents` | Utilizado no snapshot |
| `availableCents` | Disponível no snapshot |
| `usagePercent` | Percentual usado |
| `snapshotSource` | `import_json`, `snapshot_local`, `limit_override_local` |
| `snapshotMonth` | Mês do snapshot aplicado |
| `snapshotDate` | Data do snapshot (se existir) |
| `snapshotConsistent` | `true` se `usedCents + availableCents ≈ limitCents` |

> `lastFour` placeholder (`0000`) não é exibido na UI.

---

## Conciliação de faturas (Fase 0.3.6-C)

Função local: `buildInvoiceReconciliation(invoice, transactions, context)`.

Transações **incluídas** quando:

- `invoiceExternalRef` / `invoiceId` coincide com a fatura; **e**
- `competenceMonth` da transação = competência da fatura (quando ambos presentes).

Transações **excluídas**:

- Pagamento de fatura (`credit_card_payment`)
- Saldo credor / receita indevida em fatura credora
- Stub / `referenceOnly`
- Parcelas futuras ou `status: planned|scheduled`
- Transações do cartão no mês **sem** vínculo explícito à fatura (geram conciliação parcial)

Campos de saída:

| Campo | Descrição |
|-------|-----------|
| `invoiceTotalCents` | `amountDueCents` ou `totalCents` |
| `linkedPurchasesCents` | Compras vinculadas |
| `linkedFeesCents` | Tarifas |
| `linkedRefundsCents` | Estornos |
| `linkedPaymentsCents` | Pagamentos (informativo, fora da soma de compras) |
| `creditBalanceCents` | Saldo credor da fatura (não é receita) |
| `reconciliationDeltaCents` | Diferença quando confiança alta |
| `confidence` | `high`, `partial`, `low`, `n/a` |

---

## `invoices[]`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | |
| `cardId` | string | FK para `cards` |
| `competenceMonth` | YYYY-MM | **Obrigatório** |
| `dueDate` | YYYY-MM-DD | |
| `totalCents` | int+ | |
| `amountDueCents` | int+ | Valor a pagar (pode diferir de total) |
| `status` | enum | `open`, `closed`, `paid` |
| `creditBalanceCents` | int | Saldo credor (não é receita) |
| `balanceDirection` | enum | `credit`, `debit` |
| `creditBehavior` | string | ex: `applies_to_next_invoice` |
| `isStub` | boolean | Fatura stub/referência |
| `referenceOnly` | boolean | Apenas vínculo — não consolidada |

---

## `transactions[]`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | string | recomendado | |
| `accountId` | string? | * | Conta (ou `cardId`) |
| `cardId` | string? | * | Cartão |
| `description` | string | sim | |
| `category` | string | não | |
| `competenceMonth` | YYYY-MM | **sim** | Mês de competência |
| `date` | YYYY-MM-DD | não | Data efetiva |
| `amountCents` | int | **sim** | Sempre **positivo** |
| `flow` | enum | **sim** | `in`, `out`, `neutral` |
| `type` | enum | **sim** | Ver valores canônicos abaixo |
| `externalRef` | string? | | ID opaco no sistema de origem |
| `source` | object? | | Metadados de rastreabilidade da transação |
| `source.rawHash` | string? | | Hash SHA-256 do lançamento original |
| `counterpartAccountId` | string? | | Para transferências (`neutral`) |

### Valores canônicos de `type`

| Valor | Descrição |
|-------|-----------|
| `income` | Receita / entrada de recursos |
| `expense` | Despesa em conta (não cartão) |
| `transfer` | Transferência entre contas |
| `credit_card_purchase` | Compra lançada no cartão |
| `credit_card_payment` | Pagamento de fatura de cartão |
| `adjustment` | Ajuste contábil |
| `fee` | Tarifa bancária |
| `refund` | Reembolso / estorno |

### Rastreabilidade por transação

Uma transação é considerada rastreável quando possui **pelo menos um** dos campos:

- `externalRef` (na raiz da transação)
- `source.rawHash` (dentro do objeto `source` da transação)

Não usar número de cartão, CPF ou conta completa em campos de rastreabilidade.

\* Pelo menos um de `accountId` ou `cardId` recomendado.

### Regras de valor

```
amountCents > 0  (sempre)
flow = "in"      → entrada
flow = "out"     → saída
flow = "neutral" → transferência interna / não afeta saldo consolidado
```

---

## `installmentPlans[]`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | |
| `cardId` | string | |
| `description` | string | |
| `totalInstallments` | int | |
| `currentInstallment` | int | Parcela atual |
| `installmentAmountCents` | int+ | |
| `startCompetenceMonth` | YYYY-MM | |
| `flow` | `out` | |
| `kind` | enum | `invoice_installment`, `purchase_installment` (Fase 0.3.4) |

---

## `recurringRules[]`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | |
| `description` | string | |
| `accountId` | string | |
| `amountCents` | int+ | |
| `flow` | `out` | (typical) |
| `frequency` | enum | `monthly`, `weekly`, `yearly` |
| `dayOfMonth` | int? | |
| `category` | string | |
| `isActive` | boolean | |

---

## `review` (opcional)

Bloco pós-importação para revisão humana.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `status` | enum | `pending`, `approved`, `rejected` |
| `notes` | string | |
| `suggestedActions` | string[] | |

---

## Validação implementada

Arquivo: `src/schemas/import.schema.js`

- `schemaVersion` exato (`cfm.import.v1`)
- `source.institution` e `source.documentType` obrigatórios
- Cada transação: `competenceMonth`, `amountCents` positivo, `flow` válido, `description`, `type` canônico
- Rastreabilidade: aviso quando ausentes `externalRef` e `source.rawHash`
- Validação completa de FKs e unicidade — Fase 1+

---

## Exemplo

Ver [data/sample-import.cfm.v1.json](../data/sample-import.cfm.v1.json) — dados **fictícios**, sanitizados.

---

## Evolução de versão

Breaking change → `cfm.import.v2` com migration documentada. Versões coexistem temporariamente via detector no `import.service.js`.

---

## Classificação de semelhanças (Fase 0.3.3)

O importador classifica pares de transações localmente — **nada é removido automaticamente**.

| Classificação | Critério resumido |
|---------------|-------------------|
| Duplicata exata | Mesmo `source.rawHash` ou `externalRef` |
| Duplicata provável | Mesmo tipo, valor, data, descrição e conta/cartão |
| Parcelas relacionadas | Mesmo plano ou parcela X/Y com números diferentes |
| Recorrência candidata | Mesmo favorecido/valor em meses diferentes |
| Compra repetida | Mesmo estabelecimento/valor em datas diferentes no mesmo mês |
| Transferência semelhante | Pix/transferência para mesmo favorecido em datas diferentes |

Campos úteis: `installment.current`, `installment.total`, `installmentPlanExternalRef`, `transactionDate`, `postedDate`, `status` (`planned`/`confirmed`).

---

## Idempotência e reimportação (Fase 0.3.4)

### `canonicalFingerprint`

Chave estável calculada localmente por transação (`buildCanonicalFingerprint`):

| Componente | Campo |
|------------|-------|
| Instituição | `source.institution` |
| Tipo de documento | `source.documentType` |
| Conta/cartão | `accountId` ou `cardId` |
| Data | `transactionDate` ou `postedDate` |
| Valor | `amountCents` |
| Fluxo | `flow` |
| Tipo | `type` |
| Descrição | normalizada |
| Fatura | `invoiceExternalRef` / `invoiceId` (quando houver) |
| Parcela | `installment.current` / `total` (quando houver) |
| Hash origem | `source.rawHash` (quando houver) |

### Classificação de reimportação (simulada)

Ao reimportar o mesmo arquivo, o motor classifica cada item:

| Status | Significado |
|--------|-------------|
| `new_item` | Não existe no store simulado |
| `already_imported` | Mesmo fingerprint — idempotente |
| `exact_duplicate` | Mesmo `rawHash` ou `externalRef` |
| `probable_duplicate` | Mesmos metadados, hash/ref diferentes |
| `changed_source` | Mesma ref, hash diferente |
| `user_edited_conflict` | Usuário editou campos bloqueados |
| `safe_update` | Atualização segura (futuro RTDB) |
| `manual_review_required` | Requer decisão humana |

> **Nota:** Simulação em memória apenas. Nada é gravado até Fase 1.

---

## Parcelamentos — `kind` (Fase 0.3.4)

| `kind` | Descrição |
|--------|-----------|
| `invoice_installment` | Parcelamento de fatura (obrigação financeira); `subtype = invoice_installment` |
| `purchase_installment` | Parcelamento de compra no cartão |
| `unknown` | Não classificado automaticamente |

Parcelamento de fatura **não** exige revisão crítica quando campos mínimos estão presentes.

---

## Preservação de edições manuais (modelo futuro)

Campos preparados em `importMetadata` (RTDB Fase 1):

| Campo | Uso |
|-------|-----|
| `importedFields` | Valores vindos do JSON |
| `userFields` | Valores editados pelo usuário |
| `userEdited` | Flag de edição manual |
| `lockedFields` | Campos que importação não pode sobrescrever |
| `lastImportBatchId` | Último lote de importação |
| `firstImportedAt` / `lastImportedAt` | Rastreabilidade temporal |

Regra: se o usuário editou categoria, tipo, competência, recorrência ou observação, nova importação **não** sobrescreve sem revisão.

---

## Regras pessoais de classificação (Fase 0.3.5)

Arquivo local (gitignored): `src/config/classification-rules.local.js`  
Exemplo versionado: `src/config/classification-rules.example.js`

### Schema conceitual de regra

| Campo | Descrição |
|-------|-----------|
| `id`, `label`, `enabled`, `priority` | Identificação e ordem |
| `match.*` | Critérios: descrição, type, flow, valor, faixa, mês, Pix/TED |
| `classification.*` | type, flow, categoryLabel, recurring, installmentKind, autoResolve, reviewPriority |

### Persistência futura (Fase 1/2)

```text
/users/{uid}/classificationRules/{ruleId}
/users/{uid}/categoryRules/{ruleId}
/users/{uid}/merchantAliases/{aliasId}
/users/{uid}/importPreferences
```
