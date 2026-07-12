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
  name: "Nubank",
  closingDay: 25,
  dueDay: 3,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const baseTransactions = [
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
  {
    id: "tx-internet-6",
    kind: "expense",
    description: "Internet fibra",
    amountCents: 13990,
    date: "2026-06-10",
    competenceMonth: "2026-06",
    category: "Casa",
    status: "settled",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  },
  {
    id: "tx-internet-7",
    kind: "expense",
    description: "Internet fibra",
    amountCents: 13990,
    date: "2026-07-10",
    competenceMonth: "2026-07",
    category: "Casa",
    status: "settled",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  },
];

const suggestionsData = {
  schemaVersion: "cfm.local.v2",
  selectedCompetenceMonth: "2026-07",
  transactions: baseTransactions,
  cards: [card],
  invoices: [],
  recurringRules: [],
  recurringMatches: [],
  ignoredRecurringSuggestions: [],
};

const confirmedData = {
  ...suggestionsData,
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
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
  ],
};

const ignoredData = {
  ...suggestionsData,
  ignoredRecurringSuggestions: [
    {
      signature:
        "recurring-suggestion:expense:direct::13990:internet fibra",
      evidenceFingerprint: "2026-06,2026-07|tx-internet-6,tx-internet-7",
      ignoredAt: TIMESTAMP,
    },
  ],
};

const rulesData = {
  ...suggestionsData,
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
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
    {
      id: "rule-salary",
      kind: "income",
      description: "Salário previsto",
      amountCents: 850000,
      category: "Trabalho",
      dayOfMonth: 5,
      startMonth: "2026-07",
      status: "active",
      billingMode: "direct",
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
  ],
};

for (const [name, data] of [
  ["storage-suggestions.json", suggestionsData],
  ["storage-confirmed.json", confirmedData],
  ["storage-ignored.json", ignoredData],
  ["storage-rules.json", rulesData],
]) {
  fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(wrap(data), null, 2)}\n`);
  console.log(`wrote ${name}`);
}
