# Status do Projeto

**Projeto:** Controle Financeiro Mensal (CFM)  
**Última atualização:** 12 de julho de 2026  
**Etapa atual:** Etapa 11 concluída — Firebase real, autenticação e sincronização  
**Próximo marco:** a definir (fora do escopo desta entrega)

---

## Etapa 11 — concluída

### Objetivo

Concluir a infraestrutura na nuvem com o projeto Firebase real `cfmarc-marc35`: configuração versionada no cliente, Security Rules publicadas (substituindo regras públicas), Authentication Google via CLI, envelope com `updatedAt` numérico, testes ampliados e deploy de `database` + `auth`.

### Preservado da Etapa 10

Arquitetura de sync (`data-store`, `cloud-sync`, `cloud-envelope`), auth gate, modal de migração, estados de sincronização, tela de login, logout em Ajustes, GitHub Pages, debounce 600 ms e cache local — ajustados, não recriados.

### Lacunas corrigidas

| Item | Correção |
|------|----------|
| Config Firebase | Hardcoded em `firebase-config.ts` (público); removidos secrets do workflow |
| Security Rules | `.read`/`.write` somente em `finance`; `updatedAt` numérico; **deploy real** |
| Regras públicas | Substituídas em `cfmarc-marc35-default-rtdb` |
| Auth | Google habilitado via `firebase deploy --only auth`; domínios `localhost`, `hbtmarc.github.io` |
| Login | Popup + redirect fallback; `browserLocalPersistence`; `getRedirectResult` no bootstrap |
| Envelope | `updatedAt: number` (epoch ms) |
| Remoto inválido | `RemoteFinanceInvalidError`; cache local preservado |
| Testes | 354 unitários + 14 rules (`src/firebase-rules.test.ts`) + 6 auth |

### Deploy Firebase (autorizado)

- `firebase deploy --only database --project cfmarc-marc35` — **sucesso**
- `firebase deploy --only auth --project cfmarc-marc35` — **sucesso** (Google Sign-In habilitado)

### Comandos NPM

`firebase:login`, `firebase:projects`, `firebase:emulators`, `firebase:test-rules`, `firebase:deploy-database`, `firebase:deploy-auth`

### Evidências

`docs/screenshots-etapa11/` — login, migração, dashboard autenticado, sync, logout. Captura `emulator-rules.png` requer JDK 21+ local (`npm run firebase:emulators` → UI em `:4000`).

---

## Etapa 10 — concluída

### Objetivo

Publicar o MVP na nuvem com autenticação Google, persistência no Firebase Realtime Database, Security Rules, cache local como contingência, migração segura dos dados do dispositivo e deploy estático no GitHub Pages — sem novas funcionalidades financeiras nem redesenho de telas.

### Arquitetura

| Camada | Responsabilidade |
|--------|------------------|
| `auth-service.ts` / `auth-screen.ts` | Login Google, logout, tela de acesso |
| `firebase.ts` / `firebase-config.ts` | Init SDK modular; emuladores quando `VITE_USE_FIREBASE_EMULATORS=true` |
| `cloud-envelope.ts` | Envelope `cfm.cloud.v1` em `users/{uid}/finance` |
| `cloud-sync.ts` | Leitura/escrita RTDB |
| `data-store.ts` | Bootstrap, migração, debounce 600 ms, estados de sync |
| `storage.ts` | Cache `cfm:v2:appData`; `isAppDataEmpty`, `normalizeAppData` exportados |
| `app.ts` | Auth gate; app inacessível até auth + bootstrap; modal de migração |

### RTDB

```text
users/{uid}/finance → { schemaVersion, updatedAt, data: AppData }
```

### Migração

- **Remoto com dados:** carrega remoto; não sobrescreve com local.
- **Remoto vazio + local com dados:** modal “Levar dados deste dispositivo para a nuvem”; cancelável.
- **Ambos vazios:** estado vazio; grava após primeira alteração útil.

### Estados de sincronização

`Conectando…` · `Sincronizando…` · `Salvo na nuvem` · `Offline — salvo neste dispositivo` · `Erro ao sincronizar` (+ retry). `role="status"`, `aria-live="polite"`.

### Security Rules

`database.rules.json` — deny por padrão; acesso somente ao próprio `uid`; validação do envelope. Testes: `npm run test:rules` (8 cenários; requer Java + Emulator Suite).

### GitHub Pages

Workflow `.github/workflows/deploy.yml` — typecheck, testes, build com secrets `VITE_FIREBASE_*`, deploy Pages. Base `/cf_marc/`, hash routing preservado.

### Limitações mantidas

Sem colaboração em tempo real, merge campo a campo, App Check, Firebase Hosting, novas fórmulas financeiras ou reskin. Edições simultâneas em dois dispositivos: gravação mais recente prevalece.

### Testes

346 testes unitários (`npm test`) + 8 testes de rules (`npm run test:rules`, quando Java/emulador disponíveis). `npm run typecheck` e `npm run build` validados.

### Evidências visuais

`docs/screenshots-etapa10/` — login desktop/mobile, modal de migração, app sincronizado, offline, erro com retry, logout, dashboard 1440/390, refresh em rota interna no build de produção.

---

## Etapa 9 — concluída

### Objetivo

Página `#/balanco` para visualizar a situação atual da competência, registrar uma fotografia financeira persistida e consultar histórico de balanços. O usuário não digita valores — apenas confere, opcionalmente observa e registra ou atualiza.

