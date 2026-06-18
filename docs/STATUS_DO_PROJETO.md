# Status do Projeto — Controle Financeiro Mensal

**Projeto:** Controle Financeiro Mensal (CFM)  
**Última atualização:** 17 de junho de 2026  
**Fase concluída:** Fase 0.6.0 — Dashboard financeiro operacional  
**Próxima fase:** A definir (CRUD manual / Firebase)

---

## Estado atual

Fase **0.6.0** concluída: dashboard operacional mensal com seletor de competência, KPIs, vencimentos, cartões em atenção e maiores saídas — sobre importação idempotente e read model local.

## Concluído

- Importador JSON validado e polido visualmente
- Modais internos do projeto (sem `alert`/`confirm`/`prompt`)
- Persistência local de lote importado
- Dashboard operacional mensal (KPIs, competência, alertas leves)
- Cartões com dados reais
- Histórico mensal com dados reais
- Reimportação idempotente
- Bloqueio de JSON antigo/sobreposto/inseguro
- Proteção contra duplicidade de lançamentos, cartões, faturas, parcelas e recorrências

## Decisão técnica

A expansão de conciliação visual da **Fase 0.4** está **congelada** para evitar overengineering. Próximo foco: tornar o app útil como **controle financeiro mensal** (local, sem Firebase nesta etapa).

## Próxima fase

CRUD manual de lançamentos e/ou integração Firebase — fora do escopo da 0.6.

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

**Pós-Fase 0.6.0** — CRUD manual de lançamentos ou integração Firebase/Auth, após validação manual do dashboard operacional com JSON real.

*Firebase / Auth / RTDB permanecem fora do escopo até decisão explícita de produto.*

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

### Refinamentos (contrato canônico)

| Área | Correção |
|------|----------|
| `rawHash` | Apenas `sha256:<64 hex>`; legível → `canonicalFingerprint`/`rawFingerprint` |
| `recurringRules` | Formato único com `expectedAmountCents`, `categoryLabel`, `frequency` |
| Conciliação | `invoiceChargesCents` vs `invoicePaymentsCents`; `statementSummary` |
| Mercado Pago | Pagamento histórico (abril) não contamina fatura maio credora |
| Airbnb | Parcela 2/6 vinculada ao plano por merchant + valor próximo |
| Revisão | Contadores bruto vs efetivo; redução por regras explicada |
| UI | Sem exibir hash/fingerprint; escape em todos os campos JSON |

---

## Fase 0.3.6-D — Estabilização final do importador (pré-Firebase)

**Data:** 15/06/2026 | **Estado:** ✅ Concluída

**Arquivo canônico de validação:** `cfm_import_v1_cardsnapshots.json` (local, não versionado)

**Próxima fase bloqueada:** Firebase / Auth / RTDB — só após todos os critérios abaixo passarem com o JSON canônico.

### Correções

| Área | Correção |
|------|----------|
| Conciliação Nubank | Tolerância 5¢; mensagem “Conciliação explicada por pagamento/crédito”; sem alerta amarelo quando explicável |
| Banco Pan | Excluído de Semelhanças; visível em Financiamentos/Parcelamentos e Recorrências |
| Recorrências | Deduplicação por `normalizedKey`; badges múltiplas origens; total = itens únicos |
| Revisão | `rawReviewCount` / `effectiveReviewCount` / `importantReviewCount` / `suggestionCount`; aba alinhada |
| Hash | `badRawHashCount = 0` após normalização; teste `scripts/test-phase-036d.js` |

### Critérios de aceite — Fase 0.3.6-D

| # | Critério | Status |
|---|----------|--------|
| 1 | 206 válidos / 0 inválidos (`cfm_import_v1_cardsnapshots.json`) | ✅ (validação local) |
| 2 | 4 cartões snapshot consistente | ✅ |
| 3 | MP credor R$ 7,49 sem alerta falso | ✅ |
| 4 | Nubank sem alerta se diferença explicada por pagamento/crédito | ✅ |
| 5 | Banco Pan fora de Semelhanças | ✅ |
| 6 | Recorrências sem duplicação visual | ✅ |
| 7 | `badRawHashCount = 0` | ✅ |
| 8 | Console limpo; nada persistido; Firebase ausente | ✅ |

---

## Fase 0.3.6-E — Estabilização final: cartões, faturas e confirmação zero

**Data:** 16/06/2026 | **Estado:** ✅ Concluída

**Arquivo canônico de validação:** `cfm_import_v1_cardsnapshots.json` (local, não versionado)

### Correções

| Área | Correção |
|------|----------|
| Snapshots | `payload.cardSnapshots` prioritário sobre overlay local; `cards[]` só cadastro estrutural |
| Snapshot ausente | Exibe “snapshot ausente”, nunca R$ 0,00 fictício |
| Conciliação | `invoiceChargesCents`, `invoicePaymentsCreditsCents`, `settlementPaymentsCents`, `creditBalanceCents` separados |
| Status fatura | `consistent`, `explained_by_payment`, `partial`, `credit_balance`, `requires_review` |
| `hasReconciliationGap` | Só quando diferença não explicada (tolerância 5¢) |
| Revisão | Stubs informativos; transferência mesma titularidade auto-resolvida; `blockingConfirmCount = 0` |
| Contadores | `blockingConfirmCount`, `blockingSimilarityCount`, `informationalSimilarityCount`, etc. |
| Teste | `node scripts/test-phase-036e.js` |

