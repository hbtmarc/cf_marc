const fs = require("node:fs");
const path = require("node:path");

const TIMESTAMP = "2026-07-01T00:00:00.000Z";
const outDir = __dirname;
const SOURCE = "BMI Serviços Digitais";

function wrap(appData) {
  return {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:5173",
        localStorage: [
          {
            name: "cfm:v2:appData",
            value: JSON.stringify(appData),
          },
        ],
      },
    ],
  };
}

const card = {
  id: "card-1",
  name: "Cartão Demo",
  closingDay: 10,
  dueDay: 20,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const aliases = [
  {
    id: "txn-desc-alias:bmi serviços digitais",
    sourceDescriptionNormalized: "bmi serviços digitais",
    sourceDescriptionSample: SOURCE,
    displayName: "Internet",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  },
  {
    id: "txn-desc-alias:auto pan",
    sourceDescriptionNormalized: "auto pan",
    sourceDescriptionSample: "Auto Pan",
    displayName: "Moto",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  },
];

const base = {
  schemaVersion: "cfm.local.v2",
  selectedCompetenceMonth: "2026-07",
  cards: [card],
  invoices: [],
  recurringRules: [
    {
      id: "rule-internet",
      kind: "expense",
      description: "Internet",
      amountCents: 9990,
      category: "Casa",
      dayOfMonth: 10,
      startMonth: "2026-06",
      status: "active",
      billingMode: "direct",
      recurrenceClass: "fixed_bill",
      seriesId: "rule-internet",
      renewalPolicy: "none",
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
    {
      id: "rule-salary",
      kind: "income",
      description: "Salário demo",
      amountCents: 500000,
      category: "Trabalho",
      dayOfMonth: 5,
      startMonth: "2026-07",
      status: "active",
      billingMode: "direct",
      recurrenceClass: "income",
      seriesId: "rule-salary",
      renewalPolicy: "none",
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
    {
      id: "rule-streaming",
      kind: "expense",
      description: "Streaming",
      amountCents: 4990,
      category: "Lazer",
      dayOfMonth: 15,
      startMonth: "2026-07",
      status: "active",
      billingMode: "card",
      cardId: "card-1",
      recurrenceClass: "card_subscription",
      seriesId: "rule-streaming",
      renewalPolicy: "manual_annual",
      renewedThroughMonth: "2027-06",
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
  ],
  recurringMatches: [],
  ignoredRecurringSuggestions: [],
  transactionDescriptionAliases: aliases,
};

const files = {
  "storage-planejamento-fixas.json": wrap({
    ...base,
    transactions: [
      {
        id: "tx-bmi-6",
        kind: "expense",
        description: SOURCE,
        amountCents: 9990,
        date: "2026-06-10",
        competenceMonth: "2026-06",
        category: "Casa",
        status: "settled",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
      {
        id: "tx-bmi-7",
        kind: "expense",
        description: SOURCE,
        amountCents: 9990,
        date: "2026-07-10",
        competenceMonth: "2026-07",
        category: "Casa",
        status: "settled",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
  }),
  "storage-lancamentos-projetado.json": wrap({
    ...base,
    invoices: [
      {
        id: "inv-moto",
        cardId: "card-1",
        competenceMonth: "2026-06",
        amountCents: 45000,
        dueDate: "2026-06-20",
        status: "paid",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    transactions: [
      {
        id: "tx-moto",
        kind: "expense",
        description: "Auto Pan",
        amountCents: 45000,
        date: "2026-06-05",
        competenceMonth: "2026-06",
        category: "Transporte",
        status: "settled",
        ledgerStatus: "in_invoice",
        cardId: "card-1",
        invoiceId: "inv-moto",
        installment: { current: 3, total: 6 },
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
      {
        id: "tx-income",
        kind: "income",
        description: "Salário demo",
        amountCents: 500000,
        date: "2026-07-05",
        competenceMonth: "2026-07",
        category: "Trabalho",
        status: "settled",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
  }),
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(content, null, 2));
  console.log(`wrote ${name}`);
}
