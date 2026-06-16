# QA Checklist

Lista de verificação manual por fase.

---

## Fase 0 — Fundação

### Abertura local

- [ ] Abrir `index.html` no Chrome/Edge/Firefox (duplo clique)
- [ ] Página carrega sem erro no console
- [ ] CSS aplicado (tema escuro, sidebar visível)

### Navegação

- [ ] `#/dashboard` — dashboard placeholder
- [ ] `#/importar` — tela de importação
- [ ] `#/cartoes` — cartões placeholder
- [ ] `#/historico` — histórico placeholder
- [ ] Link nav ativo corresponde à rota
- [ ] Título do header atualiza por rota
- [ ] Hash inválido redireciona para dashboard

### Responsividade

- [ ] Desktop (≥1200px): sidebar fixa, grid de cards
- [ ] Tablet (~768px): menu hamburger, sidebar overlay
- [ ] Mobile (~375px): conteúdo legível, sem scroll horizontal
- [ ] Redimensionar janela: layout estável

### Estados vazios

- [ ] Dashboard: empty state com CTA importar
- [ ] Importar: aviso stub + empty state
- [ ] Cartões: empty state + botão disabled
- [ ] Histórico: tabela placeholder + empty state

### Importação (stub)

- [x] Selecionar `data/sample-import.cfm.v1.json` → "Validação OK"
- [x] JSON inválido → mensagem de erro
- [x] Nenhuma gravação Firebase (Network tab limpo de RTDB)

---

## Fase 0.3 — Importador JSON Local Real

### Leitura e validação

- [ ] Abrir `#/importar` — estado idle exibido (upload zone)
- [ ] Selecionar `data/sample-import.cfm.v1.json` → estado "warning" com relatório completo
- [ ] Confirmar exibição de: nome do arquivo, tamanho, schema, instituição, período
- [ ] Confirmar grade de contadores: contas, cartões, faturas, transações, parcelamentos, recorrências
- [ ] Confirmar contadores: válidos, inválidos, revisão, duplicatas

### Estados da UI

- [ ] **Idle**: upload zone com botão "Selecionar arquivo"
- [ ] **Loading**: spinner visível enquanto processa
- [ ] **Warning**: sample exibe aviso de pendências (duplicata + revisão + item inválido)
- [ ] **Success**: JSON sem problemas exibe verde e contadores limpos
- [ ] **Error**: arquivo com `schemaVersion` errado → erro claro, sem relatório
- [ ] **Empty**: JSON válido sem entidades → aviso de arquivo sem dados

### Casos de teste

- [ ] **JSON com `schemaVersion` incorreto** → estado error, mensagem clara
- [ ] **JSON malformado** (não é JSON) → estado error, mensagem clara
- [ ] **JSON sem `source.institution`** → estado error, mensagem clara
- [ ] **Transação sem `type`** → item marcado como inválido no relatório
- [ ] **Transação sem `amountCents`** → item marcado como inválido
- [ ] **Transação sem `description`** → item marcado como inválido
- [ ] **Transação sem `flow` válido** → item marcado como inválido
- [ ] **Transação com `review.required: true`** → aparece na seção "Pendentes de revisão"
- [ ] **Dois itens com mesmo fingerprint** → aparecem na seção "Possíveis duplicidades"
- [ ] **Transação sem `rawHash`/`externalRef`** → aviso de rastreabilidade na seção "Avisos"

### Botões e ações

- [ ] Botão "Selecionar arquivo" abre file picker
- [ ] Botão "Selecionar arquivo" ativável por teclado (Enter / Space)
- [ ] Botão "Limpar importação" aparece após carregar arquivo
- [ ] Clicar em "Limpar importação" volta ao estado idle (upload zone)
- [ ] Botão "Confirmar importação" está desabilitado (`disabled`, `aria-disabled="true"`)
- [ ] Hover em "Confirmar importação" mostra tooltip informando Fase 1
- [ ] Clicar em "Confirmar importação" não executa nenhuma ação

### Segurança e privacidade