### Valores esperados (cardSnapshots no JSON)

| Cartão | Limite | Usado | Disponível |
|--------|--------|-------|------------|
| BB/Ourocard | R$ 10.000,00 | R$ 8.152,00 | R$ 1.848,00 |
| Mercado Pago | R$ 500,00 | R$ 364,97 | R$ 135,03 |
| Porto | R$ 16.200,00 | R$ 14.092,03 | R$ 2.107,97 |
| Nubank | R$ 12.450,00 | R$ 10.606,00 | R$ 1.844,00 |

### Critérios de aceite — Fase 0.3.6-E

| # | Critério | Status |
|---|----------|--------|
| 1 | 206 válidos / 0 inválidos | ✅ (validação local) |
| 2 | `badRawHashCount = 0` | ✅ |
| 3 | 4 cartões com limite/usado/disponível corretos | ✅ |
| 4 | MP credor R$ 7,49 sem alerta falso | ✅ |
| 5 | Porto/Nubank sem alerta se diferença explicada | ✅ |
| 6 | Itens para confirmar = 0 (stubs/sugestões/auto-resolvidos) | ✅ |
| 7 | Semelhanças: 0 bloqueantes, informativas separadas | ✅ |
| 8 | Reimportação: 206 já importados, 0 duplicatas | ✅ (simulação local) |
| 9 | Console limpo; sem persistência/Firebase | ✅ |
| 10 | Documentação e QA atualizados | ✅ |

---

## Fase 0.3.6-F — Estabilização final: zero bloqueios e conciliação correta

**Data:** 16/06/2026 | **Estado:** ✅ Concluída

**Arquivo canônico:** `cfm_import_v1_cardsnapshots.json`

### Correções

| Área | Correção |
|------|----------|
| Badge cartões | `normalizeSnapshotSourceKey` + `getSnapshotSourceLabel` — fim do `[object Object]` quando `source` é objeto |
| Conciliação | Liquidação bancária (`settlementPaymentsCents`) exibida à parte, **nunca** entra no delta |
| Nubank | Encargos R$ 752,45 vs total R$ 752,46 (1¢) → `consistent`, sem alerta amarelo |
| Porto / MP | Sem gap falso; saldo credor preservado |
| Ourocard | `partial` informativo, não bloqueante |
| Contadores | Label “Classif. por regra pessoal” alinhado a `personalRuleAppliedCount` |
| Testes | `node scripts/test-phase-036f.js` |

### Critérios de aceite — Fase 0.3.6-F

| # | Critério | Status |
|---|----------|--------|
| 1 | Nenhum `[object Object]` na aba Cartões | ✅ |
| 2 | Nubank/Porto/MP sem alerta falso de conciliação | ✅ |
| 3 | Liquidação bancária separada dos encargos | ✅ |
| 4 | `blockingConfirmCount = 0` (JSON canônico) | ✅ (testes + validação local) |
| 5 | `test-phase-036d/e/f.js` ALL PASS | ✅ |
| 6 | Sem Firebase/persistência | ✅ |

---

## Fase 0.3.7 — Responsividade premium do importador

**Data:** 16/06/2026 | **Estado:** ✅ Concluída

**Escopo:** apenas UI/CSS/markup da tela `#/importar` — lógica financeira da 0.3.6-F intacta.

### Entregas

| Área | Melhoria |
|------|----------|
| Layout shell | Breakpoints 1280 / 1024 / 768 / 380; sidebar drawer &lt;768px; tokens `--importer-padding`, `--touch-target` |
| Abas | Scroll horizontal com snap, fade lateral, altura mínima 44px |
| KPIs | Grade essencial (7 métricas) + `<details>` métricas técnicas |
| Cartões / faturas | Grid 1→2→3 colunas; valores sem ellipsis |
| Transações | Layout card no mobile; filtros empilhados; checkbox com área de toque |
| Ações | Barra sticky no mobile com safe-area; confirmar continua desabilitado |
| Acessibilidade | Foco visível; `esc()` preservado |

### Critérios de aceite — Fase 0.3.7

| # | Critério | Status |
|---|----------|--------|
| 1 | Sem scroll horizontal no body (320–1440px) | ✅ (CSS) |
| 2 | Tabs scrolláveis sem cortar “Privacidade” | ✅ |
| 3 | Transações legíveis em mobile (card layout) | ✅ |
| 4 | Valores financeiros sem truncamento | ✅ |
| 5 | Lógica 0.3.6-F intacta; testes d/e/f ALL PASS | ✅ |
| 6 | Nenhuma persistência/Firebase adicionada | ✅ |

---

## Fase 0.3.8 — UX final do importador (usuário)

**Data:** 16/06/2026 | **Estado:** ✅ Concluída

**Escopo:** hierarquia visual, largura útil, simplificação da UI, modo técnico recolhido — lógica financeira 0.3.6-F intacta.

### Entregas

| Área | Melhoria |
|------|----------|
| Largura | `app-main` até 96rem; containers `min-width: 0`; sem coluna estreita |
| Abas | Labels curtas (Lançamentos, Revisar, Observações, Segurança); scroll + fade |
| Resumo | KPIs de usuário (status, lançamentos, pendências, cartões, faturas, parcelas, recorrências, sugestões) |
| Modo técnico | `<details>` “Detalhes técnicos da validação” fechado por padrão |
| Rodapé idle | Schema, campos canônicos e avisos de dev removidos da visão principal |
| Abas | Estados positivos em Revisar; observações informativas; checklist simples em Segurança |

