# Modelo de Dados — Firebase Realtime Database

## Objetivo

Organizar dados financeiros **por usuário autenticado**, evitando leituras amplas na raiz. Cada consulta deve ser escopada a `users/{uid}/...`.

> **Nota:** Este modelo é conceitual. Persistência será implementada na Fase 1. Regras em `database.rules.json` são rascunho.

---

## Raiz

```text
/users/{uid}/
```

Nenhum dado na raiz fora de `users`. Leitura/escrita exige `auth.uid == $uid`.

---

## Estrutura proposta

```text
users/
  {uid}/
    profile/
      displayName: string
      email: string          # espelho do Auth, não fonte de verdade
      currency: "BRL"
      createdAt: ISO8601
      updatedAt: ISO8601

    months/
      {YYYY-MM}/              # ex: 2025-06
        summary/
          totalInCents: number
          totalOutCents: number
          balanceCents: number
          updatedAt: ISO8601
        transactionIds/
          {txId}: true        # índice para listagem do mês

    accounts/
      {accountId}/
        name: string
        type: checking|savings|investment
        institution: string
        lastFour: string       # apenas 4 dígitos
        currency: "BRL"
        isActive: boolean
        createdAt: ISO8601

    cards/
      {cardId}/
        name: string
        brand: visa|mastercard|elo|other
        lastFour: string
        closingDay: 1-28
        dueDay: 1-28
        limitCents: number          # cadastro — snapshot pode ser mais atual
        accountId: string|null
        isActive: boolean

    cardSnapshots/                   # Fase 0.3.6 / RTDB Fase 1
      {snapshotId}/
        cardExternalRef: string
        snapshotMonth: YYYY-MM
        snapshotDate: YYYY-MM-DD
        limitCents: number
        usedCents: number
        availableCents: number
        source: string
        confidence: high|medium|low

    invoices/
      {invoiceId}/
        cardId: string
        competenceMonth: YYYY-MM
        dueDate: YYYY-MM-DD
        totalCents: number
        status: open|closed|paid

    transactions/
      {txId}/
        accountId: string|null
        cardId: string|null
        description: string
        category: string
        competenceMonth: YYYY-MM    # obrigatório — chave de agrupamento
        date: YYYY-MM-DD
        amountCents: number         # sempre positivo
        flow: in|out|neutral
        installmentPlanId: string|null
        recurringRuleId: string|null
        importId: string|null
        createdAt: ISO8601

    installmentPlans/
      {planId}/
        cardId: string
        description: string
        totalInstallments: number
        currentInstallment: number
        installmentAmountCents: number
        startCompetenceMonth: YYYY-MM
        flow: out

    recurringRules/
      {ruleId}/
        description: string
        accountId: string
        amountCents: number
        flow: out
        frequency: monthly|weekly|yearly
        dayOfMonth: number|null
        category: string
        isActive: boolean

    imports/
      {importId}/
        schemaVersion: cfm.import.v1
        sourceLabel: string
        rawHash: string|null
        externalRef: string|null
        importedAt: ISO8601
        transactionCount: number
        status: pending|applied|failed
```

---

## Estratégias de leitura

| Caso de uso | Path | Evita |
|-------------|------|-------|
| Dashboard do mês | `users/{uid}/months/{YYYY-MM}/summary` | Scan de todas transações |
| Lista do mês | `months/{YYYY-MM}/transactionIds` + fetch pontual | `.value` na raiz |
| Contas | `users/{uid}/accounts` | Dados de outros uids |
| Cartão + faturas | `cards/{id}` + query `invoices` por `cardId` | Leitura global |

---

## Índices e queries (futuro)

Para listar transações por mês sem scan:

1. Gravar índice em `months/{YYYY-MM}/transactionIds/{txId}`.
2. Opcional: `orderByChild('competenceMonth')` em nó dedicado se volume crescer.

---

## Sincronia com importação JSON

Import `cfm.import.v1` mapeia 1:1 para nós acima. Após validação:

1. Upsert `accounts`, `cards`
2. Criar `transactions` com `importId` e `canonicalFingerprint`
3. Atualizar `months/{competenceMonth}/summary` (transação ou Cloud Function futura)
4. Registrar em `imports/{importId}`

### Idempotência na persistência (Fase 1+)

- Chave de deduplicação: `canonicalFingerprint` (ver `SCHEMA_IMPORTACAO_JSON.md`)
- Reimportação do mesmo mês: upsert por fingerprint, não insert cego
- Mesmo `rawHash`/`externalRef` → `exact_duplicate`, ignorar ou marcar conflito
- Campos com `userEdited: true` em `lockedFields` → exigir revisão antes de sobrescrever

### Metadados de importação por transação (Fase 1+)

```text
transactions/{txId}/
  ...campos financeiros...
  canonicalFingerprint: string
  importMetadata/
    importedFields: { category, type, competenceMonth, ... }
    userFields:       { ... }          # preenchido após edição manual
    userEdited:       boolean
    lockedFields:     string[]         # ex: category, type, notes
    lastImportBatchId: string
    firstImportedAt:  ISO8601
    lastImportedAt:   ISO8601
```

### Regras pessoais de classificação (Fase 1+)

```text
users/{uid}/classificationRules/{ruleId}/
  id, label, enabled, priority, match, classification, updatedAt

users/{uid}/categoryRules/{ruleId}/
  categoryId, categoryLabel, patterns[]

users/{uid}/merchantAliases/{aliasId}/
  normalizedPattern, displayLabel, defaultCategory

users/{uid}/importPreferences/
  autoResolveEnabled, pixSentAsExpense, salaryAmountRangeCents, ...
```

---

## Dados proibidos no RTDB

- CPF/CNPJ completo
- Número completo de cartão, conta ou agência
- Linha digitável, código de barras, QR Code
- Endereço residencial completo
- Senhas, tokens de terceiros

Use apenas `lastFour`, hashes (`rawHash`) e referências externas opacas.

---

## Regras de segurança

Ver `database.rules.json` e [APPSEC.md](APPSEC.md). Refinamento planejado:

- `.validate` em campos críticos (`amountCents > 0`, `flow` enum)
- Impedir escrita em nós de outro uid
- Rate limiting via Cloud Functions (fase posterior, se necessário)