- [ ] Abrir DevTools → Network: nenhuma requisição de rede ao selecionar arquivo
- [ ] Console sem payload financeiro completo (apenas metadados/contadores)
- [ ] Firebase não importado (verificar Sources)
- [ ] Nenhum dado gravado em localStorage/IndexedDB (Application tab limpo)
- [ ] Sample JSON não contém CPF, conta completa, boleto ou cartão completo

### Acessibilidade

- [ ] `role="status"` no estado loading (leitores de tela anunciam)
- [ ] `role="alert"` no estado error
- [ ] `role="region"` no relatório completo
- [ ] `aria-label` nos grupos de lista (transações, erros, duplicatas)
- [ ] Contraste dos badges `flow-badge--in/out` passa WCAG AA

### Responsividade

- [ ] Desktop (≥1200px): stat-grid em linha, relatório completo visível
- [ ] Tablet (~768px): stat-grid ajusta colunas automaticamente
- [ ] Mobile (~375px): tx-item empilha em 2 linhas, sem scroll horizontal
- [ ] Botões de ação `.import-actions` envolve corretamente em telas estreitas

### Dados e segurança

- [ ] `sample-import.cfm.v1.json` é JSON válido
- [ ] Sem CPF, conta, agência, cartão completo, boleto, endereço real
- [ ] `database.rules.json` sem read/write true globais
- [ ] Supabase ausente do repo

### Documentação

- [ ] `docs/STATUS_DO_PROJETO.md` existe e reflete Fase 0
- [ ] README aponta para docs
- [ ] 11 arquivos em `/docs` presentes

---

## Fase 1 — Auth + RTDB (futuro)

- [ ] Login/logout funcional
- [ ] Dados isolados por uid
- [ ] Import grava após auth
- [ ] Rules simulator: negar acesso cross-uid
- [ ] Logout limpa estado

---

## Fase 2+ — CRUD (futuro)

- [ ] CRUD contas
- [ ] CRUD transações
- [ ] Totais dashboard batem com transações
- [ ] Histórico navega entre meses

---

## Regressão visual

- [ ] Sem scroll horizontal (todas rotas)
- [ ] Contraste legível
- [ ] Botões disabled não clicáveis
- [ ] Animação fadeIn suave na troca de página

---

## Fase 0.3.2 — Revisor Local e Conciliação Financeira

### Tabs e estrutura

- [ ] Após selecionar JSON válido: exibe 8 tabs (Resumo, Faturas, Transações, Revisão, Duplicidades, Recorrências, Parcelamentos, Privacidade)
- [ ] Tab ativo destacado com borda colorida; tabs roláveis horizontalmente em mobile
- [ ] Badges de contador aparecem nas tabs com contagem > 0
- [ ] Clicar em tab inativo renderiza conteúdo (lazy rendering — sem rebuild do conteúdo anterior)
- [ ] "Limpar importação" reseta para zona de upload e limpa cache de tabs

### Banner de status

- [ ] `has_blockers` (item inválido ou alerta alto): banner vermelho com ❌
- [ ] `has_pending` (revisão pendente, duplicatas, warnings): banner amarelo com ⚠️
- [ ] `ready` (sem pendências): banner verde com ✅
- [ ] Microcopy "Nada é gravado no Firebase nesta fase." presente

### Painel Faturas

- [ ] Cada fatura exibe: nome do cartão + últimos 4 dígitos, mês de competência, status (chip), vencimento, fechamento, total
- [ ] Faturas `isStub: true` exibem chip "Stub" e borda pontilhada
- [ ] Faturas com `review.required: true` exibem chip "Revisão" e fundo amarelo
- [ ] Fatura com `balanceDirection: "credit"` + `creditBalanceCents > 0` + `creditBehavior: "applies_to_next_invoice"` exibe: "Saldo positivo de R$ X,XX será abatido da próxima fatura."
- [ ] **Arquivo real**: Mercado Pago 2026-05 exibe "Saldo positivo de R$ 7,49 será abatido da próxima fatura."
- [ ] Diferença de conciliação exibida quando transações vinculadas somam valor ≠ totalCents