### Critérios de aceite — Fase 0.3.8

| # | Critério | Status |
|---|----------|--------|
| 1 | UI orientada ao usuário final (sem ruído técnico na visão principal) | ✅ |
| 2 | Aba “Segurança” sempre navegável | ✅ |
| 3 | Resumo responde “posso importar com segurança?” | ✅ |
| 4 | Lógica 0.3.6-F intacta; testes d/e/f ALL PASS | ✅ |
| 5 | Nenhuma persistência/Firebase/gerador JSON alterado | ✅ |

---

## Fase 0.3.9 — Contrato canônico Importador + Gerador JSON

**Data:** 16/06/2026 | **Estado:** ✅ Concluída

**Objetivo:** Camada testável e auditável do contrato `cfm.import.v1` para impedir divergências entre Gerador JSON e Importador.

### Arquivos criados/alterados

| Arquivo | Papel |
|---------|-------|
| `docs/CONTRATO_IMPORTACAO_CFM_V1.md` | Contrato normativo + invariantes |
| `src/schemas/import.contract.js` | Validação de contrato reutilizável |
| `scripts/validate-import-contract.js` | CLI de regressão + relatório Gerador JSON |
| `data/sample-import.cfm.v1.json` | Fixture sintética segura atualizada |
| `docs/SCHEMA_IMPORTACAO_JSON.md` | Link para contrato e CLI |
| `docs/QA_CHECKLIST.md` | Seção Fase 0.3.9 |

### Riscos mitigados

| Risco | Mitigação |
|-------|-----------|
| Gerador emite campos obsoletos (`cadence`, `amountCents` em recorrência) | Bloqueio/avisos no contrato + seção de correções |
| `cardSnapshots[].source` como objeto | Erro bloqueante com fix explícito |
| Snapshots inconsistentes (used+available≠limit) | Validação aritmética ±1¢ |
| rawHash legível | `badRawHashCount` + normalização documentada |
| JSON real no Git | Continua gitignored; fixture sintética versionada |
| Regressão financeira | Testes 036d/e/f + `--canonical` opcional |

### Critérios de aceite — Fase 0.3.9

| # | Critério | Status |
|---|----------|--------|
| 1 | Documento de contrato completo | ✅ |
| 2 | Script CLI sem dependências npm | ✅ |
| 3 | Fixture sintética segura | ✅ |
| 4 | UI 0.3.8 preservada | ✅ |
| 5 | Testes 036d/e/f ALL PASS | ✅ |
| 6 | Nenhuma persistência/Firebase | ✅ |

### Próximos passos

1. Rodar `validate-import-contract.js` no JSON canônico local antes de cada release do Gerador JSON.
2. Corrigir divergências listadas em **CORREÇÕES NECESSÁRIAS NO GERADOR JSON**.
3. **Bloqueio explícito:** Firebase Auth + RTDB só após contrato PASS no arquivo de produção.

---

## Fase 0.3.10 — Interpretação Nubank v2

**Data:** 16/06/2026 | **Estado:** ✅ Concluída

**Objetivo:** Refinar governança visual e semântica do importador para JSON Nubank v2 (PDF+CSV+OFX), sem alterar schema, gerador, Firebase ou persistência. Compatível com JSON BB aprovado.

### Arquivos principais

| Arquivo | Papel |
|---------|-------|
| `src/utils/import-semantics.js` | Regras centralizadas: fatura, reconciliação, tolerância, liquidação, parcelas, categorias |
| `src/utils/merchant-classification-rules.js` | Dicionário local de estabelecimentos (F1TV, T360graus, etc.) |
| `src/services/card-snapshot.service.js` | Agregação numérica; consome helpers sem regras próprias de fatura |
| `src/pages/importer.page.js` | UI: badges de liquidação, observações recolhíveis, contadores corretos |
| `scripts/test-phase-nubank-v2.js` | Regressão automatizada Nubank v2 + strings de UI |
| `docs/QA_CHECKLIST.md` | Checklist manual Fase 0.3.10 |

### Correções entregues

| Área | Resultado |
|------|-----------|
| Faturas | Junho **Conciliada**; Julho **Aberta/provisória**; centavos informativos |
| Observações | `0 bloqueantes · N informativas`; parcelas em `<details>` |
| Lançamentos | Liquidação com badge neutro; não soma em compras do cartão |
| Cartões | Snapshot Nubank limite/usado/disponível; aliases recolhíveis |
| Categorias | `Outros` → sugestão informativa, nunca bloqueio |

### Critérios de aceite — Fase 0.3.10

| # | Critério | Status |
|---|----------|--------|
| 1 | Badge `Fase 0.3.10 · Interpretação Nubank v2` | ✅ |
| 2 | Semântica centralizada em `import-semantics.js` | ✅ |
| 3 | `test-phase-nubank-v2.js` ALL PASS | ✅ |
| 4 | Regressão BB (`036d/e/f`) ALL PASS | ✅ |
| 5 | UI 0.3.8 preservada; sem persistência/Firebase | ✅ |
| 6 | Observações: 0 bloqueantes; recorrências = atenção | ✅ |
| 7 | Card Nubank sem “final não informado” no título | ✅ |