### Modelo persistido

Coleção retrocompatível `monthlyBalances?: MonthlyBalance[]` em `AppData`:

| Campo | Função |
|-------|--------|
| `id` | Determinístico: `monthly-balance:<competenceMonth>` |
| `competenceMonth` | Competência única por registro |
| `incomeCents` / `expenseCents` / `balanceCents` / `projectedBalanceCents` | Fotografia dos quatro KPIs |
| `fixedBillsCents` / `invoicesCents` | Subtotais registrados |
| `note?` | Observação opcional |
| `createdAt` / `updatedAt` | Registro e última atualização |

Um único balanço por competência. Projetos antigos carregam com `monthlyBalances: []`.

### Origem dos cálculos

Valores atuais e da fotografia calculados por `buildMonthlyBalanceSnapshot()`:

- **Quatro KPIs:** exclusivamente `calculateCompetenceSummary()` (`incomeSettledCents`, `expensePaidCents`, `balanceRealizedCents`, `balancePlannedCents`).
- **Fixas:** `buildDashboardFixedBills().subtotalCents` (mesma regra do Dashboard).
- **Faturas:** `buildDashboardInvoicesSubtotalCents()` (soma de `totalCents` por cartão, fatura real prevalece sobre projeção).

Sem recálculo em apresentação, página ou storage.

### Semântica de fotografia financeira

Ao registrar, os valores são copiados para `MonthlyBalance` — não há referência mutável ao resumo. Alterações posteriores em transações, faturas ou recorrências não mudam o balanço registrado; a seção **Situação atual** continua refletindo os valores vivos.

### Comportamento de atualização

**Atualizar balanço** substitui os valores da mesma competência, preserva `id` e `createdAt`, atualiza `updatedAt` e não cria duplicata. Sem versionamento nem histórico de revisões no mesmo mês.

### Estrutura visual

Coluna única: Situação atual (4 KPIs), Subtotais (Fixas e Faturas), Balanço da competência (não registrado ou registrado), Histórico de balanços. Modais via `openModal` para registrar e atualizar.

### Limitações intencionais

Sem orçamento, metas, gráficos, comparação entre meses, fechamento contábil, bloqueio de competência, exclusão de balanço, exportação/PDF, Firebase, autenticação ou sincronização.

### Testes

336 testes passando (`monthly-balance.test.ts`, `balanco.test.ts` e suíte existente intacta).

### Evidências visuais

`docs/screenshots-etapa9/` — `balanco-empty-1440.png`, `balanco-registered-1440.png`, `balanco-modal-1440.png`, `balanco-history-1440.png`, `balanco-registered-390.png`, `balanco-modal-390.png`.

---

## Etapa 8 — concluída

### Estrutura final do Dashboard

A página `#/dashboard` contém somente:

1. Cabeçalho da página e seletor de competência (shell global).
2. **Situação financeira** — quatro KPIs em uma única superfície (`dashboard-kpi-grid`).
3. **Despesas fixas** — lista compacta com subtotal e link para Planejamento.
4. **Faturas** — lista compacta por cartão com ação **Ver fatura**.

Removidos da composição (não apenas ocultos): Ritmo do mês, Recorrências do mês, Cartões e faturas antigo, Parcelas projetadas, Transações recentes, Fechamento projetado lateral, Compromissos e atenção, coluna lateral, Novo lançamento, Revisar faturas e Ver lançamentos.

### Origem oficial dos quatro KPIs

Todos os valores vêm exclusivamente de `calculateCompetenceSummary()` em `finance.ts`, renderizados por `renderDashboardSituationPanel()` sem recálculo em `presentation.ts`, `dashboard.ts` ou CSS:

| KPI | Campo |
|-----|-------|
| Receitas | `summary.incomeSettledCents` |
| Despesas | `summary.expensePaidCents` |
| Saldo | `summary.balanceRealizedCents` |
| Saldo projetado | `summary.balancePlannedCents` |

### Regra de subtotal das fixas

`buildDashboardFixedBills()` em `dashboard-executive.ts` lista somente ocorrências com `recurrenceClass === "fixed_bill"` na competência selecionada. Cada fixa entra uma vez: conciliada usa o valor real da transação; prevista usa o valor esperado da regra. O subtotal é a soma das linhas exibidas, sem somar projeção e transação conciliada simultaneamente.

### Regra e ordenação das faturas

`buildDashboardCardSummary()` reutiliza os motores existentes de fatura, parcelas e recorrência em cartão. Fatura real prevalece sobre projeção para o mesmo cartão. Ordenação (`sortDashboardInvoiceLines`): vencidas → abertas/parciais → projetadas → pagas → credoras/sem débito; dentro do grupo, vencimento crescente (ausentes por último). Ação **Ver fatura** define `expandedInvoiceId` e navega para `#/faturas`.

### Confirmação de ausência de dupla contagem

Fixas conciliadas substituem a projeção na lista e no subtotal. Faturas reais substituem projeções de cartão. `calculateCompetenceSummary` permanece como única fonte dos KPIs; `presentation.ts` não soma valores financeiros.

### Limitações reais para a Etapa 9

- Sem persistência remota, autenticação ou sincronização Firebase.
- Sem página de Balanço Mensal dedicada.
- Projeção de fatura sem invoice persistida exibe status PROJETADA, sem criar entidade `Invoice`.
- Dashboard não lista transações individuais nem gráficos analíticos.

