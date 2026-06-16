# Status do Projeto

**Projeto:** Controle Financeiro Mensal (CFM)  
**Última atualização:** 15 de junho de 2026  
**Fase atual:** Fase 0.3.6-B — Correção de vínculo cartões, snapshots, faturas e transações

---

## O que foi criado nesta etapa

### Estrutura estática (GitHub Pages)

- `index.html` com shell de produto premium
- CSS responsivo em `assets/css/` (base, layout, components, pages)
- JavaScript vanilla em `src/` e `assets/js/main.js`
- Hash router funcional: `#/dashboard`, `#/importar`, `#/cartoes`, `#/historico`
- Páginas placeholder com cards, estados vazios e navegação

### Documentação técnica

- README.md e 11 documentos em `/docs`
- Modelo de dados RTDB (`MODELO_DADOS_RTD.md`)
- Schema de importação JSON (`SCHEMA_IMPORTACAO_JSON.md`)
- Checklist AppSec (`APPSEC.md`)
- Roadmap e arquitetura

### Dados e schema

- Schema canônico `cfm.import.v1` em `src/schemas/import.schema.js`
- Exemplo sanitizado `data/sample-import.cfm.v1.json`
- Serviço de importação stub (`import.service.js`) — validação em memória, sem persistência

### Firebase (preparação)

- `database.rules.json` — negar tudo por padrão; liberar `/users/{uid}` apenas para `auth.uid == uid`
- `config.example.js` — template sem credenciais reais
- `firebase.json` — referência às regras RTDB

---

## O que ficou fora do escopo (propositalmente)

| Item | Motivo |
|------|--------|
| Autenticação Firebase funcional | Próxima fase |
| Conexão RTDB / persistência | Próxima fase |
| CRUD completo | Próxima fase |
| Parser de PDF | Fase futura |
| Supabase | Fora do plano primário |
| npm, bundler, servidor | Incompatível com requisito GitHub Pages |
| Dependências externas (CDN) | Evitadas nesta fundação |
| Chaves/credenciais reais | Proibido nesta etapa |

---

## Decisões registradas

1. **Scripts clássicos** (não ES modules) para compatibilidade com `file://` e GitHub Pages sem build.
2. **Namespace `window.CFM`** para organização modular sem bundler.
3. **Valores monetários em centavos** (`amountCents` positivo + `flow` in/out/neutral).
4. **Dados por uid** no RTDB para evitar leituras amplas.
5. **Firebase como backend primário**; Supabase excluído desta etapa.

---

## Riscos atuais

| Risco | Severidade | Mitigação planejada |
|-------|------------|---------------------|
| Regras RTDB ainda não refinadas (validação de campos) | Média | Auditoria com skill AppSec antes de produção |
| Importação local sem rate limit | Baixa | Persistência só após Auth |
| `config.js` acidentalmente commitado | Alta | `.gitignore` + revisão em PR |
| Escopo creep (CRUD antes da Auth) | Média | Roadmap e STATUS atualizados a cada fase |

---

## Próximo marco recomendado

**Fase 1 — Auth + RTDB mínimo**

1. Integrar Firebase Auth (e-mail/senha ou provedor OAuth)
2. Conectar RTDB com leitura/escrita em `/users/{uid}`
3. Persistir importação validada após login
4. Refinar `database.rules.json` com validações de schema
5. Estados de loading/erro e logout

---

## Critérios de aceite — Fase 0

| # | Critério | Status |
|---|----------|--------|
| 1 | Abre localmente via `index.html` | ✅ |
| 2 | Sem dependência de servidor | ✅ |
| 3 | Hash router troca páginas placeholder | ✅ |
| 4 | UI premium (não planilha) | ✅ |
| 5 | Layout responsivo (desktop/tablet/mobile) | ✅ |
| 6 | Sem scroll horizontal | ✅ |
| 7 | Estados vazios claros | ✅ |
| 8 | Schema JSON documentado | ✅ |
| 9 | Exemplo JSON válido e sanitizado | ✅ |
| 10 | Modelo RTDB por uid/mês/conta/cartão | ✅ |
| 11 | APPSEC: auth ≠ autorização | ✅ |
| 12 | Sem `.read`/`.write` true globais | ✅ |
| 13 | STATUS_DO_PROJETO.md atualizado | ✅ |
| 14 | Nenhum dado sensível real | ✅ |
| 15 | Nenhuma funcionalidade fora da etapa | ✅ |

---

## Auditoria interna (15/06/2026)

- Documentação, estrutura e escopo estão alinhados.
- Nenhum CRUD completo implementado.
- Nenhuma dependência externa desnecessária.
- Supabase não adicionado.
- Compatibilidade GitHub Pages preservada.