### Fechamento 0.3.10

Fase fechada após correção da contagem real de bloqueantes, recorrências candidatas como atenção (não bloqueio), observações informativas recolhidas, card Nubank limpo, **regras locais de classificação por estabelecimento** (`merchant-classification-rules.js`) e **parcelas relacionadas consistentes sem revisão manual**.

| Refinamento | Detalhe |
|-------------|---------|
| Merchant rules | F1TV, T360graus, Ellisimports, Epidemic Sound, LL Comunidade |
| Parcelas | Heurística nome+valor+meses+indício parcela → informativo recolhido |
| Categorias | Estabelecimentos conhecidos saem de “Categoria a revisar” |

### Próximos passos (0.3.10)

1. Validar manualmente `cfm_import_v1_nubank_pdf_csv_ofx_jun_jul_v2.json` (arquivo local).
2. Revalidar `cfm_import_v1_bb_final_sem_pendencias.json` antes de release.

---

## Fase 0.3.11 — Semântica multi-cartões (Porto v1.1)

**Data:** 16/06/2026 | **Estado:** ✅ Concluída

**Objetivo:** Corrigir interpretação visual/semântica para JSON Porto v1.1 (créditos internos vs liquidação externa, pagamentos `flow: in`, recorrência candidata), mantendo regressão BB/Nubank.

### Helpers centralizados (`import-semantics.js`)

| Helper | Papel |
|--------|-------|
| `getInvoiceDisplayAmounts` | Valor principal, encargos, créditos internos, liquidação externa |
| `getInvoiceCreditLabel` / `getInvoiceSettlementLabel` | Rótulos corretos na aba Faturas |
| `getInvoicePaymentBreakdownRows` | Detalhe pagamento/estornos (julho) |
| `isInvoiceInternalCreditTransaction` | Pagamento Porto `flow: in` |
| `isExternalInvoiceSettlementTransaction` | Liquidação Nubank/externa `flow: out` |
| `getRecurringRuleBadges` | Candidata ≠ Ativa |

### Critérios de aceite — Fase 0.3.11

| # | Critério | Status |
|---|----------|--------|
| 1 | Badge `Fase 0.3.11 · Semântica multi-cartões` | ✅ |
| 2 | Porto junho: créditos internos ≠ liquidação bancária | ✅ |
| 3 | Porto julho: aberta/provisória; breakdown créditos | ✅ |
| 4 | `credit_card_payment flow:in` → Crédito na fatura | ✅ |
| 5 | Recorrência `status:candidate` → Candidata/Atenção | ✅ |
| 6 | `test-phase-porto-v1-1.js` + Nubank + BB ALL PASS | ✅ |

**Teste:** `node scripts/test-phase-porto-v1-1.js` · JSON manual: `cfm_import_v1_porto_pdf_prints_v1_1.json` (local)

---

## Fase 0.3.12 — Fechamento do importador consolidado

**Data:** 17/06/2026 | **Estado:** ✅ Concluída — **Fase 0.3 encerrada**

**Objetivo:** Fechamento técnico/cosmético do importador consolidado, sem alterar contrato JSON, schema, gerador ou lógica validada de faturas/cartões/recorrências.

### Correção principal

| Área | Detalhe |
|------|---------|
| Badge recorrência ativa | `getRecurringRuleBadges` + renderização com classe base `status-chip` → pill verde **ATIVA** alinhada a `IMPORTADA DO JSON`, `CANDIDATA`, `ATENÇÃO`, `SAÍDA` |
| Badge candidata/atencão | Classe base `confidence-badge` restaurada no helper `recurringBadgeHtml` |
| Layout Recorrências | `flex-wrap` no header da linha para mobile/tablet sem scroll horizontal |

### Arquivos alterados

| Arquivo | Papel |
|---------|-------|
| `src/pages/importer.page.js` | Helper `recurringBadgeHtml`; aba Recorrências |
| `assets/css/pages.css` | Header recorrência responsivo |
| `index.html` | Badge `Fase 0.3.12 · Fechamento do importador` |

### Validação consolidada (`cfm_20260617_1949.json` — manual, local)

| Critério | Resultado esperado |
|----------|-------------------|
| Pendências bloqueantes | 0 |
| Atenções em Observações | 0 |
| Informativos | 27 |
| Cartões | 4 |
| Faturas | 9 |
| Lançamentos | 245 |
| Parcelas | 60 |
| Recorrências confirmadas | Apple/iCloud, Google/Gmail via Apple, Clube iFood — **ATIVA** + **IMPORTADA DO JSON**; não candidatas em Observações |

### Critérios de aceite — Fase 0.3.12

| # | Critério | Status |
|---|----------|--------|
| 1 | Badge `Fase 0.3.12 · Fechamento do importador` | ✅ |
| 2 | Recorrências ativas com pill **ATIVA** (verde, caixa alta) | ✅ |
| 3 | Candidatas legítimas: **CANDIDATA** + **ATENÇÃO** + “Não bloqueia a importação” | ✅ |
| 4 | Observações: 0 bloqueantes · 0 atenções · informativos legítimos | ✅ |
| 5 | Regressão: Porto, Nubank, BB, recorrências confirmadas | ✅ |