### Evidências visuais

Capturas em `docs/screenshots-etapa8-final/` (`dashboard-final-1440.png`, `dashboard-final-390.png`, `dashboard-final-empty-1440.png`).

---

## Etapa 8.4.3.1 — modais, aliases em projeções e nomenclatura Fixas

### Política global de formulários temporários

Toda ação acionada por botão ou menu que abre um **formulário temporário** usa o modal do projeto (`openModal` / `openConfirmModal`). Exceções mantidas fora de modal: busca e filtros, complementação da revisão de importação, conteúdo permanente das páginas, tabelas/painéis de detalhe sem edição e seleção inline de candidatos de conciliação.

No **Planejamento**, os fluxos **Nova regra**, **Editar** (fixa / receita prevista / assinatura), **Atualizar valor** e demais formulários temporários abrem em modal. O formulário inline abaixo das regras foi removido.

Requisitos do modal: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, fundo inerte, foco inicial interno, Tab contido, Escape e botão de fechar, Cancelar, retorno de foco ao acionador, `body.modal-open`, erros por campo, Enter não salva inválido, anúncios via `aria-live`.

### Taxonomia de produto (UI)

| `recurrenceClass` | Singular | Plural (grupos) |
|-------------------|----------|-----------------|
| `income` | Receita prevista | Receitas previstas |
| `fixed_bill` | Fixa | Fixas |
| `card_subscription` | Assinatura | Assinaturas |
| `other` | Outra previsão | Outras |

Nomes técnicos internos (`RecurringRule`, `fixed_bill`, `recurrenceClass`, módulos) permanecem inalterados. Ícone de ciclo com `sr-only` contextual: “Lançamento de fixa”, “Lançamento de assinatura”, “Lançamento de receita prevista” ou fallback “Lançamento recorrente”.

### Modal Atualizar valor

Substitui `window.prompt`. Campos: valor atual (somente leitura), novo valor, competência de início (default = competência selecionada). Texto: “O valor anterior será preservado até a competência anterior.” Persistência via `updateRecurringRuleAmountFromMonth` (histórico, `seriesId`, matches e versionamento preservados).

### Aliases em projeções

`projectedInstallmentDisplayDescription` e `projectedInstallmentSearchHaystack` resolvem o nome exibido pela transação fonte (`sourceTransactionId`) ou descrição normalizada, sem alterar a origem persistida, IDs, fingerprints ou agrupamento técnico.

Abrangência: parcelas projetadas em Lançamentos (tabela principal e detalhe de fatura/cartão), busca e ordenação de linhas projetadas, ocorrências derivadas no Planejamento (via `transactionDisplayDescriptionForSource` na descrição da regra quando aplicável). Dashboard agregado por cartão não lista descrições individuais de parcelas; transações recentes já usavam alias desde 8.4.3.

### Garantias de não regressão

Sem alteração em: `calculateCompetenceSummary`, `balanceRealizedCents`, `balancePlannedCents`, precedência `matched` / `covered_by_invoice` / `projected`, supressão por fatura real, idempotência de importação, reconciliação, geração de parcelas, renovação anual, versionamento de valor, `cfm.import.v1`, fingerprints ou descrição original das transações.

### Ausência de dialogs nativos

Não há uso em produção (`src/`) de `window.prompt`, `window.confirm`, `window.alert`, `prompt`, `confirm` ou `alert`. Confirmações destrutivas usam `openConfirmModal`.

### Limitações remanescentes

- Regras cadastradas manualmente com descrição própria não são renomeadas automaticamente por alias (comportamento intencional).
- Painel “Parcelas projetadas” do Dashboard continua agregando por cartão, sem listar descrições linha a linha.
- Título `title` em células com alias ainda expõe a descrição original para consulta rápida.

### Evidências visuais

Capturas em `docs/screenshots-etapa8.4.3.1/` (Planejamento Fixas/modais 1440 e 390 px; Lançamentos com parcela projetada e alias Moto).

---

## Etapa 8.4.3 — aliases globais e consolidação visual do Planejamento

### Causa da ausência anterior

Não existia camada persistida entre a descrição importada (`transaction.description`) e a apresentação nas telas. O único caminho era editar cada lançamento individualmente, o que alterava o dado de origem e quebrava idempotência, fingerprints e detecção de recorrências.

### Modelo `TransactionDescriptionAlias`

| Campo | Função |
|-------|--------|
| `id` | Determinístico: `txn-desc-alias:{descrição normalizada}` |
| `sourceDescriptionNormalized` | Chave de agrupamento (mesma política de `normalizeInstallmentDescription`) |
| `sourceDescriptionSample` | Amostra legível da origem |
| `displayName` | Nome amigável escolhido pelo usuário |
| `createdAt` / `updatedAt` | Auditoria local |

Coleção em `AppData.transactionDescriptionAliases` (padrão `[]` em projetos antigos).

### Fonte de verdade

- `transaction.description` permanece **sempre** a descrição original.
- Aliases **não** alteram fingerprint, ID, valor, categoria, parcela, cartão, fatura, status, idempotência nem matemática financeira.
- Helper central: `transactionDisplayDescription(data, transaction)` — retorna `displayName` se houver alias, senão a descrição original.

### Comportamento na importação

- `applyImportPlan` preserva `transactionDescriptionAliases` (como regras, matches e sugestões ignoradas).
- Contrato `cfm.import.v1` **não** foi alterado; aliases não entram no JSON importado.
- Reimportação do mesmo arquivo mantém idempotência e continua exibindo o alias.