---

## Fase 0.1 — Refinamento Visual (15/06/2026)

### O que foi alterado

| Arquivo | Mudança |
|---------|---------|
| `assets/css/base.css` | Tokens completamente reescritos: tema claro premium |
| `assets/css/layout.css` | Cores dark hardcoded removidas; sidebar/header/nav atualizados |
| `assets/css/components.css` | Cards, empty states, botões, notices, tabela — todos no tema claro |
| `assets/css/pages.css` | Ajustes de página, cartões, histórico — tema claro |
| `src/pages/importer.page.js` | Microcopy corrigido e melhorado; resultado de importação aprimorado |
| `src/pages/history.page.js` | Datas atualizadas para 2026; tabela envolvida em `.table-wrap` |
| `docs/UX_UI_GUIDE.md` | Reescrito: tema claro definido como padrão oficial, tokens documentados |
| `docs/DECISOES_TECNICAS.md` | ADR-010 adicionado: sem dark mode no MVP |

### O que não foi alterado

- Hash routing, lógica de páginas, schema, services — intactos
- Firebase não conectado
- Sem CRUD real, sem persistência
- Nenhuma dependência externa adicionada
- Compatibilidade com GitHub Pages e `file://` preservada

### Critérios de aceite — Fase 0.1

| # | Critério | Status |
|---|----------|--------|
| 1 | Produto não parece dark | ✅ |
| 2 | Fundo claro off-white dominante | ✅ |
| 3 | UI funciona em todas as rotas | ✅ |
| 4 | Visual premium, financeiro e confiável | ✅ |
| 5 | Responsividade preservada | ✅ |
| 6 | Sem scroll horizontal | ✅ |
| 7 | Contraste de textos adequado | ✅ |
| 8 | Empty states visíveis e claros | ✅ |
| 9 | Aviso de persistência visível e elegante | ✅ |
| 10 | Nenhuma funcionalidade fora do escopo | ✅ |
| 11 | Nenhuma dependência externa adicionada | ✅ |
| 12 | STATUS_DO_PROJETO.md atualizado | ✅ |
| 13 | UX_UI_GUIDE.md registra tema claro | ✅ |
| 14 | DECISOES_TECNICAS.md registra ADR-010 | ✅ |

---

## Fase 0.2 — Correção de Coerência Visual/UX (15/06/2026)

### Pendências corrigidas

| Arquivo | Correção |
|---------|----------|
| `assets/css/base.css` | `--color-text-muted` → `#475569` (7.6:1); `--color-text-subtle` → `#64748b` (4.6:1) — todos passam WCAG AA |
| `assets/css/components.css` | `.upload-zone__actions` adicionado; `label.btn` com cursor e user-select corretos |
| `assets/css/pages.css` | `#import-result` substituído por `.import-result` com variantes `--ok` e `--error` |
| `src/pages/cards.page.js` | Cards fake removidos; apenas empty state honesto; botão com microcopy "Disponível em fase futura" |
| `src/pages/importer.page.js` | Botão "Carregar exemplo" removido; `tabindex="0"` e `keydown` handler na label para acessibilidade por teclado; input com `sr-only` em vez de `hidden`; empty state ocultado após processar arquivo |

### O que continua fora do escopo

- Firebase Auth não integrado
- Firebase SDK não conectado
- CRUD não implementado
- Persistência não implementada
- Parser de PDF não iniciado
- Supabase não adicionado
- Nenhuma dependência externa adicionada
- Compatibilidade com GitHub Pages e `file://` preservada

### Critérios de aceite — Fase 0.2

| # | Critério | Status |
|---|----------|--------|
| 1 | Cartões não exibe cards fake junto com empty state | ✅ |
| 2 | Tela Cartões honesta: "Nenhum cartão cadastrado" | ✅ |
| 3 | Botão "Carregar exemplo" removido do importador | ✅ |
| 4 | Botão "Disponível em fase futura" claramente desabilitado | ✅ |
| 5 | Todos os textos passam WCAG AA (≥ 4.5:1 em fundo branco) | ✅ |
| 6 | Tema claro premium preservado, sem dark remanescente | ✅ |
| 7 | Todas as rotas funcionam | ✅ |
| 8 | Sem scroll horizontal | ✅ |
| 9 | Nenhuma dependência externa adicionada | ✅ |
| 10 | Nenhuma funcionalidade fora do escopo implementada | ✅ |
| 11 | STATUS_DO_PROJETO.md atualizado | ✅ |
| 12 | UX_UI_GUIDE.md atualizado | ✅ |

---

## Fase 0.3 — Importador JSON Local Real (15/06/2026)