### Painel Transações

- [ ] Lista completa exibida ao abrir o tab
- [ ] Filtro por tipo filtra corretamente (ex.: selecionar "Pagamento de Fatura" mostra apenas credit_card_payment)
- [ ] Filtro por flow (in/out/neutral) funciona
- [ ] Filtro por competência (YYYY-MM) funciona
- [ ] Filtro por cartão funciona (se houver transações com cardId)
- [ ] Filtro por conta funciona (se houver transações com accountId)
- [ ] Checkbox "Apenas revisão" filtra apenas transações com review.required === true
- [ ] Contador "X de Y transações" atualiza a cada filtro
- [ ] `credit_card_payment` exibe badge "Pagamento de Fatura" (azul) e borda esquerda colorida
- [ ] Flow badge verde (entrada), vermelho (saída), cinza (neutro)

### Painel Revisão

- [ ] Exibe todos os itens com `review.required === true` (transações + faturas)
- [ ] Cada item mostra: tipo de entidade, índice, descrição, valor, data/competência, motivo da revisão
- [ ] Ação futura sugerida exibida quando presente
- [ ] Se nenhum item: exibe mensagem "Nenhum item pendente de revisão."

### Painel Duplicidades

- [ ] Seção "Duplicatas exatas" (por rawHash) separada de "Duplicidades prováveis" (por fingerprint)
- [ ] Cada duplicata mostra: índices das transações, descrição, valor
- [ ] Aviso de que nada é removido automaticamente
- [ ] Se nenhuma duplicata: exibe mensagem adequada

### Painel Privacidade

- [ ] Exibe aviso inicial sobre dados financeiros pessoais
- [ ] 4 linhas de check: CPF, número de cartão completo, boleto/código de barras, sequência numérica longa
- [ ] Checks sem alertas exibem ✅ + "Nenhum X detectado"
- [ ] Checks com alertas exibem 🚨 (severity high) ou ⚠️ (medium) com contexto
- [ ] Seção "Boas práticas" listada

### Painel Recorrências

- [ ] Lista todas as regras recorrentes com: descrição, valor, flow, frequência, dia do mês, conta/cartão, status ativa/inativa
- [ ] Se nenhuma: exibe mensagem adequada

### Painel Parcelamentos

- [ ] Lista todos os parcelamentos com: descrição, progresso (N/total), valor/parcela, valor total, flow, cartão
- [ ] Se nenhum: exibe mensagem adequada

### Validação com arquivo real (cfm_import_v1_final_perfeito_validado.json)

- [ ] Contadores no Resumo: 1 conta, 4 cartões, 6 faturas, 206 transações, 41 parcelamentos, 9 recorrências
- [ ] Fatura Mercado Pago 2026-05 exibe saldo positivo de R$ 7,49
- [ ] Faturas stub identificadas
- [ ] Transferências pendentes aparecem no painel Revisão
- [ ] Pagamentos de fatura aparecem como `credit_card_payment` (badge "Pagamento de Fatura")
- [ ] Console sem payload financeiro completo (sem `console.log(report)`)
- [ ] Nenhum dado gravado no Firebase, localStorage ou IndexedDB

### Segurança e privacidade

- [ ] `.gitignore` inclui: `/imports-local/`, `/data/private/`, `*.real.json`, `*.sensitive.json`, `cfm_import_v1_final_perfeito_validado.json`
- [ ] Arquivo real não está no repositório
- [ ] Nenhuma chamada de rede disparada ao processar arquivo

---

## Fase 0.3.1-B — Contrato Canônico + Drag and Drop

### Enum `transaction.type`

- [ ] Microcopy da dropzone lista tipos canônicos (sem `credit`, `debit`, `payment`, `interest`, `other`)
- [ ] Feature list lista: `income`, `expense`, `transfer`, `credit_card_purchase`, `credit_card_payment`, `adjustment`, `fee`, `refund`
- [ ] **Arquivo real**: nenhum erro de tipo inválido para `credit_card_purchase`, `credit_card_payment`, `income`, `expense`, `adjustment`
- [ ] Contador `inválidos` reflete apenas itens realmente inválidos (ex.: `type` ausente)
- [ ] Contador `válidos` inclui transações com tipos canônicos