### Abrangência da máscara

Lançamentos (receitas, despesas, detalhes de fatura), Faturas, Dashboard (transações recentes), busca (alias **e** original), ordenação por descrição (nome exibido), Planejamento (sugestões, candidatos de conciliação). Sugestões e conciliação técnica continuam baseadas na descrição original; ao confirmar sugestão, o alias vira descrição inicial da regra. Regras manuais não são sobrescritas.

### Como criar, alterar e remover

Em **Lançamentos**, menu `...` de qualquer transação real → **Renomear exibição** → modal do projeto com descrição original (somente leitura), campo **Nome exibido**, **Salvar nome**, **Cancelar** e **Restaurar nome original** (quando já existir alias).

### Garantia de não impacto financeiro

Aliases são somente camada de apresentação persistida localmente. Não entram em `calculateCompetenceSummary`, projeções, matches, faturas reais nem importação.

### Estrutura visual final do Planejamento

1. Cabeçalho global (título, descrição, competência) + **Nova regra** secundária no `page-header`
2. Resumo compacto da competência (grid denso)
3. Sugestões agrupadas por classificação (linhas compactas, controle segmentado)
4. Ocorrências do mês (tabela desktop / lista responsiva mobile)
5. Regras mensais agrupadas: Receitas previstas, Fixas, Assinaturas, Outras (quando existirem)

### Limitações conhecidas (histórico 8.4.3)

- ~~**Atualizar valor** em Planejamento ainda usa `window.prompt`~~ — resolvido na 8.4.3.1.
- ~~Aliases não se aplicam a parcelas projetadas~~ — resolvido na 8.4.3.1.
- Título `title` em células com alias ainda expõe a descrição original (comportamento intencional para consulta rápida).
- Regras manuais com descrição própria não são sobrescritas por alias.

---

## Etapa 8.4.2 — automatizar e consolidar Planejamento

### Objetivo

Tornar a página Planejamento prioritariamente automática: sugestões derivadas dos lançamentos persistidos, confirmação explícita para criar regras, cadastro manual como exceção, sem impacto financeiro até a confirmação.

### Regra de detecção de sugestões

Uma sugestão candidata agrupa transações que compartilham **todos** os critérios:

1. mesma descrição normalizada (`trim` → minúsculas → espaços colapsados);
2. mesmo `kind` (`income` ou `expense`);
3. mesmo `billingMode` derivado (`direct` ou `card`);
4. mesmo `cardId` quando `billingMode === "card"`;
5. mesmo `amountCents`;
6. ocorrências em **pelo menos duas** `competenceMonth` distintas (no máximo uma transação por competência no grupo).

Campos propostos na sugestão:

- `dayOfMonth` — dia da observação mais recente;
- `startMonth` — primeira competência observada;
- `category` — categoria da observação mais recente;
- `id` / `signature` — identificador determinístico derivado dos critérios acima.

**Exclusões obrigatórias:** `expenseKind` `fee` ou `refund`; transações com `installment` válido; IDs `projected:*`; duplicatas na mesma competência; equivalência a `RecurringRule` existente; transações incompatíveis com o `billingMode` derivado (ex.: receita com cartão/fatura; despesa direta com `cardId`).

**Não implementado:** IA, fuzzy matching, tolerância de valores, criação automática de regras, novas dependências.

### Confirmar e ignorar

| Ação | Comportamento |
|------|----------------|
| **Criar recorrência** | Cria **exatamente uma** `RecurringRule` via `createRecurringRule()`; nenhuma regra é criada antes da confirmação |
| **Ignorar sugestão** | Persiste `{ signature, evidenceFingerprint, ignoredAt }` em `ignoredRecurringSuggestions` |
| **Reaparecer** | Ignorada não volta enquanto assinatura **e** evidência permanecem iguais; nova competência ou transação altera `evidenceFingerprint` e pode gerar nova apresentação |
| **Importação** | Reimportação preserva regras, matches e sugestões ignoradas; não duplica regras |

Sugestões **não** são persistidas como ocorrências nem transações. Não há CRUD próprio para sugestões.

### Distinção parcela × cobrança recorrente

- **Parcela** (`installment` válido): pertence ao motor de parcelas; excluída das sugestões; não pode virar assinatura nem conta fixa.
- **Primeira cobrança observada**: primeira transação histórica da sugestão define `startMonth` (não usar o termo “primeira parcela” para assinatura).

### Classificação das recorrências (`recurrenceClass`)

| Origem sugerida | Classe padrão | `renewalPolicy` padrão |
|-----------------|---------------|------------------------|
| Receita | `income` | `none` |
| Despesa direta | `fixed_bill` | `none` |
| Despesa no cartão | `card_subscription` | `manual_annual` |

O usuário pode escolher **Outra recorrência** antes de confirmar (controle segmentado visível). Legado normaliza: `income` → receita; `expense` + `direct` → conta fixa; `expense` + `card` → assinatura; `seriesId = rule.id`; `renewalPolicy = none`.

### Confirmação com histórico

Ao confirmar: cria uma `RecurringRule` + `RecurringMatch` determinístico para cada evidência compatível; não sobrescreve vínculo existente; confirmação repetida é idempotente.

### Renovação anual de assinaturas

