const fs = require("node:fs");
const path = require("node:path");

const TIMESTAMP = "2026-07-01T00:00:00.000Z";
const outDir = __dirname;

function wrap(appData) {
  return {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:5173",
        localStorage: [{ name: "cfm:v2:appData", value: JSON.stringify(appData) }],
      },
    ],
  };
}

const card = {
  id: "card-1",
  name: "Nubank",
  closingDay: 25,
  dueDay: 3,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const gymTx = [
  {
    id: "tx-gym-6",
    kind: "expense",
    description: "Academia",
    amountCents: 9900,
    date: "2026-06-20",
    competenceMonth: "2026-06",
    category: "Saúde",
    status: "settled",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  },
  {
    id: "tx-gym-7",
    kind: "expense",
    description: "Academia",
    amountCents: 9900,
    date: "2026-07-20",
    competenceMonth: "2026-07",
    category: "Saúde",
    status: "settled",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  },
];

const streamingTx = [
  {
    id: "tx-stream-6",
    kind: "expense",
    description: "Streaming",
    amountCents: 4990,
    date: "2026-06-12",
    competenceMonth: "2026-06",
    category: "Lazer",
    status: "settled",
    ledgerStatus: "in_invoice",
    cardId: "card-1",
    invoiceId: "inv-6",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  },
  {
    id: "tx-stream-7",
    kind: "expense",
    description: "Streaming",
    amountCents: 4990,
    date: "2026-07-12",
    competenceMonth: "2026-07",
    category: "Lazer",
    status: "settled",
    ledgerStatus: "in_invoice",
    cardId: "card-1",
    invoiceId: "inv-7",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  },
];

const fixtures = {
  "storage-subscription.json": {
    schemaVersion: "cfm.local.v2",
    selectedCompetenceMonth: "2026-07",
    transactions: streamingTx,
    cards: [card],
    invoices: [],
    recurringRules: [
      {
        id: "rule-stream",
        kind: "expense",
        description: "Streaming",
        amountCents: 4990,
        category: "Lazer",
        dayOfMonth: 12,
        startMonth: "2026-06",
        status: "active",
        billingMode: "card",
        cardId: "card-1",
        recurrenceClass: "card_subscription",
        renewalPolicy: "manual_annual",
        renewedThroughMonth: "2027-05",
        seriesId: "rule-stream",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    recurringMatches: [
      {
        id: "recurring-match:rule-stream:2026-06",
        ruleId: "rule-stream",
        competenceMonth: "2026-06",
        transactionId: "tx-stream-6",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
      {
        id: "recurring-match:rule-stream:2026-07",
        ruleId: "rule-stream",
        competenceMonth: "2026-07",
        transactionId: "tx-stream-7",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    ignoredRecurringSuggestions: [],
  },
  "storage-subscription-renewal.json": {
    schemaVersion: "cfm.local.v2",
    selectedCompetenceMonth: "2026-08",
    transactions: streamingTx,
    cards: [card],
    invoices: [],
    recurringRules: [
      {
        id: "rule-stream",
        kind: "expense",
        description: "Streaming",
        amountCents: 4990,
        category: "Lazer",
        dayOfMonth: 12,
        startMonth: "2026-06",
        status: "active",
        billingMode: "card",
        cardId: "card-1",
        recurrenceClass: "card_subscription",
        renewalPolicy: "manual_annual",
        renewedThroughMonth: "2026-06",
        seriesId: "rule-stream",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    recurringMatches: [],
    ignoredRecurringSuggestions: [],
  },
  "storage-fixed-bill-versions.json": {
    schemaVersion: "cfm.local.v2",
    selectedCompetenceMonth: "2026-09",
    transactions: gymTx,
    cards: [card],
    invoices: [],
    recurringRules: [
      {
        id: "rule-gym-v1",
        kind: "expense",
        description: "Academia",
        amountCents: 9900,
        category: "Saúde",
        dayOfMonth: 20,
        startMonth: "2026-06",
        endMonth: "2026-07",
        status: "active",
        billingMode: "direct",
        recurrenceClass: "fixed_bill",
        renewalPolicy: "none",
        seriesId: "series-gym",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
      {
        id: "rule-gym-v2",
        kind: "expense",
        description: "Academia",
        amountCents: 11900,
        category: "Saúde",
        dayOfMonth: 20,
        startMonth: "2026-08",
        status: "active",
        billingMode: "direct",
        recurrenceClass: "fixed_bill",
        renewalPolicy: "none",
        seriesId: "series-gym",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    recurringMatches: [],
    ignoredRecurringSuggestions: [],
  },
  "storage-lancamentos-recurring.json": {
    schemaVersion: "cfm.local.v2",
    selectedCompetenceMonth: "2026-07",
    transactions: [
      ...gymTx,
      {
        id: "tx-income",
        kind: "income",
        description: "Salário",
        amountCents: 850000,
        date: "2026-07-05",
        competenceMonth: "2026-07",
        category: "Trabalho",
        status: "settled",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    cards: [card],
    invoices: [],
    recurringRules: [
      {
        id: "rule-gym",
        kind: "expense",
        description: "Academia",
        amountCents: 9900,
        category: "Saúde",
        dayOfMonth: 20,
        startMonth: "2026-06",
        status: "active",
        billingMode: "direct",
        recurrenceClass: "fixed_bill",
        renewalPolicy: "none",
        seriesId: "rule-gym",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    recurringMatches: [
      {
        id: "recurring-match:rule-gym:2026-07",
        ruleId: "rule-gym",
        competenceMonth: "2026-07",
        transactionId: "tx-gym-7",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    ignoredRecurringSuggestions: [],
  },
};

for (const [name, data] of Object.entries(fixtures)) {
  fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(wrap(data), null, 2)}\n`);
  console.log(`wrote ${name}`);
}