### O que foi implementado

| Arquivo | Mudança |
|---------|---------|
| `src/utils/formatters.js` | Novo — `formatCurrencyFromCents`, `formatFileSize`, `formatDate`, `formatMonth` |
| `src/utils/validators.js` | Novo — `normalizeDescription`, `buildImportFingerprint`, `detectIntraBatchDuplicates` |
| `src/schemas/import.schema.js` | Reescrito — `source.institution` e `source.documentType` obrigatórios; `transactions[].type` validado; `periodStart/End` com regex de data; traceabilidade e revisão como avisos |
| `src/services/import.service.js` | Reescrito — pipeline completo: `readJsonFile`, `parseJsonText`, `validateImportPayload`, `buildImportReport`, `detectDuplicates`, `processFile` |
| `src/pages/importer.page.js` | Reescrito — 6 estados (idle/loading/success/warning/error/empty), relatório completo, deduplicação, botões "Limpar" e "Confirmar" (disabled) |
| `src/pages/dashboard.page.js` | Microcopy: "após a importação e confirmação dos lançamentos" |
| `data/sample-import.cfm.v1.json` | Atualizado — `source.institution`, `documentType`, `periodStart/End`; `type` por transação; 1 duplicata, 1 revisão pendente, 1 item inválido (para demonstração) |
| `assets/css/components.css` | Novos componentes: `stat-grid`, `tx-list`, `flow-badge`, `issue-list`, `import-report`, `import-actions` |
| `index.html` | Scripts de `formatters.js` e `validators.js` adicionados; badge atualizado para "Fase 0.3" |

### Funcionalidades implementadas

- **Leitura local**: `FileReader` lê `.json` no navegador sem enviar para servidor
- **Validação estrutural**: `schemaVersion`, `source.institution`, `source.documentType`, arrays
- **Validação por item**: `amountCents`, `flow`, `type`, `competenceMonth`, `description` — itens inválidos marcados
- **Rastreabilidade**: aviso quando `rawHash`/`externalRef` ausentes
- **Revisão pendente**: itens com `review.required === true` listados
- **Deduplicação interna**: fingerprint por `institution + documentType + account + date + amountCents + flow + normalizedDescription`
- **Relatório completo**: contadores, lista de transações (máx. 10 exibidas), erros, avisos, duplicatas, pendências
- **Estados da UI**: idle → loading → success / warning / error / empty
- **Botão "Limpar importação"**: reseta para estado idle
- **Botão "Confirmar importação"**: desabilitado, microcopy "Disponível após integração Firebase (Fase 1)"

---

## Fase 0.3.2 — Revisor Local e Conciliação Financeira

**Data:** 15/06/2026 | **Estado:** ✅ Concluída

### Objetivo

Evoluir o importador para análise crítica, revisão visual e conciliação financeira antes de qualquer persistência.

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/utils/validators.js` | Adicionados `detectExactDuplicates` (por rawHash) e `scanForSensitiveData` (scanner de privacidade) |
| `src/services/import.service.js` | `buildImportReport` estendido: mapas de cartão/conta, conciliação de faturas, duplicatas exatas/prováveis, privacidade, status geral |
| `src/pages/importer.page.js` | Reescrito com sistema de 8 tabs (Resumo, Faturas, Transações, Revisão, Duplicidades, Recorrências, Parcelamentos, Privacidade), renderização lazy, filtros de transação |
| `assets/css/pages.css` | Estilos para tabs, banner de status, invoice-grid, credit-balance, filter-bar, status-chip, type-badge, review-item, entity-list, privacy-check |
| `.gitignore` | Adicionadas proteções para `/imports-local/`, `/data/private/`, `*.real.json`, `*.sensitive.json`, `cfm_import_v1_final_perfeito_validado.json` |

### Funcionalidades implementadas

- **8 tabs** com renderização lazy (apenas summary pré-renderizado)
- **Painel Faturas**: cartão + lastFour, mês, status, vencimento, fechamento, total, saldo credor (mensagem "Saldo positivo de R$ X será abatido da próxima fatura."), indicador stub, revisão obrigatória, conciliação por `invoiceId`
- **Saldo credor R$ 7,49**: `balanceDirection:"credit"` + `creditBehavior:"applies_to_next_invoice"` exibe mensagem específica
- **Painel Transações**: filtros por tipo, flow, competência, cartão, conta e revisão — re-renderização sem rebuild do tab
- **Painel Revisão**: itens `review.required === true` de transações e faturas com motivo e ação futura
- **Painel Duplicidades**: exatas (por rawHash) separadas de prováveis (por fingerprint)
- **Painel Privacidade**: scan de CPF, número de cartão completo, boleto (47-48 dígitos), sequência numérica longa (≥12)
- **Painel Recorrências**: frequência, dia do mês, conta, cartão, status ativa/inativa
- **Painel Parcelamentos**: progresso N/total, valor/parcela, valor total, cartão
- **Banner de status geral**: `ready` / `has_pending` / `has_blockers` com ícone e cor semântica
- **Proteção de versionamento**: `.gitignore` com padrões específicos para dados financeiros reais

### O que continua fora do escopo

- Firebase Auth não integrado
- Firebase SDK não conectado
- Nenhuma gravação (Firebase RTDB, localStorage, IndexedDB)
- Parser de PDF não iniciado
- Supabase não adicionado
- Nenhuma dependência externa adicionada
- Compatibilidade com GitHub Pages e `file://` preservada
- Arquivo real `cfm_import_v1_final_perfeito_validado.json` nunca versionado