- `renewedThroughMonth` (YYYY-MM) limita projeções; distinto de `endMonth` (encerramento definitivo).
- Ciclo anual: `annualCycleEndMonth(startMonth, competênciaAtual)` — ex.: primeira cobrança 2026-06, competência 2026-07 → aprovada até 2027-05.
- Após vencer: não projeta, não entra no Dashboard nem em `calculateCompetenceSummary`; histórico e matches preservados; ação **Renovar por 12 meses** estende `renewedThroughMonth` em exatamente 12 competências (sem recriar histórico).

### Versionamento de contas fixas

**Atualizar valor a partir de Mmm/AAAA**: encerra versão anterior em `competência − 1`, cria nova regra com mesmo `seriesId`, migra matches da competência efetiva em diante; passado mantém valor antigo; sobreposição de versões impedida. Na própria `startMonth` sem histórico, atualiza in-place.

### Auto-conciliação segura

Executada após importação e ao abrir Planejamento. Vincula automaticamente somente com **um** candidato exato (mesma competência, kind, billing, cartão, descrição normalizada, valor, estrutura compatível, sem match prévio, sem fee/refund/installment/projeção). Zero candidatos → `projected`; dois ou mais → revisão manual; valor diferente → revisão com previsto/observado/diferença (sem alterar regra automaticamente).

### Ícone em Lançamentos

Transação com `RecurringMatch` válido exibe ícone de ciclo (Phosphor-style) ao lado da descrição, com `sr-only` “Lançamento recorrente” e `title="Recorrente"`. Projeções e parcelas não recebem o ícone.

### Ausência de impacto financeiro

- Sugestões **não** entram em `calculateCompetenceSummary` nem no Dashboard.
- Somente `RecurringRule` confirmada gera ocorrência (`projected`).
- `matched` continua contado pela transação real; `covered_by_invoice` pela fatura.
- Parcelas e faturas mantêm precedência da Etapa 8.4.1; sem dupla contagem.

### Hierarquia da página `#/planejamento`

1. Resumo da competência  
2. Sugestões encontradas  
3. Ocorrências do mês  
4. Regras mensais  
5. Cadastro manual (botão **Nova regra** secundário)

### Consolidação visual

Toolbar com intro, formulário com largura controlada (`max-width: 42rem`), controles segmentados Receita/Despesa e Direta/Cartão, labels visíveis, estados vazios compactos, foco preservado no formulário, layout sem scroll horizontal em 390 px.

Screenshots sintéticos: `docs/screenshots-etapa8.4.2/`.

### Demonstração matemática corrigida (Etapa 8.4.1)

Cenário integrado:

| Item | Valor |
|------|------:|
| Receita recebida | 5.000 |
| Receita recorrente prevista (`projected`) | 1.000 |
| Despesa paga total | 650 |
| Fatura em aberto | 800 |
| Parcela projetada | 300 |
| Despesa recorrente prevista (`projected`) | 200 |

**Despesas pendentes / comprometidas** = 800 + 300 + 200 = **1.300** (a receita prevista **não** entra aqui).

**Saldo realizado** = 5.000 − 650 = **4.350**.

**Saldo projetado** = 4.350 + 1.000 − 1.300 = **4.050**.

Fórmula implementada (`balancePlannedCents`):

```
balanceRealizedCents
+ pendingIncomeTxCents
+ recurringIncomeProjectedCents
− pendingExpenseTxCents
− openInvoicesCents
− projectedInstallmentsCents
− recurringExpenseProjectedCents
```

### Limitações mantidas

- Múltiplas pausas: um único intervalo `pausedFromMonth` → `resumedFromMonth`.
- Sugestões exigem repetição exata (descrição, valor, tipo, cobrança); sem tolerância.
- Motor de sugestões analisa apenas transações persistidas.
- Contrato `cfm.import.v1` inalterado.

### Conclusão da Etapa 8

**Etapa 8 concluída.** Motor (8.1), conciliação (8.2), interface Planejamento (8.3), integração financeira/Dashboard (8.4.1) e automatização/consolidação do Planejamento (8.4.2) entregues.

### Próximo marco — Etapa 9

Balanço mensal.

---

## Etapa 8.4.1 — integração financeira e Dashboard executivo

### Objetivo

Integrar recorrências ao cálculo mensal via `recurringResolutionsForMonth()` e transformar o Dashboard em visão executiva da competência, sem nova rota e sem alterar `cfm.import.v1`.

### Regra financeira

| Estado | Efeito nos totais |
|--------|-------------------|
| `projected` + receita | Entra em receita planejada e pendente; **não** entra no realizado |
| `projected` + despesa | Entra em despesa planejada e comprometida; **não** entra no pago |
| `matched` | **Não** soma de novo — a transação real já conta |
| `covered_by_invoice` | **Não** soma de novo — a fatura real já conta |

Fórmulas:

- **Receita planejada** = receitas reais/pendentes + recorrências de receita ainda `projected`
- **Despesa planejada** = pagas + diretas pendentes + faturas em aberto + parcelas projetadas não cobertas + despesas recorrentes `projected` não cobertas
- **Saldo realizado** = receitas recebidas − despesas pagas
- **Saldo projetado** = receita planejada − despesa planejada

`CompetenceSummary` ganhou campos derivados (não persistidos): `recurringIncomeProjectedCents`, `recurringExpenseProjectedCents`, `recurringProjectedCount`.

### Fórmulas oficiais (`calculateCompetenceSummary` + `buildDashboardContext`)