**Testes automatizados:** `test-phase-porto-v1-1.js`, `test-phase-nubank-v2.js`, `test-phase-recurring-confirmed.js`, `test-phase-036d/e/f.js`

---

## Fase 0.3.13 — Polimento UX do importador

**Data:** 17/06/2026 | **Estado:** ✅ Implementada — aguardando validação visual final

**Objetivo:** Refinar a interface para usuário final: ocultar ruído técnico/backend, comparar lançamentos a partir de Observações e marcar observações como conferidas (estado local).

### Correções

| # | Correção | Detalhe |
|---|----------|---------|
| 1 | Faturas stub/referência | Removidas da aba Faturas; listadas em **Detalhes técnicos da validação**; contador da aba = faturas reais (`invoicesTotal` nos detalhes) |
| 2 | Observações acionáveis | Links `#208`/`#215` clicáveis; **Comparar lançamentos** → aba Lançamentos com filtro + destaque + banner **Limpar filtro**; refs estáveis (`id`/`externalRef`/`idx:`) |
| 3 | Conferido local | **Marcar como conferido** remove da lista principal; badge da aba atualiza; `sessionStorage` por nome do arquivo |
| 4 | Ruído JSON | Removidos `IMPORTADA DO JSON`, `Origem: Importado do JSON` e IDs crus na UI principal; fatura em lançamentos → `Junho/2026` |
| 5 | Microcopy | Títulos/descrições de produto (ex.: *Compra semelhante encontrada*) |

### Arquivos alterados

| Arquivo | Papel |
|---------|-------|
| `src/utils/import-semantics.js` | `getTransactionStableRef`, `enrichObservationTransactionRefs`, `getObservationUiCopy`, `getInvoiceHumanLabel` |
| `src/services/import.service.js` | `stableRef`, `invoiceLabel`, contador `invoices` visível |
| `src/pages/importer.page.js` | Compare/dismiss, faturas, observações, abas Recorrências/Parcelas |
| `assets/css/pages.css` | Banner comparação, links, destaque, botões compactos |
| `index.html` | Badge `Fase 0.3.13 · Polimento do importador` |

### Critérios de aceite — Fase 0.3.13

| # | Critério | Status |
|---|----------|--------|
| 1 | Aba Faturas sem stub/referência visível | ✅ |
| 2 | Comparar lançamentos + limpar filtro | ✅ |
| 3 | Marcar como conferido (local, não JSON) | ✅ |
| 4 | UI principal sem “Importado do JSON” / IDs crus | ✅ |
| 5 | Regressão automatizada | ✅ |

### Encerramento da Fase 0.3

Após validação manual com `cfm_20260617_1949.json`, a **Fase 0.3** do importador pode ser considerada **encerrada**. Nenhuma persistência real, Firebase ou conciliação cruzada foi iniciada.

### Próxima fase recomendada

**Fase 0.4 — Conciliação cruzada inteligente**

---

## Fase 0.3.14 — Decisão e valores do importador

**Data:** 17/06/2026 | **Estado:** ✅ Implementada — aguardando validação visual final

**Objetivo:** Corrigir semântica visual de faturas pagas, comparação inteligente de observações, supressão de parcelas em compras repetidas e recorrências sem valor — sem alterar JSON/schema/gerador.

### Correções

| # | Correção | Detalhe |
|---|----------|---------|
| 1 | Faturas pagas | `getInvoicePrimaryDisplay`: total real como valor principal; `R$ 0,00` só como saldo final secundário |
| 2 | Comparação inteligente | Painel com 5 decisões; cards enriquecidos (data, fatura, cartão, parcela, categoria); duplicata com manter/ignorar (estado local) |
| 3 | Parcelas ≠ compra repetida | Heurística ampliada em `validators` + `shouldSuppressRepeatedPurchasePair` |
| 4 | Recorrências com valor | `getRecurringDisplayAmount`; fallback `Valor a confirmar`; remove `Confiança: 100` da UI |

### Testes

`node scripts/test-phase-0.3.14.js` + regressão 0.3.11–0.3.13

### Encerramento Fase 0.3

Após validação manual com `cfm_20260617_1949.json`, a Fase 0.3 pode ser encerrada. Próxima: **Fase 0.4 — Conciliação cruzada inteligente** (sem iniciar nesta etapa).

---

## Fase 0.3.15 — Ações contextuais do importador

**Data:** 17/06/2026 | **Estado:** ✅ Implementada — aguardando validação visual final

**Objetivo:** Separar ações do painel de comparação conforme o tipo real da observação (`contextKind`), com filtro de grupo de parcelas na aba Parcelas — sem alterar JSON/schema/gerador/conciliação cruzada.

### Correções

| # | Correção | Detalhe |
|---|----------|---------|
| 1 | `getObservationContextKind` | Campo semântico `contextKind` + aliases (`installment_match`, etc.) |
| 2 | Compras semelhantes | Painel **Comparando compras semelhantes**; botões só de compra/duplicata |
| 3 | Parcelas relacionadas | Painel **Conferindo parcelas relacionadas** na aba Parcelas |
| 4 | Filtro de grupo | `installmentCompareFilter` com refs estáveis (`plan:`, `externalRef`, chave derivada) |
| 5 | Microcopy Observações | Botões **Comparar compras** vs **Ver grupo de parcelas** por contexto |

### Testes