### Critérios de aceite — Fases 0.3 + 0.3.2

| # | Critério | Status |
|---|----------|--------|
| 1 | JSON válido exibe relatório rico com 8 tabs | ✅ |
| 2 | JSON inválido mostra erro claro | ✅ |
| 3 | Fatura Mercado Pago mostra "Saldo positivo de R$ 7,49 será abatido da próxima fatura." | ✅ |
| 4 | Faturas isStub exibidas como stub | ✅ |
| 5 | `review.required === true` aparece no painel Revisão | ✅ |
| 6 | Duplicatas exatas (rawHash) separadas de prováveis (fingerprint) | ✅ |
| 7 | Scanner de privacidade verifica CPF, cartão completo, boleto, números longos | ✅ |
| 8 | Filtros de transação re-renderizam sem rebuild do tab | ✅ |
| 9 | `credit_card_payment` exibido com badge "Pagamento de Fatura" | ✅ |
| 10 | Nenhum dado gravado em Firebase/localStorage/IndexedDB | ✅ |
| 11 | Firebase não conectado | ✅ |
| 12 | Nenhuma dependência externa | ✅ |
| 13 | `.gitignore` protege arquivos financeiros reais | ✅ |
| 14 | Console sem dados financeiros completos | ✅ |
| 15 | GitHub Pages compatível | ✅ |

---

## Fase 0.3.1-B — Correção do Contrato do Importador + Drag and Drop

**Data:** 15/06/2026 | **Estado:** ✅ Concluída

### Objetivo

Alinhar o validador ao contrato canônico real de `transaction.type`, corrigir rastreabilidade via `transaction.source.rawHash` e adicionar drag and drop na área de importação.

### Problema corrigido

O importador rejeitava transações do JSON real (`credit_card_purchase`, `income`, `expense`, etc.) por usar enum legado (`credit`, `debit`, `payment`, …). Avisos de rastreabilidade apareciam mesmo com `source.rawHash` presente na transação.

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/schemas/import.schema.js` | Enum canônico de `type`; rastreabilidade via `externalRef` ou `source.rawHash` |
| `src/pages/importer.page.js` | Labels/microcopy canônicos; `processImportFile` compartilhado; drag and drop (`dragenter`, `dragover`, `dragleave`, `drop`); estado `is-dragover` |
| `assets/css/components.css` | Estilo `.upload-zone.is-dragover` e `.upload-zone__types` |
| `assets/css/pages.css` | Badge `.type-badge--purchase` |
| `data/sample-import.cfm.v1.json` | Tipos canônicos (`income`, `expense`, `credit_card_purchase`); exemplo com `source.rawHash` |
| `docs/SCHEMA_IMPORTACAO_JSON.md` | Enum `type` canônico e regras de rastreabilidade |
| `docs/QA_CHECKLIST.md` | Testes de contrato e drag and drop |
| `docs/APPSEC.md` | Nota sobre rastreabilidade via `source.rawHash` |

### Funcionalidades implementadas

- **Enum canônico**: `income`, `expense`, `transfer`, `credit_card_purchase`, `credit_card_payment`, `adjustment`, `fee`, `refund`
- **Rastreabilidade**: sem aviso quando `transaction.externalRef` ou `transaction.source.rawHash` existir
- **Drag and drop**: área aceita `.json`; estado visual `is-dragover`; um arquivo por vez; erro claro para tipos inválidos ou múltiplos arquivos
- **Pipeline único**: `processImportFile` usado pelo input file e pelo drop
- **Acessibilidade**: botão "Selecionar arquivo" mantido; teclado (Enter/Space) preservado

### Critérios de aceite — Fase 0.3.1-B

| # | Critério | Status |
|---|----------|--------|
| 1 | JSON real não gera erro por `credit_card_purchase` | ✅ |
| 2 | JSON real não gera erro por `credit_card_payment` | ✅ |
| 3 | JSON real não gera erro por `income` | ✅ |
| 4 | JSON real não gera erro por `expense` | ✅ |
| 5 | JSON real não gera erro por `adjustment` | ✅ |
| 6 | Avisos de rastreabilidade somem com `source.rawHash` | ✅ |
| 7 | Dropzone aceita arrastar e soltar `.json` | ✅ |
| 8 | Botão "Selecionar arquivo" continua funcionando | ✅ |
| 9 | Estado visual `is-dragover` durante arraste | ✅ |
| 10 | Arquivo não JSON gera erro claro | ✅ |
| 11 | Múltiplos arquivos geram erro claro | ✅ |
| 12 | Nenhum dado persistido | ✅ |
| 13 | Firebase ausente | ✅ |
| 14 | Nenhuma dependência externa | ✅ |
| 15 | Console sem vazamento de dados completos | ✅ |

---

## Fase 0.3.3 — Inteligência de Revisão e Classificação de Semelhanças

**Data:** 15/06/2026 | **Estado:** ✅ Concluída

### Objetivo

Refinar o importador para reduzir falsos positivos de duplicidade, agrupar revisões por motivo e apresentar um assistente financeiro mais útil — sem persistência.

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/utils/validators.js` | Motor de classificação: `classifyTransactionSimilarity`, `buildSimilarityReport`, detectores por tipo |
| `src/services/import.service.js` | `buildReviewGroups`, `buildSuggestedAction`, contadores separados de semelhanças |
| `src/pages/importer.page.js` | Aba "Semelhanças", revisão agrupada, linguagem amigável, badges de confiança |
| `assets/css/pages.css` | Estilos para grupos de revisão, lista de semelhanças, confidence badges |