**Saldo realizado** (`balanceRealizedCents`):
`incomeSettledCents − expensePaidCents`, onde
`incomeSettledCents` = soma de transações `income` com `status === "settled"`;
`expensePaidCents` = `expenseTransactionsPaid` (despesas diretas `settled`, excl. `in_invoice`) + `invoicePaidCents` (`amountPaidCents` das faturas).

**Receitas previstas** (painel — duas linhas quando aplicável):
- `pendingIncomeCents` = transações `income` `pending` (`buildDashboardContext`);
- `recurringIncomeProjectedCents` = somente resoluções `projected` de receita (`buildPlanejamentoSummary`).

**Despesas pendentes / comprometidas** (`expensePendingCents`):
`expenseTransactionsPending` (diretas `pending`, excl. `in_invoice`)
+ `invoiceDueCents` (`invoiceCommittedCents` / `invoiceDebtCents` por fatura)
+ `projectedInstallmentsCents` (`projectedInstallmentCentsForMonth`, suprimidas se fatura real no cartão)
+ `recurringExpenseProjectedCents` (somente resoluções `projected` de despesa).

**Faturas em aberto** (linha do fechamento): soma de `invoiceDebtCents` para faturas `open` ou `partial` (`buildDashboardContext.openInvoicesCents`).

**Parcelas projetadas**: `projectedInstallmentCentsForMonth` (excluídas quando `hasInvoiceForCardMonth`).

**Recorrências projetadas**: `buildPlanejamentoSummary.expenseProjectedCents` (estado `projected` apenas).

**Saldo projetado final** (`balancePlannedCents`):
`incomePlannedCents − expensePlannedCents`, equivalente ao fechamento visual:
`balanceRealizedCents + receitas pendentes + receitas recorrentes projetadas − despesas diretas pendentes − faturas em aberto − parcelas projetadas − despesas recorrentes projetadas`.

Exemplo numérico (valores em reais inteiros): receita recebida 5.000; receita recorrente prevista 1.000; despesa paga 650; fatura aberta 800; parcela projetada 300; despesa recorrente prevista 200 → comprometido = 1.300; saldo realizado = 4.350; saldo projetado = 4.050.

**Limitação — múltiplas pausas:** o modelo suporta um único intervalo `pausedFromMonth` → `resumedFromMonth`; nova pausa sobrescreve `pausedFromMonth` e limpa `resumedFromMonth`. Calendário de pausas múltiplas não implementado.

### Prioridade da transação e da fatura real

- Parcelas projetadas entram no comprometido somente sem fatura real para o cartão/competência.
- Compras internas da fatura não são somadas novamente.
- Saldo credor não vira receita; pagamento de fatura não vira nova despesa.
- Fatura real substitui projeção do mesmo cartão (parcelas + recorrências `projected` de cartão).

### Pausa e reativação

- **Pausar** (`pausedFromMonth`, inclusivo): preserva histórico; interrompe projeções a partir da competência da pausa.
- **Reativar** (`resumedFromMonth`): retoma projeções na competência da reativação; **não recria** meses entre pausa e reativação (ex.: pausa em março, reativação em junho → março–maio permanecem vazios).
- Matches históricos permanecem válidos.

### Painéis do Dashboard

1. **Recorrências do mês** — resumo + até 5 ocorrências (PREVISTA / CONCILIADA / COBERTA PELA FATURA); ação **Ver planejamento**.
2. **Cartões e faturas** — fatura real ou **Fatura projetada** (badge PROJETADA); ação **Ver faturas**.
3. **Fechamento projetado** — linhas reconciliadas com saldo projetado (sem linhas zeradas).

Valores `projected` usam estilo secundário (`money--projected`, chip tracejado) — não parecem realizados.

Screenshots sintéticos: `docs/screenshots-etapa8.4/`.

### Conclusão parcial (8.4.1)

Integração financeira e Dashboard executivo entregues na subdivisão 8.4.1; conclusão definitiva da Etapa 8 na 8.4.2.

### Próximo passo — Etapa 8.4.2

Automatizar sugestões no Planejamento e consolidar visual (concluído).

---

## Etapa 8.4 — integração financeira e Dashboard executivo (histórico)

## Regra permanente — campos interativos

Campos interativos não podem estar dentro de subárvores substituídas a cada evento de input. Durante digitação, atualizar somente o estado e os elementos dependentes, preservando o nó DOM, o foco e a posição do cursor.

Aplicada na revisão de importação (dias de cartão), na busca de Lançamentos e no formulário inline de Planejamento.

---

## Etapa 8.3 — página de Planejamento recorrente

### Objetivo

Rota `#/planejamento` para administrar regras recorrentes mensais, visualizar ocorrências da competência e confirmar vínculos com lançamentos reais. Integração ao Dashboard concluída na Etapa 8.4.

### Fluxo da página

1. Cabeçalho com seletor de competência (compartilhado com Dashboard/Lançamentos/Faturas).
2. Resumo informativo da competência (receitas/despesas previstas, quantidades prevista/conciliada/coberta por fatura).
3. Ocorrências do mês via `recurringResolutionsForMonth()`.
4. Regras mensais separadas em receitas e despesas, com filtro Todas/Ativas/Pausadas/Encerradas.

### CRUD permitido