### Rastreabilidade

- [ ] Transação com `source.rawHash` **não** gera aviso "rastreabilidade reduzida"
- [ ] Transação com `externalRef` **não** gera aviso de rastreabilidade
- [ ] Transação sem `externalRef` e sem `source.rawHash` gera aviso
- [ ] Validador **não** exige `transaction.rawHash` na raiz

### Drag and drop

- [ ] Dropzone exibe: "Arraste um JSON aqui ou selecione um arquivo."
- [ ] Arrastar `.json` sobre a área aplica classe `is-dragover`
- [ ] Soltar `.json` válido gera o mesmo relatório que o botão "Selecionar arquivo"
- [ ] Arrastar `.txt` ou `.pdf` exibe erro claro ("Apenas arquivos JSON")
- [ ] Arrastar múltiplos arquivos exibe erro claro ("apenas um arquivo")
- [ ] Botão "Selecionar arquivo" continua funcionando
- [ ] Teclado: Enter/Space no label abre seletor de arquivo
- [ ] Nenhum dado gravado após drop ou seleção

### Segurança

- [ ] Console sem payload financeiro completo
- [ ] Firebase ausente; sem localStorage/IndexedDB

---

## Fase 0.3.3 — Semelhanças e revisão inteligente

### Classificação de semelhanças

- [ ] Aba renomeada para **Semelhanças** (não "Duplicidades")
- [ ] Grupos: Duplicatas exatas, Duplicatas prováveis, Parcelas relacionadas, Recorrências candidatas, Compras repetidas, Transferências semelhantes
- [ ] Cada par exibe badge de confiança (Alta / Média / Baixa)
- [ ] Mensagem: "Nenhum item é removido automaticamente"
- [ ] Parcelas X/Y diferentes **não** aparecem como duplicidade
- [ ] **Arquivo real**: EC *ELLISIMPO 5/12 e 6/12 → Parcelas relacionadas
- [ ] **Arquivo real**: BMI Serviços Digitais maio/junho → Recorrência candidata
- [ ] **Arquivo real**: Kelly Lanchonete → Compra repetida
- [ ] **Arquivo real**: Pix semelhantes → Transferências semelhantes

### Resumo

- [ ] Contadores separados: Dup. exatas, Dup. prováveis, Semelhanças classificadas, Para confirmar
- [ ] Semelhanças classificadas **não** somam ao contador de duplicatas

### Itens para confirmar

- [ ] Aba renomeada para **Itens para confirmar**
- [ ] Itens agrupados por motivo (Pix, transferência interna, categoria, etc.)
- [ ] Cada item exibe sugestão amigável **não aplicada**
- [ ] Status geral: "Pronto para revisar" (não "Possui pendências")

### Segurança

- [ ] Nenhuma remoção automática de transações
- [ ] Nenhuma persistência
- [ ] Console sem payload completo

---

## Fase 0.3.4 — Idempotência, revisão inteligente e parcelamento de fatura

### Compras repetidas vs duplicidade

- [ ] **Kelly Lanchonete** em datas diferentes → **Compra repetida** (informativo), **não** duplicidade
- [ ] Compras repetidas **não** incrementam contador de pendências
- [ ] Duplicidade provável exige mesma **data** + valor + descrição + conta/cartão
- [ ] Duplicidade exata só com mesmo `rawHash` ou `externalRef`

### Parcelamentos

- [ ] Parcelamento de **fatura** → `invoice_installment` / chip "Parcelamento de fatura"
- [ ] Parcelamento de fatura **não** aparece em Revisão crítica
- [ ] Parcelamento de **compra** → `purchase_installment`, separado de fatura
- [ ] Aba Parcelamentos exibe `kindLabel`

### Revisão por prioridade