`node scripts/test-phase-0.3.15.js` + regressão 0.3.14 e fases anteriores

### Encerramento Fase 0.3

Após validação manual com `cfm_20260617_1949.json`, a Fase 0.3 pode ser encerrada. Próxima: **Fase 0.4 — Conciliação cruzada inteligente**.

---

## Fase 0.3.16 — Controle de parcelas relacionadas

**Data:** 17/06/2026 | **Estado:** ✅ Implementada — aguardando validação visual final

**Objetivo:** Corrigir filtro zero na aba Parcelas e separar controle global (todas as observações) vs controle por par (duas transações) — sem alterar JSON/schema/gerador.

### Causa raiz corrigida

O filtro de grupo (`groupKey` / `planMatchesInstallmentGroupFilter`) só buscava planos consolidados; observações criadas por par de transações geravam `groupKey` tipo `txset:…` sem correspondência em `allInstallmentPlans` → **0 parcelas**.

### Correções

| # | Correção | Detalhe |
|---|----------|---------|
| 1 | Botão global | **Ver todas as parcelas relacionadas** na seção Observações |
| 2 | Filtro global | `installmentObservationFilter` (`mode: all_related_observations`) |
| 3 | Fallback | Lista derivada das observações quando planos não batem |
| 4 | Por card | **Comparar este par** → Lançamentos com painel de par de parcelas |
| 5 | Refs estáveis | `getStableTransactionRef` + `matchTransactionRef` unificados |

### Testes

`node scripts/test-phase-0.3.16.js` + regressão 0.3.15 e anteriores

---

## Fase 0.3.17 — Conclusão individual de grupos de parcelas

**Data:** 17/06/2026 | **Estado:** ✅ Implementada — aguardando validação visual final

**Objetivo:** Permitir marcar cada grupo do filtro global como concluído individualmente, sem obrigar **Marcar todas como conferidas**.

### Correções

| # | Correção | Detalhe |
|---|----------|---------|
| 1 | Grupos unificados | `buildInstallmentDisplayGroups` (plano ou observação) |
| 2 | Ação por grupo | **Marcar grupo como concluído** em cada card |
| 3 | Persistência | `dismissedObservations[pairKey]` via `dismissInstallmentGroup` |
| 4 | Contadores | Grupos/ocorrências pendentes atualizados ao concluir |
| 5 | Estado vazio | Mensagem elegante quando todos os grupos foram concluídos |
| 6 | Feedback | Banner discreto *Grupo marcado como concluído.* |

### Testes

`node scripts/test-phase-0.3.17.js` + regressão 0.3.16 e anteriores

---

## Fase 0.3.18 — Modais internos do projeto

**Data:** 17/06/2026 | **Estado:** ✅ Implementada — aguardando validação visual final

**Objetivo:** Eliminar `window.confirm`/`alert`/`prompt` nativos e padronizar decisões do usuário via modal interno acessível.

### Regra permanente

Nenhum popup nativo do navegador em código de produção. Toda confirmação usa `CFM.openAppConfirm`.

### Implementação

| Item | Detalhe |
|------|---------|
| Componente | `src/components/app-confirm.js` → `CFM.openAppConfirm(options)` |
| Estilo | `assets/css/components.css` — overlay, card, tom `warning` |
| Substituição | `Marcar todas como conferidas` no importador |

### Testes

`node scripts/test-phase-0.3.18.js` (varredura anti-native + regressão)

---

## Fase 0.3.19 — Polimento visual final do importador

**Data:** 17/06/2026 | **Estado:** ✅ Implementada — aguardando validação visual final

**Objetivo:** Elevar acabamento visual do importador para sensação de produto financeiro premium, **sem alterar lógica, schema JSON, contadores ou comportamento funcional**.

### Escopo

| Área | Refino |
|------|--------|
| Tokens CSS | Aliases semânticos (`--surface-raised`, `--accent`, `--focus-ring`, etc.) |
| Layout | Container, header, aviso local, card do arquivo |
| Tabs | Estado ativo, badges, hover/focus |
| Resumo / cartões / faturas | Hierarquia, sombras leves, barras de utilização |
| Lançamentos / comparação | Cards, destaque intencional |
| Observações / parcelas | Checklist inteligente, painel de controle |
| Recorrências | Ativas vs candidatas visualmente distintas |
| Modais | Espaçamento, overlay, animações discretas |
| Acessibilidade | `focus-visible`, `prefers-reduced-motion` |

### Testes

`node scripts/test-phase-0.3.18.js` + suite 0.3.17 → 0.3.14 + porto/nubank/recurring/036d–f (regressão funcional inalterada)

---

## Fase 0.3.20 — Formatação monetária e datas

**Data:** 17/06/2026 | **Estado:** ✅ Implementada

**Objetivo:** Garantir moeda sempre com 2 casas decimais e datas em PT-BR na UI do importador, **sem alterar cálculos, schema ou lógica**.

### Helpers centralizados (`src/utils/formatters.js`)

| Helper | Função |
|--------|--------|
| `formatCurrencyBRL` | `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` — sempre 2 casas |
| `formatDateBR` | `Intl.DateTimeFormat('pt-BR')` — `dd/mm/aaaa` |
| `formatCompetenceBR` | `YYYY-MM` → `Junho/2026` |
| `formatDisplayDate` | Data ou competência conforme contexto |