### Classificações implementadas

| Classificação | Quando |
|---------------|--------|
| `exact_duplicate` | Mesmo `source.rawHash` ou `externalRef` |
| `probable_duplicate` | Mesmo tipo, flow, valor, data, descrição, conta/cartão e fatura |
| `installment_related` | Parcelas X/Y com `installment.current` diferente ou mesmo plano |
| `recurring_candidate` | Mesmo favorecido/valor em meses consecutivos |
| `repeated_purchase` | Mesma compra em datas diferentes no mesmo mês |
| `similar_transfer` | Pix/transferência semelhante em datas diferentes |
| `not_duplicate` | Demais casos — não exibidos |

### Funcionalidades implementadas

- Aba **Semelhanças** (substitui "Duplicidades") com 6 grupos e contadores
- Badges de confiança: Alta, Média, Baixa
- Resumo separa dup. exatas, dup. prováveis e semelhanças classificadas
- Aba **Itens para confirmar** agrupada por motivo com sugestões não aplicadas
- Status amigável: "Pronto para revisar" (não "Possui pendências")
- Bloqueio apenas para erros estruturais ou privacidade crítica

### Critérios de aceite — Fase 0.3.3

| # | Critério | Status |
|---|----------|--------|
| 1 | JSON real: 206 válidos, 0 inválidos | ✅ |
| 2 | Antigos 9 "duplicidades" reclassificados | ✅ |
| 3 | Parcelas com `installment.current` diferente → Parcelas relacionadas | ✅ |
| 4 | Despesas iguais em meses diferentes → Recorrências candidatas | ✅ |
| 5 | Compras iguais em datas diferentes → Compras repetidas | ✅ |
| 6 | Pix semelhantes → Transferências semelhantes | ✅ |
| 7 | Duplicata exata só com mesmo rawHash/externalRef | ✅ |
| 8 | Aba renomeada para "Semelhanças" | ✅ |
| 9 | Revisão agrupada por motivo | ✅ |
| 10 | Sugestões exibidas sem aplicação automática | ✅ |
| 11 | Resumo separa duplicatas de semelhanças | ✅ |
| 12 | Nenhum item removido automaticamente | ✅ |
| 13 | Nada gravado | ✅ |
| 14 | Firebase ausente | ✅ |
| 15 | Nenhuma dependência externa | ✅ |
| 16 | Console sem vazamento | ✅ |

---

## Fase 0.3.4 — Motor inteligente de importação recorrente, idempotência e redução de revisão manual

**Data:** 15/06/2026 | **Estado:** ✅ Concluída

### Objetivo