- [ ] Aba **Itens para confirmar** com grupos: Revisão crítica, Revisão importante, Sugestões
- [ ] Mensagem: "A maioria dos itens foi classificada automaticamente..."
- [ ] Pix pessoa física permanece em revisão **importante**
- [ ] TED / entrada ambígua permanece em revisão **importante**
- [ ] Fatura **stub** permanece em revisão na aba **Faturas**

### Idempotência simulada

- [ ] Resumo exibe painel **Simulação de reimportação**
- [ ] Reimportar mesmo arquivo → majoritariamente `already_imported`
- [ ] Cada transação no relatório possui `canonicalFingerprint` (interno)

### Preservação futura e segurança

- [ ] Botão Confirmar desabilitado: "Confirmação será liberada após Firebase Auth + RTDB Rules"
- [ ] Nenhuma gravação Firebase / localStorage / IndexedDB
- [ ] Nenhuma remoção ou sobrescrita automática
- [ ] Console sem payload completo
- [ ] **Arquivo real** (`cfm_import_v1_final_perfeito_validado.json`): 206 válidos, 0 inválidos

---

## Fase 0.3.5 — Regras pessoais de classificação

### Configuração local

- [ ] `src/config/classification-rules.local.js` existe localmente (não versionado)
- [ ] `.gitignore` contém `classification-rules.local.js`
- [ ] GitHub Pages: app funciona sem arquivo local (`onerror` fallback)

### Classificação por regra

- [ ] BMI Serviços Digitais → Internet / Telecom recorrente
- [ ] Banco Pan Auto Pan → Financiamento (aba Parcelamentos)
- [ ] Protev → Seguro da moto recorrente
- [ ] Pabblu E → Barbeiro / cuidados pessoais
- [ ] Kelly Lanchonete → Alimentação, sem revisão obrigatória
- [ ] TED salário → Salário recorrente (ou revisão baixa)
- [ ] Pix **enviado** PF → despesa normal, **não** revisão importante
- [ ] Pix **recebido** PF → revisão leve/importante conservadora

### UI e resumo

- [ ] Contador **Por regra pessoal** no resumo
- [ ] Aviso: "Regras pessoais aplicadas localmente..."
- [ ] Auto-resolvidos com badge "Regra pessoal"
- [ ] Recorrências exibem origem (JSON / regra pessoal / motor)
- [ ] Parcelamentos: financiamento, parcela, meses restantes

### Segurança

- [ ] Regras pessoais reais **não** commitadas
- [ ] Nenhuma persistência Firebase / localStorage
- [ ] Console sem payload completo

---

## Fase 0.3.6 — Cartões, limites e faturas stub

### Snapshots locais

- [ ] `card-snapshots.local.js` gitignored
- [ ] BB Platinum: R$ 10.000 / R$ 8.152 / R$ 1.848
- [ ] Nubank: R$ 12.450 / R$ 10.606 / R$ 1.844
- [ ] Porto: R$ 16.200 / R$ 14.092,03 / R$ 2.107,97
- [ ] Mercado Pago: R$ 500 / R$ 364,97 / R$ 135,03

### Faturas e regras v2

- [ ] Faturas em seções; stubs com mensagem de referência
- [ ] MP 2026-05: saldo R$ 7,49 abatível (não receita)
- [ ] Caixa R$ 4.083 → FGTS; Lowify → compra; IFD → delivery
- [ ] Aba **Cartões** com barra de utilização

---

## Fase 0.3.6-B — Vínculos cartão/fatura/transação

- [ ] Cartões mostram usado/disponível (não `—`) com snapshot local
- [ ] Contagens de faturas/compras/parcelas > 0 quando houver vínculos
- [ ] Filtro “Apenas revisão (N)” usa revisão efetiva; hint com total JSON
- [ ] BMI/Protev/Pan ausentes de recorrências candidatas em Semelhanças
- [ ] Faturas stub exibem nome do cartão

---

## Como registrar

Atualizar tabela de critérios em `STATUS_DO_PROJETO.md` ao concluir cada fase.