### Testes

`node scripts/test-phase-0.3.20.js` + regressão completa 0.3.x

---

## Fase 0.4.0 — Base de conciliação cruzada inteligente

**Data:** 17/06/2026 | **Estado:** ✅ Base implementada — UI e decisões definitivas na 0.4.1+

**Objetivo:** Criar camada isolada e testável de conciliação cruzada **em memória**, sem alterar schema JSON, contadores da 0.3 ou comportamento final de importação.

### Módulo

`src/utils/import-reconciliation.js` → `CFM.importReconciliation`

| Helper | Função |
|--------|--------|
| `normalizeReconciliationText` | Normalização de descrições para matching |
| `getMoneyToleranceCents` | Tolerância (delega `import-semantics`) |
| `isInvoicePaymentTransaction` | Pagamento/liquidação de fatura |
| `isCreditOrRefundTransaction` | Crédito interno, reembolso, saldo |
| `isLikelyInvoiceSettlement` | Settlement provável para fatura |
| `buildInvoiceSettlementCandidates` | Candidatos ranqueados com `reasonCodes` |
| `scoreInvoiceSettlementCandidate` | Score 0–100 explicável |
| `getInvoiceReconciliationStatus` | Status + mensagem + `blocking: false` |
| `buildReconciliationReport` | Relatório em memória (`report.reconciliationReport`) |

### Status internos

`matched` · `partial` · `open_provisional` · `credit_balance` · `reference_only` · `unmatched` · `needs_review`

### O que ainda NÃO foi implementado (próximas subfases)

- UI de conciliação no importador
- Marcação definitiva de vínculos
- Conciliação cruzada automática entre contas/cartões sem ref explícita
- Persistência Firebase

### Testes

`node scripts/test-phase-0.4.0.js` + regressão completa 0.3.x

---

## Fase 0.5.0 — Confirmação de importação e persistência local

**Data:** 17/06/2026 | **Estado:** ✅ Implementada

**Objetivo:** Tornar o importador utilizável — ao confirmar, salvar dados aprovados em `localStorage` para uso nas próximas telas, **sem Firebase, IndexedDB ou UI de conciliação 0.4**.

### Módulos

| Arquivo | Função |
|---------|--------|
| `src/utils/import-persistence.js` | `buildBatchSignature`, `buildImportBatchPayload` (filtra ignoradas, normaliza entidades) |
| `src/services/local-store.service.js` | `loadAppData`, `saveImportBatch`, `replaceImportBatch`, `getActiveFinancialData` |
| `src/pages/importer.page.js` | Habilita confirmar, modal de duplicidade, feedback de sucesso |
| `src/pages/dashboard.page.js` | Contadores básicos do lote ativo (leitura simples) |

### Regras de produto

- Confirmar só com arquivo válido e **sem pendências bloqueantes**
- Transações ignoradas na revisão **não** entram como lançamentos ativos
- Duplicidade por assinatura (`fileName` + `rawHash` + `generatedAt` + período + `importBatchId`) → modal interno **Cancelar / Substituir importação**
- **Limpar importação** limpa apenas a prévia em análise; não apaga dados confirmados
- Nenhum `alert` / `confirm` / `prompt` nativo

### Modelo local (`cfm:v1:appData`)

`importBatches`, `cards`, `invoices`, `transactions`, `installmentPlans`, `recurringRules` — versão `cfm.local.v1`.

### Testes

`node scripts/test-phase-0.5.0.js` + regressão completa 0.4.0 e 0.3.x

---

## Fase 0.5.1 — Consumo dos dados importados nas páginas principais

**Data:** 17/06/2026 | **Estado:** ✅ Implementada

**Objetivo:** Corrigir integração entre `localStorage` e Dashboard, Cartões e Histórico — fonte única `localStoreService` + read model.

### Módulos

| Arquivo | Função |
|---------|--------|
| `src/services/local-store.service.js` | `getActiveFinancialData()` com `hasData`, `activeBatch`, `batches` e arrays normalizados |
| `src/services/financial-read-model.service.js` | Agregações: `enrichCards`, `buildMonthlyHistory`, `getFinancialReadModel` |
| `src/pages/dashboard.page.js` | Totais do mês (entradas/saídas/saldo), contadores reais |
| `src/pages/cards.page.js` | Lista cartões importados com limite/uso/disponível |
| `src/pages/history.page.js` | Meses por competência com totais (pagamentos de fatura excluídos) |

### Testes

`node scripts/test-phase-0.5.1.js` + regressão 0.5.0 e suite completa

---

## Fase 0.5.2 — Reimportação inteligente e importação incremental

**Data:** 17/06/2026 | **Estado:** ✅ Implementada

**Objetivo:** Evitar duplicidade na reimportação — detectar arquivo/lançamentos já salvos, importar somente ocorrências novas.

### Módulos

| Arquivo | Função |
|---------|--------|
| `src/utils/import-diff.js` | `analyzeImportDiff`, identidade de transações, `buildIncrementalDisplayReport` |
| `src/services/local-store.service.js` | `saveIncrementalImport`, merge seguro, dados consolidados |
| `src/utils/import-persistence.js` | `buildIncrementalImportPayload` |
| `src/pages/importer.page.js` | Modal “Arquivo já importado”, banner incremental, confirmação parcial |
| `src/components/app-confirm.js` | Modo `acknowledgeOnly` (botão “Entendi”) |