- Criar e editar regra em formulário inline único (validação da Etapa 8.1).
- Pausar a partir da competência selecionada (`pausedFromMonth`, inclusivo): preserva ocorrências e vínculos anteriores; somente a competência da pausa e meses futuros deixam de ser projetados.
- Reativar na competência selecionada (`resumedFromMonth`): retoma projeções sem recriar meses entre pausa e reativação.
- Encerrar define `endMonth` na competência selecionada (inclusivo); histórico e matches anteriores preservados.
- Sem exclusão permanente nesta etapa.

### Conciliação explícita

- Ocorrências `projected` ou `covered_by_invoice` oferecem **Vincular lançamento**.
- Candidatos somente de `compatibleTransactionsForRecurringOccurrence()` — sem escolha automática.
- Vínculo cria `RecurringMatch` com ID determinístico e persiste no `AppData`.
- **Desvincular** remove somente o match, com confirmação.

### Estados exibidos

| Estado | Rótulo |
|--------|--------|
| `projected` | PREVISTA |
| `matched` | CONCILIADA |
| `covered_by_invoice` | COBERTA PELA FATURA |

Em `matched`: valor previsto, realizado, diferença neutra e transação vinculada. `covered_by_invoice` **não** é chamada de conciliada.

### Matches inválidos

Área **Vínculos que precisam de revisão** quando `findInvalidRecurringMatches()` retorna itens, com motivo e ação **Remover vínculo inválido**.

### Limitações remanescentes (Planejamento)

- Ocorrências e resoluções continuam derivadas e não persistidas.
- Sem associação automática por descrição ou valor.
- Encerrar não apaga matches históricos.

Screenshots sintéticos: `docs/screenshots-etapa8.3/`.

---

## Etapa 8.2 — conciliação de recorrências com lançamentos

### Objetivo

Vincular explicitamente uma ocorrência recorrente prevista a uma transação real já existente. A associação é persistida; as ocorrências continuam derivadas e não persistidas. Nesta etapa não há interface, rota, formulário ou integração com o Dashboard.

### Estrutura `RecurringMatch`

Campo opcional em `AppData`: `recurringMatches?: RecurringMatch[]`. Dados antigos sem o campo carregam com `recurringMatches: []`.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | `recurring-match:<ruleId>:<competenceMonth>` |
| `ruleId` | string | Regra recorrente vinculada |
| `competenceMonth` | string | `YYYY-MM` da ocorrência |
| `transactionId` | string | Transação real confirmada pelo usuário |
| `createdAt` / `updatedAt` | string | ISO |

A transação permanece como fato financeiro original. O match representa somente a confirmação de que aquela transação corresponde à ocorrência prevista. Não há campos de recorrência adicionados às transações importadas.

### Associação explícita

- Match válido somente quando regra, transação e ocorrência existem e são estruturalmente compatíveis.
- Máximo um match por `ruleId + competenceMonth`.
- Uma transação não pode aparecer em dois matches.
- **Sem associação automática:** `compatibleTransactionsForRecurringOccurrence()` lista candidatos estruturalmente compatíveis, mas não cria match nem usa pontuação por descrição/valor.

### Estados de resolução (`RecurringOccurrenceResolution`)

Calculados em memória por `recurringResolutionsForMonth()`:

| Estado | Condição |
|--------|----------|
| `matched` | Existe `RecurringMatch` válido; preenche `actualAmountCents` e `differenceCents` |
| `covered_by_invoice` | Despesa em cartão sem match, mas com fatura real para `cardId + competenceMonth` |
| `projected` | Sem match e sem fatura real cobrindo a recorrência de cartão |

### Diferença entre previsto e realizado

Quando `state: matched`:

`differenceCents = actualAmountCents - expectedAmountCents`

Diferença de valor **não invalida** o match. Não há classificação favorável/desfavorável nesta etapa. Em `covered_by_invoice`, diferença não é calculada sem transação vinculada.

### Regra futura contra dupla contagem

`calculateCompetenceSummary` **não foi alterado** nesta etapa. O motor já identifica claramente:

- `projected` → previsão futura;
- `matched` → representado pela transação real;
- `covered_by_invoice` → representado pela fatura real.

Na integração financeira (Etapa 8.3+), somente `projected` entrará como previsão adicional.

### Importação e preservação

`applyImportPlan` preserva `recurringRules` e `recurringMatches`. O contrato `cfm.import.v1` não inclui esses dados — permanecem locais e controlados pelo usuário.

### Próximo passo — Etapa 8.3

Interface de Planejamento: CRUD de regras, criação de matches e exibição das resoluções.

---

## Etapa 8.1 — motor de recorrências mensais

### Objetivo

Criar o modelo local e o motor derivado de receitas previstas e despesas recorrentes mensais. Nesta etapa não há interface, rota, formulário ou integração visual com o Dashboard.

### Estrutura `RecurringRule`

Campo opcional em `AppData`: `recurringRules?: RecurringRule[]`. Dados antigos sem o campo carregam com `recurringRules: []`.

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | string | Identificador único |
| `kind` | `income` \| `expense` | Tipo da recorrência |
| `description` | string | Obrigatória |
| `amountCents` | number | Inteiro > 0 |
| `category` | string | Categoria |
| `dayOfMonth` | number | 1–31 |
| `startMonth` | string | `YYYY-MM`, inclusivo |
| `endMonth` | string? | `YYYY-MM`, inclusivo; não pode ser anterior a `startMonth` |
| `status` | `active` \| `paused` | Somente `active` gera ocorrências |
| `billingMode` | `direct` \| `card` | `income` exige `direct`; `expense` aceita ambos |
| `cardId` | string? | Obrigatório em `card`; proibido em `direct` |
| `createdAt` / `updatedAt` | string | ISO |