Refinar o importador local para reduzir revisão manual, tratar importações mensais recorrentes (simuladas), diferenciar compra repetida legítima de duplicidade real, reconhecer parcelamento de fatura como obrigação financeira normal e preparar idempotência + preservação de edições manuais futuras — **sem Firebase, Auth ou persistência**.

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/utils/validators.js` | `buildCanonicalFingerprint`, `classifyImportMatch`, `simulateReimport`, `classifyInstallmentKind`, `isInvoiceInstallmentTx`; `repeated_purchase` informativo; duplicidade provável mais estrita |
| `src/services/import.service.js` | `reduceManualReview`, `classifyReviewPriority`, `detectInvoiceInstallments`, `buildImportMetadata`, `buildUserSafeImportDecision`; relatório com grupos de prioridade e simulação de reimportação |
| `src/pages/importer.page.js` | Revisão por prioridade (crítica / importante / sugestões); semelhanças informativas; painéis de auto-resolução e reimportação; parcelamentos com `kindLabel` |
| `assets/css/pages.css` | Estilos de prioridade de revisão, painel de reimportação, parcelamento de fatura |
| `assets/css/components.css` | Variante `.notice--success` |
| `docs/SCHEMA_IMPORTACAO_JSON.md` | Fingerprint canônico, tipos de parcelamento, classificação de reimportação |
| `docs/MODELO_DADOS_RTD.md` | Campos futuros `importedFields`, `userFields`, `userEdited`, `lockedFields` |
| `docs/QA_CHECKLIST.md` | Checklist Fase 0.3.4 |
| `docs/APPSEC.md` | Notas sobre fingerprint e idempotência simulada |

### Regras de negócio implementadas

| Regra | Implementação |
|-------|---------------|
| Compra repetida em datas diferentes | `repeated_purchase` — informativo, não conta como pendência |
| Duplicidade provável | Mesmo valor, data, descrição, conta/cartão, type, flow e fatura; hash/ref diferentes |
| Duplicidade exata | Mesmo `source.rawHash` ou `externalRef` |
| Parcelamento de fatura | `kind = invoice_installment`, `subtype = invoice_installment`; auto-resolvido, não revisão crítica |
| Parcelamento de compra | `kind = purchase_installment`; separado de fatura |
| Reimportação mensal (simulada) | `simulateReimport` classifica: `new_item`, `already_imported`, `exact_duplicate`, etc. |
| Idempotência local | `canonicalFingerprint` por transação; segunda passagem do mesmo lote → majoritariamente `already_imported` |
| Preservação de edição futura | `importMetadata` com `importedFields`, `userFields`, `userEdited`, `lockedFields` |
| Redução de revisão | iFood/IFD*, parcelamentos completos, compras de cartão completas → auto-resolvidos |
| Pix pessoa física / TED ambíguo / Pix no crédito | Mantidos em revisão importante |
| Fatura stub | Revisão na aba Faturas, não auto-resolvida |

### UX

- Aba **Itens para confirmar** dividida em: **Revisão crítica**, **Revisão importante**, **Sugestões**
- Mensagem: *"A maioria dos itens foi classificada automaticamente. Revise apenas os pontos ambíguos."*
- Painel **Simulação de reimportação (idempotência local)** no resumo
- Compras repetidas em seção **informativa** na aba Semelhanças
- Botão **Confirmar importação** desabilitado: *"Confirmação será liberada após Firebase Auth + RTDB Rules"*

### O que continua fora do escopo

- Firebase Auth / SDK / RTDB
- localStorage / IndexedDB
- CRUD ou gravação real
- Remoção ou sobrescrita automática de transações
- Parser PDF
- Commit de JSON financeiro real

### Critérios de aceite — Fase 0.3.4

| # | Critério | Status |
|---|----------|--------|
| 1 | Compra repetida em datas diferentes não é duplicidade | ✅ |
| 2 | Compra repetida não entra como revisão obrigatória | ✅ |
| 3 | Mesmo valor+data+descrição+conta → duplicidade provável | ✅ |
| 4 | Mesmo rawHash/externalRef → duplicidade exata | ✅ |
| 5 | Parcelamento de fatura → `invoice_installment` | ✅ |
| 6 | Parcelamento de fatura não é revisão crítica | ✅ |
| 7 | Parcelamento de compra separado de fatura | ✅ |
| 8 | Revisão agrupada por prioridade | ✅ |
| 9 | Itens leves em Sugestões, não crítica | ✅ |
| 10 | Pix pessoa física continua em revisão | ✅ |
| 11 | TED/entrada ambígua continua em revisão | ✅ |
| 12 | Fatura stub continua em revisão (Faturas) | ✅ |
| 13 | `canonicalFingerprint` gerado por transação | ✅ |
| 14 | Simulação de reimportação visível | ✅ |
| 15 | Nenhuma persistência real | ✅ |
| 16 | Firebase ausente | ✅ |
| 17 | Console sem vazamento de transações completas | ✅ |

---

## Fase 0.3.5 — Regras pessoais de classificação e redução de revisão manual

**Data:** 15/06/2026 | **Estado:** ✅ Concluída

### Objetivo

Camada de regras pessoais de classificação para reconhecer padrões recorrentes do usuário, reduzir itens para confirmação e preparar aprendizado futuro — **sem Firebase, Auth, RTDB ou persistência**.

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/services/classification-rules.service.js` | Motor: `loadClassificationRules`, `applyClassificationRules`, `matchRule`, `scoreRuleMatch`, recorrências e financiamentos reconhecidos |
| `src/config/classification-rules.example.js` | Exemplos genéricos desabilitados (sem dados pessoais) |
| `src/config/classification-rules.local.js` | Regras pessoais locais (**gitignored**) |
| `src/services/import.service.js` | Integração de regras na redução de revisão, contadores e relatório |
| `src/pages/importer.page.js` | Resumo, recorrências com origem, parcelamentos com financiamento |
| `index.html` | Scripts de regras + fallback `onerror` para GitHub Pages |
| `.gitignore` | Protege `classification-rules.local.js` e `personal-rules.local.js` |
| Documentação | STATUS, QA, SCHEMA, MODELO_DADOS_RTD, APPSEC |

