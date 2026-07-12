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

const bmiTransactions = [
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
  {
    id: "tx-moto",
    kind: "expense",
    description: "Auto Pan",
    amountCents: 45000,
    date: "2026-07-05",
    competenceMonth: "2026-07",
    category: "Transporte",
    status: "settled",
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
];

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

const invoice = {
  id: "inv-1",
  cardId: "card-1",
  competenceMonth: "2026-07",
  amountCents: 9990,
  dueDate: "2026-07-20",
  status: "open",
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const invoiceLine = {
  id: "tx-card-bmi",
  kind: "expense",
  description: SOURCE,
  amountCents: 9990,
  date: "2026-07-08",
  competenceMonth: "2026-07",
  category: "Casa",
  status: "pending",
  ledgerStatus: "in_invoice",
  cardId: "card-1",
  invoiceId: "inv-1",
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const base = {
  schemaVersion: "cfm.local.v2",
  selectedCompetenceMonth: "2026-07",
  cards: [card],
  invoices: [invoice],
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
  ],
  recurringMatches: [],
  ignoredRecurringSuggestions: [],
  transactionDescriptionAliases: aliases,
};

const files = {
  "storage-lancamentos-alias.json": wrap({
    ...base,
    transactions: [...bmiTransactions, invoiceLine],
  }),
  "storage-dashboard-alias.json": wrap({
    ...base,
    transactions: [...bmiTransactions, invoiceLine],
  }),
  "storage-faturas-alias.json": wrap({
    ...base,
    transactions: [invoiceLine, ...bmiTransactions.filter((item) => item.id !== "tx-card-bmi")],
  }),
  "storage-planejamento-consolidado.json": wrap({
    ...base,
    transactions: [
      ...bmiTransactions,
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
    ],
  }),
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(content, null, 2));
  console.log(`wrote ${name}`);
}
