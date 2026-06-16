# Roadmap — Controle Financeiro Mensal

## Visão

App web premium para controle financeiro pessoal mensal, com previsibilidade (recorrências, parcelas, projeção) e importação rápida via JSON.

---

## Fase 0 — Fundação ✅ (atual)

**Objetivo:** Estrutura estática, documentação, schema, shell visual.

- [x] Estrutura de pastas GitHub Pages
- [x] Hash router e páginas placeholder
- [x] CSS premium responsivo
- [x] Schema `cfm.import.v1` + exemplo sanitizado
- [x] Modelo RTDB documentado
- [x] Regras RTDB rascunho seguro
- [x] Documentação completa

**Entrega:** Repositório abre localmente; navegação funciona; zero persistência.

---

## Fase 1 — Auth + RTDB mínimo

**Objetivo:** Usuário autenticado com dados isolados por uid.

- [ ] Firebase Auth (login/logout)
- [ ] Inicialização SDK com `config.js`
- [ ] Leitura/escrita em `/users/{uid}/profile`
- [ ] Persistência de importação validada
- [ ] Refinar regras RTDB + auditoria AppSec
- [ ] Estados: loading, erro, não autenticado

**Critério de done:** Importar JSON logado grava no RTDB; outro uid não acessa.

---

## Fase 2 — CRUD essencial

**Objetivo:** Operações manuais do dia a dia.

- [ ] Contas bancárias (listar, criar, editar, arquivar)
- [ ] Transações (entrada/saída/neutral)
- [ ] Competência mensal (`YYYY-MM`)
- [ ] Dashboard com totais reais do mês
- [ ] Histórico mensal navegável

---

## Fase 3 — Cartões e faturas

**Objetivo:** Ciclo de cartão de crédito completo.

- [ ] Cadastro de cartões (limite, fechamento, vencimento)
- [ ] Faturas por competência
- [ ] Parcelas (`installmentPlans`)
- [ ] Vínculo transação ↔ cartão/fatura

---

## Fase 4 — Recorrências e previsão

**Objetivo:** Despesas fixas e visão futura.

- [ ] Regras recorrentes (`recurringRules`)
- [ ] Geração automática de lançamentos previstos
- [ ] Projeção 3–6 meses no dashboard
- [ ] Alertas de vencimento

---

## Fase 5 — Importação avançada

**Objetivo:** Fluxo robusto de ingestão.

- [ ] Preview diff antes de gravar
- [ ] Merge/review (`review` block)
- [ ] Dedupe por `source.rawHash`
- [ ] Export JSON do mês

---

## Fase 6 — Polish e produção

**Objetivo:** Qualidade de produto.

- [ ] QA checklist completo
- [ ] Deploy GitHub Pages documentado
- [ ] Performance (leituras RTDB indexadas por mês)
- [ ] Acessibilidade WCAG básica
- [ ] PWA opcional (cache shell)

---

## Fora do roadmap imediato

- Parser de PDF/OFX
- Supabase
- Backend server-side com segredos
- App mobile nativo
- Multi-usuário / compartilhamento familiar