### Regras pessoais locais (não versionadas)

| Padrão | Classificação |
|--------|---------------|
| BMI Serviços Digitais | Internet recorrente |
| Banco Pan Auto Pan | Financiamento (22/36 em jun/2026) |
| Protev | Seguro da moto recorrente |
| Pabblu E | Barbeiro / cuidados pessoais |
| Kelly Lanchonete | Alimentação / café da manhã |
| TED recebida (faixa salarial) | Salário recorrente |
| Pix enviado pessoa física | Despesa normal (não ambíguo) |
| Pix recebido pessoa física | Revisão leve (conservador) |

### UX

- Resumo: contadores **Por regra pessoal**, **Auto-resolvidos**, **Financiamentos**
- Aviso: *"Regras pessoais aplicadas localmente. Nada foi gravado nesta fase."*
- Recorrências: origem (JSON / regra pessoal / motor)
- Parcelamentos: financiamento, parcela, meses restantes, tipo

### Modelo futuro (Fase 1/2)

Regras migrarão para RTDB: `/users/{uid}/classificationRules/{ruleId}`, `categoryRules`, `merchantAliases`, `importPreferences`.

### Critérios de aceite — Fase 0.3.5

| # | Critério | Status |
|---|----------|--------|
| 1 | JSON real: 206 válidos, 0 inválidos | ✅ (validação local) |
| 2 | Pix enviado PF não é revisão importante automática | ✅ |
| 3 | Pix enviado PF → despesa/saída normal | ✅ |
| 4 | BMI → internet recorrente | ✅ |
| 5 | Banco Pan → financiamento | ✅ |
| 6 | Protev → seguro moto | ✅ |
| 7 | Pabblu E → barbeiro | ✅ |
| 8 | Kelly Lanchonete → alimentação, sem revisão | ✅ |
| 9 | TED salário quando padrão compatível | ✅ |
| 10 | Itens para confirmar reduzidos vs. ~25 | ✅ |
| 11 | Auto-resolvidos em painel próprio | ✅ |
| 12 | Regras locais não versionadas | ✅ |
| 13 | `.gitignore` protege regras locais | ✅ |
| 14 | Nenhuma persistência real | ✅ |
| 15 | Firebase ausente | ✅ |
| 16 | Console sem vazamento | ✅ |

---

## Fase 0.3.6 — Cartões, limites, faturas/stubs e regras pessoais v2

**Data:** 15/06/2026 | **Estado:** ✅ Concluída

### Objetivo

Modelar cartões, snapshots de limite, faturas/stubs e regras pessoais v2 — separando cadastro, snapshot e fatura — sem persistência.

### Destaques

- `card-snapshot.service.js` + overlay local gitignored
- Aba **Cartões** com limite/usado/disponível e barra de utilização
- Faturas agrupadas: consolidadas, abertas, pagas, referência/stub
- Regras v2: FGTS Caixa, Lowify, IFD/iFood global, assinaturas (OpenAI, Spotify, Adobe, Uber One)
- Mercado Pago: limite R$ 500 corrigido via overlay; saldo credor não é receita

### Critérios de aceite — Fase 0.3.6