### Regras suportadas (MVP)

- Periodicidade **somente mensal**.
- Valor **somente fixo** (`amountCents`).
- Sem semanal, anual, valor variável ou calendário complexo.
- Validação em `validateRecurringRule()` (`src/recurrences.ts`).

### Ocorrências derivadas (não persistidas)

Tipo `ProjectedRecurringOccurrence`, calculado em memória por `buildRecurringOccurrences()` e `recurringOccurrencesForMonth()`.

- **Não** entram em `AppData` nem no `localStorage`.
- **Não** criam `Transaction` nem `Invoice`.
- **Não** conciliam com lançamentos reais nesta etapa.

**ID determinístico:** `recurring:<ruleId>:<competenceMonth>` (ex.: `recurring:rule_internet:2026-08`).

**Datas:** `recurringOccurrenceDate(competenceMonth, dayOfMonth)` usa o último dia válido do mês quando `dayOfMonth` excede o calendário (ex.: dia 31 em fevereiro → 28/02; abril → 30/04). Virada de ano (dez → jan) via iteração por competência `YYYY-MM`, sem `setMonth` sobre datas com dia 29–31.

### Limitações do MVP (Etapa 8.1)

- Sem UI, formulários, rotas ou impacto no Dashboard.
- Sem integração com cálculos financeiros (`calculateCompetenceSummary` inalterado).
- Sem conciliação com transações/faturas reais.
- Sem recorrências semanais, anuais ou de valor variável.

### Próximos passos — Etapa 8.2

- Formulários e CRUD de regras recorrentes.
- Exibição em Lançamentos e/ou Dashboard.
- Integração com totais planejados da competência.
- Conciliação opcional com lançamentos reais.

---

## Etapa 7 — organização de Lançamentos

A página **Lançamentos** está dividida em três seções:

1. **Receitas** — transações reais `kind: income` da competência.
2. **Despesas** — despesas diretas (sem `ledgerStatus: in_invoice` e sem `invoiceId`).
3. **Faturas e cartões** — blocos por cartão com fatura real ou projeção quando não há fatura.

**Fatura real:** usa totais oficiais da entidade `Invoice`; linhas internas listadas somente no detalhe expandido.

**Projeção:** exibida quando não há fatura real para `cardId + competenceMonth`; badge `PROJETADA`; não persiste entidade Invoice.

Cada seção possui ordenação independente. Busca e filtros atuam nas três seções.

---

## Etapa 7 — concluída

### Motor derivado de parcelas

Projeções são calculadas **em memória** a partir de compras parceladas já observadas (`kind: expense`, `ledgerStatus: in_invoice`, parcela válida, `cardId` definido). Não há persistência em `AppData`, nem alteração do schema `cfm.local.v2` ou do contrato `cfm.import.v1`.

**Geração:** a partir da observação mais recente de cada assinatura (`cardId` + descrição normalizada + `amountCents` + `installment.total`), usa o maior `installment.current` da competência mais recente e projeta parcelas `current+1 … total` com `shiftCompetenceMonth()` sobre a competência de origem.

**Continuidade entre competências:** observações anteriores da mesma assinatura são ignoradas (ex.: 5/12 em junho + 6/12 em julho → projeta a partir de 6/12). Compras distintas na mesma competência são preservadas quando têm `canonicalFingerprint` diferente.

**Prioridade da fatura real:** se já existir fatura real para o cartão na competência alvo, as parcelas projetadas daquele cartão **não entram** no comprometido nem são exibidas em Lançamentos — evita dupla contagem com a fatura oficial.

**Impacto financeiro (mês sem fatura para o cartão):** parcelas projetadas compõem `expensePendingCents`, afetam `expensePlannedCents` e `balancePlannedCents`. Não alteram `expensePaidCents` nem `balanceRealizedCents`.

**IDs determinísticos:** `projected:<sourceTransactionId>:<installmentNumber>`.

### UI

- **Lançamentos:** combina reais + projeções; badge `PROJETADA`; filtro de status `Projetado`; sem editar/excluir.
- **Dashboard:** painel compacto **Parcelas projetadas** (subtotal, quantidade, agrupamento por cartão, link para Lançamentos).

Fixture sintética de capturas: `src/fixtures/cfm-import-v1-projections.json`. Screenshots: `docs/screenshots-etapa7/`.

### Limitações do MVP

- Assinatura heurística (descrição + valor + total) pode agrupar compras distintas se importadas sem fingerprints diferentes.
- Não cobre despesas fixas/recorrentes nem gera faturas futuras.
- Não permite editar projeções manualmente.

---

## Etapa 6 — concluída

### Ordenação por coluna

Tabelas nativas (`<table>`) com cabeçalhos ordenáveis via botão, `aria-sort` no `th` ativo, indicador de direção e controle mobile **Ordenar por** compartilhando o mesmo estado.

**Padrões iniciais:** Lançamentos data desc · Faturas vencimento asc · Detalhe da fatura data desc.

**Ordem de status documentada em** `src/table-sort.ts`: lançamentos (Na fatura → Pendente → Pago/Recebido); faturas (Aberta → Parcial → Paga → Credora).

Screenshots: `docs/screenshots-etapa6/`.

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