### Regras

- Mesmo arquivo ou mesmas transações → modal interno, nada salvo
- Lançamentos novos → modo incremental (UI filtrada + merge no store)
- Mesma identidade com valor alterado → `changed_existing` (informativo, sem sobrescrever)
- Pagamentos de fatura e entidades relacionadas mescladas sem duplicar

### Testes

`node scripts/test-phase-0.5.2.js` + regressão completa

---

## Fase 0.5.3 — Identidade semântica e bloqueio de importação legada

**Data:** 17/06/2026 | **Estado:** ✅ Implementada

**Objetivo:** Impedir duplicidade real ao importar JSON antigo ou parcialmente equivalente depois de um consolidado mais novo — deduplicação resiliente entre versões do gerador.

### Módulos

| Arquivo | Função |
|---------|--------|
| `src/utils/import-diff.js` | `parseLegacyRawHash`, `normalizeTransactionMerchant`, `normalizeCardIdentity`, `buildSemanticTransactionKey`, `compareTransactionIdentity`, `classifyImportCompatibility` |
| `src/utils/import-persistence.js` | Incremental salva apenas `safeNewTransactions` |
| `src/services/local-store.service.js` | Bloqueia `legacy_overlap` / `unsafe_legacy_import`; merge incremental seguro |
| `src/pages/importer.page.js` | Modal “Arquivo antigo já contemplado”, banner X novos / Y existentes / Z possíveis duplicidades, detalhes técnicos colapsados |

### Regras

- `rawHash` legível (`sha256:Banco do Brasil|…`) nunca tratado como hash criptográfico — usado como fingerprint semântico
- Equivalência de cartões antigos vs novos (BB ourocard 0000≈0040, Nubank multi≈credit, Porto 2128)
- `already_imported` por ref forte, hash real, fingerprint ou chave semântica
- `possible_duplicate` e `changed_existing` **não** importados automaticamente
- Arquivo legado sobreposto sem lançamentos seguros → modal “Arquivo antigo já contemplado”
- Confirmar incremental persiste somente `safeNewTransactions`

### Testes

`node scripts/test-phase-0.5.3.js` + regressão completa

---

## Fase 0.5.4 — Importação idempotente real e bloqueio de entidades legadas

**Data:** 17/06/2026 | **Estado:** ✅ Implementada

**Objetivo:** Impedir contaminação da base ao importar JSON antigo/sobreposto — deduplicação semântica de cartões, faturas, parcelas e recorrências; bloqueio de autosave em overlap legado.

### Módulos

| Arquivo | Função |
|---------|--------|
| `src/utils/import-diff.js` | Identidade semântica de entidades, `buildEntityResolution`, `legacy_overlap_blocked`, `requires_review`, `unsafe_legacy_candidate` |
| `src/utils/import-persistence.js` | Remapeamento de IDs equivalentes; `externalRef` persistido; incremental sem duplicar entidades |
| `src/services/local-store.service.js` | Bloqueio de save em overlap/revisão; merge incremental seguro |
| `src/services/financial-read-model.service.js` | Deduplicação defensiva de cartões por chave semântica |
| `src/pages/importer.page.js` | Banner bloqueado vs incremental seguro; confirmação desabilitada; revisão `changed_existing` |

### Regras

- JSON legado (`cfm_import_v1_cardsnapshots.json`) após consolidado → `legacy_overlap_blocked`, confirmação desabilitada, base intacta
- Incremental seguro só quando `safeIncremental` e sem conflitos pendentes
- `possible_duplicate`, `changed_existing` e `unsafe_legacy_candidate` nunca salvos automaticamente
- Cartões/faturas/planos/recorrências equivalentes remapeados, não duplicados
- Fingerprint legível (`sha256:Instituição|…`) distinguido de hash SHA-256 real

### Testes

`node scripts/test-phase-0.5.4.js` + regressão completa (usa fixtures locais se JSON real não estiver presente)

---

## Fase 0.6.0 — Dashboard financeiro operacional

**Data:** 17 de junho de 2026 | **Estado:** ✅ Concluída

**Objetivo:** Evoluir o Dashboard de resumo simples para visão mensal operacional sobre dados importados — sem alterar importador, schema JSON ou backend.

**Entregue:**

- Seletor de competência com meses disponíveis (`sessionStorage` + chips na UI)
- KPIs mensais: entradas, saídas, saldo, lançamentos, faturas abertas/pagas, recorrências, parcelas futuras
- Seções: Próximos vencimentos, Cartões em atenção, Maiores saídas do mês
- Funções puras no read model: `aggregateMonthSummary`, `getUpcomingDueItems`, `getAttentionCards`, `getTopExpenseGroups`, `getAvailableCompetenceMonths`, `buildDashboardOperationalView`
- Exclusão de pagamento de fatura nas saídas (sem dupla contagem)
- Estado vazio com CTA para importação; atalhos Cartões/Histórico
- CSS responsivo premium em `pages.css`

**Fora de escopo (respeitado):** Firebase, RTDB, importador, conciliação visual 0.4, CRUD manual.

**Depende de:** Fases 0.5.0–0.5.4.

### Testes

`node scripts/test-phase-0.6.0.js` + regressão completa (0.5.4, 0.5.x, 0.4.0, 0.3.x)

---