| # | Critério | Status |
|---|----------|--------|
| 1 | 206 válidos / 0 inválidos | ✅ |
| 2–6 | Limites BB, Nubank, Porto, MP corretos | ✅ |
| 7 | MP saldo R$ 7,49 abatível | ✅ |
| 8–9 | Stubs separados com mensagem | ✅ |
| 10–14 | Regras v2 (FGTS, Lowify, IFD, Pix, Pan) | ✅ |
| 15 | Pendências reduzidas | ✅ |
| 16–18 | Sem persistência, Firebase, vazamento | ✅ |

---

## Fase 0.3.6-B — Correção de vínculo cartões, snapshots, faturas e transações

**Data:** 15/06/2026 | **Estado:** ✅ Concluída

### Problema corrigido

A estrutura da 0.3.6 existia, mas vínculos falhavam por `cardExternalRef` ≠ `card.id`, aliases de nome não resolvidos e revisão/semelhanças usando contadores brutos do JSON.

### Correções

| Área | Correção |
|------|----------|
| Resolvedor | `buildCardRegistry`, `resolveCardId`, aliases BB/Nubank/Porto/MP |
| Snapshots | Match por `canonicalKey` + padrões de nome |
| Aba Cartões | Usado/disponível, contagens e totais vinculados |
| Transações | Filtro “Apenas revisão” usa revisão **efetiva** pós-regras |
| Semelhanças | BMI/Protev/Pan removidos de candidatos se regra personalizada aplicou |
| Faturas | Nome do cartão em consolidadas e stubs |

### Critérios de aceite — Fase 0.3.6-B

| # | Critério | Status |
|---|----------|--------|
| 1–7 | Limites e vínculos nos 4 cartões | ✅ |
| 8–10 | Faturas/compras/parcelas vinculadas | ✅ |
| 11 | Revisão efetiva no filtro | ✅ |
| 12–13 | BMI/Protev/Pan fora de candidatos | ✅ |
| 14–15 | Sem Firebase/persistência | ✅ |

---

## Fase 0.3.6-C — Snapshot completo e conciliação correta de faturas

**Data:** 15/06/2026 | **Estado:** ✅ Concluída

### Problema corrigido

A aba Cartões exibia `Usado: —` / `Disponível: —` quando o snapshot local não batia o mês do `periodEnd` ou só aplicava `limitCents`. A aba Faturas somava transações fora do escopo (outras competências, parcelas futuras, pagamentos), gerando diferenças falsas. Contadores de recorrência divergiam entre resumo (17) e badge da aba (9). Cartões sem `last4` real apareciam como `···0000`.

### Correções

| Área | Correção |
|------|----------|
| Snapshot merge | `mergeSnapshotOntoCard` expõe `limitCents`, `usedCents`, `availableCents`, `usagePercent`, `snapshotSource`, `snapshotMonth`, `snapshotDate` |
| Fallback mês | `resolveCardSnapshot` tenta mês do período e faz fallback para qualquer mês do mesmo cartão |
| Consistência | Valida `used + available ≈ limit`; exibe “Snapshot consistente” ou aviso |
| Aba Cartões | Limite, usado, disponível, % usado e fonte do snapshot obrigatórios |
| `last4` | Placeholder `0000` oculto; exibe “final não informado” quando ausente |
| Conciliação | `buildInvoiceReconciliation(invoice, transactions, context)` — escopo por `invoiceExternalRef`, competência, exclusão de pagamento/stub/saldo credor/parcelas futuras |
| Mercado Pago | Saldo credor R$ 7,49 não gera alerta falso; `amountDueCents: 0` OK |
| Recorrências | Contadores: JSON / regra pessoal / candidatas / total; badge alinhado ao total |

### Valores esperados (snapshot local)

| Cartão | Limite | Usado | Disponível |
|--------|--------|-------|------------|
| BB Platinum | R$ 10.000,00 | R$ 8.152,00 | R$ 1.848,00 |
| Nubank | R$ 12.450,00 | R$ 10.606,00 | R$ 1.844,00 |
| Porto | R$ 16.200,00 | R$ 14.092,03 | R$ 2.107,97 |
| Mercado Pago | R$ 500,00 | R$ 364,97 | R$ 135,03 |

### Critérios de aceite — Fase 0.3.6-C

| # | Critério | Status |
|---|----------|--------|
| 1 | 206 válidos / 0 inválidos | ✅ (validação local) |
| 2–6 | Usado/disponível nos 4 cartões | ✅ |
| 7 | Sem `···0000` enganoso | ✅ |
| 8–9 | Faturas sem diferenças falsas; MP sem alerta credor | ✅ |
| 10 | Conciliação parcial quando escopo incompleto | ✅ |
| 11 | Contadores de recorrência consistentes/explicados | ✅ |
| 12–14 | Sem persistência, Firebase, vazamento | ✅ |
