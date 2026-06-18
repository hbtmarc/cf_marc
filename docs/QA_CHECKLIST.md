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

## Fase 0.3.6-C — Snapshot completo e conciliação de faturas

### Cartões
- [ ] Aba **Cartões** exibe limite, usado, disponível e % usado para os 4 cartões
- [ ] BB: R$ 8.152 usado / R$ 1.848 disponível
- [ ] Nubank: R$ 10.606 / R$ 1.844
- [ ] Porto: R$ 14.092,03 / R$ 2.107,97
- [ ] Mercado Pago: R$ 364,97 / R$ 135,03
- [ ] Fonte do snapshot visível (Snapshot local / JSON)
- [ ] “Snapshot consistente” quando usado + disponível ≈ limite
- [ ] Cartão sem `last4` real **não** mostra `···0000`; mostra “final não informado” ou só o nome

### Faturas / conciliação
- [ ] Diferenças falsas (soma fora do escopo) **não** aparecem como alerta crítico
- [ ] Mensagem “Conciliação parcial — nem todas as transações…” quando escopo incompleto
- [ ] Mercado Pago 2026-05: saldo credor R$ 7,49 sem alerta falso por `amountDueCents: 0`
- [ ] Pagamentos de fatura, stubs e parcelas futuras **não** entram na soma de compras vinculadas

### Recorrências
- [ ] Resumo: total + breakdown (JSON / regra pessoal / candidatas)
- [ ] Badge da aba Recorrências = total reconhecido (não só JSON)

### Geral
- [ ] JSON real: 206 válidos, 0 inválidos
- [ ] Console sem erros e sem dump de valores financeiros
- [ ] Nada gravado; Firebase/Auth/RTDB ausentes

---

## Fase 0.3.6-D — Estabilização pré-Firebase

**Arquivo canônico:** `cfm_import_v1_cardsnapshots.json`

### Conciliação
- [ ] Nubank: diferença explicada por pagamento/crédito (≤ 5¢) → mensagem verde, sem alerta amarelo
- [ ] MP credor R$ 7,49 sem alerta falso

### Semelhanças / financiamentos
- [ ] Banco Pan Auto Pan **ausente** da aba Semelhanças
- [ ] Banco Pan visível em Parcelamentos/Financiamentos

### Recorrências
- [ ] Mesmo item JSON + regra pessoal = **uma linha** com dois badges
- [ ] Total da aba = itens únicos deduplicados

### Revisão
- [ ] “Para confirmar” (resumo) = itens críticos/importantes na aba (exclui sugestões)
- [ ] Checkbox “Apenas revisão” filtra **somente transações** nesta aba
- [ ] Contadores: bruta / efetiva / validação / sugestões separados

### Hash / privacidade
- [ ] `node scripts/test-phase-036d.js` → ALL PASS
- [ ] `badRawHashCount = 0` no resumo após import
- [ ] Nenhum fingerprint/hash na UI

### Gate Firebase
- [ ] Todos os itens acima OK antes de iniciar Fase 1 (Firebase/Auth/RTDB)

---

## Fase 0.3.6-E — Estabilização final (cartões, faturas, confirmação zero)

**Arquivo canônico:** `cfm_import_v1_cardsnapshots.json`

### Cartões (cardSnapshots prioritário)
- [ ] Limite/usado/disponível vêm de `payload.cardSnapshots` (não só overlay local)
- [ ] BB, MP, Porto, Nubank com valores corretos (tabela em STATUS_DO_PROJETO.md)
- [ ] `usedCents + availableCents === limitCents` (±1 centavo)
- [ ] Cartão sem snapshot: “snapshot ausente”, não R$ 0,00

### Faturas / conciliação
- [ ] UI: Encargos, Pagamentos/créditos, Liquidação bancária (quando houver), Status final
- [ ] MP 2026-05: saldo credor R$ 7,49 sem alerta falso
- [ ] Porto/Nubank: diferença explicada por pagamento/crédito (≤5¢) → verde, sem amarelo
- [ ] Pagamento citando outro mês (ex.: abril/2026) não entra na fatura de maio
- [ ] `hasReconciliationGap` só quando sem explicação

### Itens para confirmar
- [ ] Badge da aba = `blockingConfirmCount` (0 com JSON canônico)
- [ ] Stubs só em Faturas > Referências/Stubs
- [ ] Transferência mesma titularidade auto-resolvida
- [ ] Sugestões separadas, não bloqueantes

### Contadores
- [ ] Resumo: bloqueantes vs informativas em semelhanças (não “0” ambíguo com badge 12)
- [ ] `blockingSimilarityCount`, `informationalSimilarityCount`, `personalRuleAppliedCount`

### Testes automatizados
- [ ] `node scripts/test-phase-036d.js` → ALL PASS
- [ ] `node scripts/test-phase-036e.js` → ALL PASS
- [ ] `badRawHashCount = 0`; sem hash/fingerprint na UI

### Gate Firebase
- [ ] Critérios 0.3.6-E OK antes de Fase 1

---

## Fase 0.3.6-F — Zero bloqueios e conciliação sem liquidação no delta

**Arquivo canônico:** `cfm_import_v1_cardsnapshots.json`

### Cartões
- [ ] Badge de origem exibe string legível (“Snapshot do JSON”, “Snapshot local”, “Snapshot ausente”)
- [ ] **Nenhum** `[object Object]` na aba Cartões
- [ ] 4 cartões com limite/usado/disponível corretos via `cardSnapshots`

### Faturas / conciliação
- [ ] Encargos, pagamentos/créditos internos e **liquidação bancária** exibidos separadamente
- [ ] Liquidação bancária **não** gera `hasReconciliationGap`
- [ ] Nubank: total R$ 752,46, encargos R$ 752,45, liquidação R$ 2.752,46 → sem alerta amarelo
- [ ] Porto: encargos = total → status verde, liquidação à parte
- [ ] MP: saldo credor R$ 7,49 sem alerta; pagamento abril fora de maio
- [ ] Ourocard: `partial` informativo, não bloqueante

### Bloqueios e contadores
- [ ] Aba “Itens para confirmar”: badge = `blockingConfirmCount` (0 com JSON canônico)
- [ ] Resumo: “Semelh. bloqueantes” vs “Semelh. informativas” coerentes com tabs
- [ ] “Classif. por regra pessoal” reflete `personalRuleAppliedCount`

### Testes automatizados
- [ ] `node scripts/test-phase-036d.js` → ALL PASS
- [ ] `node scripts/test-phase-036e.js` → ALL PASS
- [ ] `node scripts/test-phase-036f.js` → ALL PASS

### Gate Firebase
- [ ] Critérios 0.3.6-F OK antes de Fase 1

---

## Fase 0.3.7 — Responsividade premium (`#/importar`)

**Arquivo canônico:** `cfm_import_v1_cardsnapshots.json` (validação funcional inalterada)

### Breakpoints (DevTools)
- [ ] **1440px / 1280px:** sidebar fixa; faturas em 3 colunas; KPIs em grade ampla
- [ ] **1024px:** sidebar compacta; faturas 2 colunas; cartões 2 colunas
- [ ] **768px:** drawer lateral; KPIs 2 colunas; filtros empilhados
- [ ] **430px / 390px / 375px / 320px:** 1 coluna; action bar sticky; sem scroll horizontal

### Abas e KPIs
- [ ] Abas scrollam horizontalmente; fade indica overflow; “Privacidade” acessível
- [ ] KPIs essenciais visíveis; métricas técnicas em bloco expansível
- [ ] Contadores e valores monetários **não** truncados

### Conteúdo por aba
- [ ] **Cartões:** barra de uso dentro do card; snapshot legível
- [ ] **Faturas:** encargos / liquidação / status legíveis em mobile
- [ ] **Transações:** card (descrição+valor, tags, meta); checkbox revisão confortável
- [ ] **Semelhanças / Recorrências / Parcelamentos:** 1 coluna no mobile

### Ações e regressão
- [ ] Barra inferior sticky no mobile; botão confirmar desabilitado
- [ ] `node scripts/test-phase-036d.js` → ALL PASS
- [ ] `node scripts/test-phase-036e.js` → ALL PASS
- [ ] `node scripts/test-phase-036f.js` → ALL PASS
- [ ] 206 válidos, 0 bloqueantes, faturas sem alertas falsos (JSON canônico)

### Gate Firebase
- [ ] UI 0.3.7 OK; critérios financeiros 0.3.6-F mantidos

---

## Fase 0.3.8 — UX final do importador (`#/importar`)

**Arquivo canônico:** `cfm_import_v1_cardsnapshots.json` (validação funcional inalterada)

### Visão principal (sem modo técnico)
- [ ] Sem `amountCents`, `rawHash`, schema, exemplo JSON ou boas práticas de dev na tela padrão
- [ ] Resumo: status, lançamentos, pendências, cartões, faturas, parcelas, recorrências, sugestões opcionais
- [ ] KPIs legíveis (sem quebra “con-tas” / “car-tões”)
- [ ] “Detalhes técnicos da validação” fechado por padrão; conteúdo dev dentro dele

### Abas renomeadas
- [ ] Lançamentos · Revisar · Observações · Segurança — todas acessíveis com scroll/fade

### Por aba
- [ ] **Revisar:** estado positivo quando 0 bloqueantes; sugestões marcadas como opcionais
- [ ] **Observações:** “Essas observações não bloqueiam a importação.”
- [ ] **Segurança:** checklist CPF / cartão / linha digitável / sequência sensível

### Breakpoints
- [ ] 1440 / 1280 / 1024 / 768 / 430 / 390 / 375 / 320 — sem scroll horizontal no body
- [ ] Desktop usa largura ampla; mobile com action bar sticky

### Regressão
- [ ] Importar JSON canônico → 206 válidos, 0 bloqueantes, 4 cartões, 6 faturas, 12 observações informativas
- [ ] MP / Porto / Nubank sem alertas falsos
- [ ] `node scripts/test-phase-036d.js` → ALL PASS
- [ ] `node scripts/test-phase-036e.js` → ALL PASS
- [ ] `node scripts/test-phase-036f.js` → ALL PASS

### Gate Firebase
- [ ] UI 0.3.8 OK; critérios financeiros 0.3.6-F mantidos

---

## Fase 0.3.9 — Contrato canônico (`cfm.import.v1`)

**Documento:** [CONTRATO_IMPORTACAO_CFM_V1.md](./CONTRATO_IMPORTACAO_CFM_V1.md)

### Script de contrato
- [ ] `node scripts/validate-import-contract.js data/sample-import.cfm.v1.json` → **PASS**
- [ ] `node scripts/validate-import-contract.js <cfm_import_v1_cardsnapshots.json> --canonical` → **PASS** (arquivo local, fora do Git)

### Contrato
- [ ] `schemaVersion` = `cfm.import.v1`
- [ ] `cardSnapshots[]` válidos (FK, aritmética, `source` string)
- [ ] `badRawHashCount` = 0
- [ ] 0 pendências bloqueantes no importador (JSON canônico)
- [ ] Gerador não emite `cadence` nem `amountCents` em `recurringRules`
- [ ] Seção **CORREÇÕES NECESSÁRIAS NO GERADOR JSON** vazia ou endereçada

### Regressão
- [ ] UI Fase 0.3.8 preservada (sem alteração visual)
- [ ] Nenhum dado real versionado
- [ ] Console limpo (sem dump de payload)
- [ ] `node scripts/test-phase-036d.js` → ALL PASS
- [ ] `node scripts/test-phase-036e.js` → ALL PASS
- [ ] `node scripts/test-phase-036f.js` → ALL PASS

### Gate Firebase
- [ ] Contrato PASS no JSON de produção **antes** de Fase 1 (Auth + RTDB)

---

## Fase 0.3.10 — Interpretação Nubank v2 (`#/importar`)

**Fixture automatizada:** `node scripts/test-phase-nubank-v2.js` → **ALL PASS**  
**JSON manual (local, fora do Git):** `cfm_import_v1_nubank_pdf_csv_ofx_jun_jul_v2.json`

### Resumo
- [ ] Badge do app: `Fase 0.3.10 · Interpretação Nubank v2`
- [ ] Arquivo validado · 0 pendências
- [ ] 97 lançamentos · 1 cartão · 2 faturas · 23 parcelas · 10 recorrências (JSON Nubank v2)

### Cartões
- [ ] Nubank: limite R$ 12.450,00 · usado R$ 10.813,00 · disponível R$ 1.637,00
- [ ] **Snapshot consistente** (não “Snapshot ausente”)
- [ ] Sem “final não informado” no card principal
- [ ] Aliases do PDF em detalhes recolhíveis (não no título)

### Faturas
- [ ] Junho: **Conciliada** / Paga — sem “Conciliação parcial”
- [ ] Julho: **Aberta / provisória**
- [ ] Diferença de centavos (ex.: R$ 0,06) como **Diferença informativa**

### Lançamentos
- [ ] Pagamento recebido R$ 2.000,00 → badge **Pagamento de fatura** / liquidação neutra
- [ ] Pagamento R$ 752,46 (se listado) → liquidação, não compra
- [ ] Liquidações não entram em totais de compras do cartão

### Observações
- [ ] Banner: **Nenhum bloqueio encontrado** · `0 bloqueantes · N atenções · M informativos`
- [ ] Não aparece “Existem pendências que bloqueiam a importação” com Resumo em 0 pendências
- [ ] Não aparece contagem falsa tipo “5 bloqueantes”
- [ ] Recorrências candidatas: badge **Atenção** + **Candidata** · não bloqueia importação
- [ ] Parcelas relacionadas em `<details>` · badge **Informativo**
- [ ] Sem badge **ALTA** residual

### Regressão BB
- [ ] `cfm_import_v1_bb_final_sem_pendencias.json` sem regressão
- [ ] `node scripts/test-phase-036d.js` → ALL PASS
- [ ] `node scripts/test-phase-036e.js` → ALL PASS
- [ ] `node scripts/test-phase-036f.js` → ALL PASS

### UX / técnico
- [ ] UI Fase 0.3.8 preservada; responsivo desktop/tablet/mobile
- [ ] Sem scroll horizontal; console limpo
- [ ] Nenhuma persistência; nenhum dado real versionado

### Classificação Nubank (regras locais)
- [ ] F1TV → Assinaturas / Streaming
- [ ] T360graus → Lazer / Turismo
- [ ] Ellisimports → Tecnologia / Apple
- [ ] Epidemic Sound → Audiovisual / Áudio
- [ ] LL Comunidade → Tecnologia / Aplicativos
- [ ] Nenhum dos acima aparece em “Categoria a revisar”

### Parcelas relacionadas
- [ ] Mesmo nome/valor/meses diferentes + indício parcela = relacionamento válido
- [ ] Não bloqueante · não atenção · informativo recolhido
- [ ] Mensagem: “Parcelas vinculadas a plano consistente — não indicam erro.”

---

## Fase 0.3.11 — Semântica multi-cartões / Porto v1.1 (`#/importar`)

**Fixture:** `node scripts/test-phase-porto-v1-1.js` → **ALL PASS**  
**JSON manual (local):** `cfm_import_v1_porto_pdf_prints_v1_1.json`

### Badge
- [ ] `Fase 0.3.11 · Semântica multi-cartões`

### Resumo Porto
- [ ] Arquivo validado · 0 pendências · 74 lançamentos · 1 cartão · 2 faturas · 22 parcelas · 1 recorrência

### Cartões Porto
- [ ] Porto Bank Visa Gold · final 2128
- [ ] Limite R$ 16.200,00 · usado R$ 14.541,31 · disponível R$ 1.658,69 · 90%
- [ ] Snapshot consistente

### Faturas Porto
- [ ] **Junho paga/conciliada:** R$ 0,00 · encargos R$ 2.672,10
- [ ] Créditos internos R$ 1.771,41 — **não** “Liquidação bancária”
- [ ] Liquidação externa/BB R$ 2.672,10
- [ ] **Julho aberta/provisória:** R$ 3.815,14 · créditos R$ 2.794,33
- [ ] Detalhe: pagamento R$ 2.672,10 · estornos R$ 122,23
- [ ] Referência BB em detalhe técnico (se existir)

### Lançamentos Porto
- [ ] `credit_card_payment` + `flow: in` → **Crédito na fatura** (entrada)
- [ ] Não contar como compra/despesa do cartão

### Recorrências Porto
- [ ] Identidade Protegida: **Candidata** + **Atenção** — não **Ativa**
- [ ] Não bloqueia importação

### Regressão
- [ ] `node scripts/test-phase-nubank-v2.js` → ALL PASS
- [ ] `node scripts/test-phase-036d/e/f.js` → ALL PASS
- [ ] BB e Nubank sem regressão visual

---

## Fase 0.3.12 — Fechamento do importador consolidado (`#/importar`)

**Fixture consolidado (manual, local):** `cfm_20260617_1949.json`  
**Testes automatizados:** ver seção abaixo

### Badge
- [ ] `Fase 0.3.12 · Fechamento do importador`

### Resumo consolidado
- [ ] Arquivo validado · **0 pendências bloqueantes**
- [ ] 4 cartões · 9 faturas · 245 lançamentos · 60 parcelas · recorrências conforme JSON
- [ ] 27 informativos em Observações (sem bloqueantes nem atenções reais)

### Observações
- [ ] **0 bloqueantes · 0 atenções**
- [ ] Apenas informativos legítimos
- [ ] Apple/iCloud, Google/Gmail via Apple e Clube iFood **não** aparecem como recorrência candidata

### Recorrências — badge ATIVA padronizado
- [ ] Recorrências confirmadas (Apple/iCloud, Google/Gmail via Apple, Clube iFood): pill verde **ATIVA** (mesmo padrão de `IMPORTADA DO JSON`, altura/padding/radius/peso)
- [ ] Origem **IMPORTADA DO JSON** em pill amarela/warning chip
- [ ] Candidatas legítimas: **CANDIDATA** + **ATENÇÃO** + “Não bloqueia a importação”
- [ ] Header da linha quebra em mobile/tablet sem scroll horizontal

### Abas sem regressão
- [ ] Cartões · Faturas · Lançamentos · Parcelas — contadores e semântica intactos
- [ ] Console limpo · sem dependências novas · GitHub Pages + local

### Testes automatizados (obrigatório antes de release)
- [ ] `node scripts/test-phase-porto-v1-1.js` → ALL PASS
- [ ] `node scripts/test-phase-nubank-v2.js` → ALL PASS
- [ ] `node scripts/test-phase-recurring-confirmed.js` → ALL PASS
- [ ] `node scripts/test-phase-036d.js` → ALL PASS
- [ ] `node scripts/test-phase-036e.js` → ALL PASS
- [ ] `node scripts/test-phase-036f.js` → ALL PASS

**Nota:** Não há suite Mercado Pago dedicada; validar MP apenas se fixture existir localmente.

---

## Fase 0.3.13 — Polimento UX do importador (`#/importar`)

**Fixture consolidado (manual, local):** `cfm_20260617_1949.json`

### Badge
- [ ] `Fase 0.3.13 · Polimento do importador`

### Ocultação de informações técnicas
- [ ] Aba **Faturas**: somente faturas reais (abertas/pagas/consolidadas)
- [ ] Nenhuma seção “Faturas de referência / STB” na UI principal
- [ ] Nenhum card “Referência de vínculo” visível
- [ ] Stub/referência listados em **Detalhes técnicos da validação**
- [ ] Contador da aba Faturas = faturas exibidas (não inclui stubs)
- [ ] **Recorrências**: sem badge `IMPORTADA DO JSON`
- [ ] **Parcelas**: sem `Origem: Importado do JSON`
- [ ] **Lançamentos**: fatura como `Junho/2026` (nunca `invoice_...`)

### Observações — comparação clicável
- [ ] Referências `#208` / `#215` são links clicáveis
- [ ] Botão **Comparar lançamentos** abre aba Lançamentos
- [ ] Filtro temporário mostra só transações relacionadas
- [ ] Lançamentos destacados + scroll até o primeiro
- [ ] Banner `Comparando N lançamentos…` + **Limpar filtro**
- [ ] Ação usa identificador estável (não só índice visual)

### Observações — conferido
- [ ] **Marcar como conferido** remove item da lista principal
- [ ] Badge/contador da aba Observações diminui
- [ ] Nada gravado no JSON; estado em `sessionStorage` por arquivo (opcional)
- [ ] Reimportar mesmo arquivo restaura conferidos da sessão

### Microcopy e layout
- [ ] Compras repetidas: título *Compra semelhante encontrada* + descrição de produto
- [ ] Desktop/tablet/mobile sem scroll horizontal
- [ ] Console limpo

### Regressão automatizada
- [ ] `node scripts/test-phase-porto-v1-1.js` → ALL PASS
- [ ] `node scripts/test-phase-nubank-v2.js` → ALL PASS
- [ ] `node scripts/test-phase-recurring-confirmed.js` → ALL PASS
- [ ] `node scripts/test-phase-036d.js` → ALL PASS
- [ ] `node scripts/test-phase-036e.js` → ALL PASS
- [ ] `node scripts/test-phase-036f.js` → ALL PASS
- [ ] `node scripts/test-phase-0.3.14.js` → ALL PASS

---

## Fase 0.3.14 — Decisão e valores do importador (`#/importar`)

**Fixture:** `cfm_20260617_1949.json` (manual, local)

### Badge
- [ ] `Fase 0.3.14 · Decisão e valores do importador`

### Faturas pagas — valor principal
- [ ] Faturas pagas com movimento **não** exibem `R$ 0,00` como valor principal
- [ ] Label **Total da fatura** + hint **Fatura quitada**
- [ ] Linhas secundárias: Compras/encargos, Pagamentos/créditos, Saldo final
- [ ] Faturas abertas inalteradas

### Comparação inteligente (Observações → Lançamentos)
- [ ] Painel: título, subtítulo, 5 botões de decisão
- [ ] Cards com data, fatura humana, cartão, valor, tipo, categoria, parcela
- [ ] **São compras diferentes** → remove observação (conferido)
- [ ] **É duplicata** → escolher manter/ignorar (estado local)
- [ ] **São parcelas relacionadas** → remove observação + atalho Parcelas
- [ ] **Limpar comparação** → lista completa

### Parcelas vs compras repetidas
- [ ] Parcelas 1/2 + 2/2 **não** em Compras repetidas
- [ ] Compras semelhantes legítimas continuam em Observações

### Recorrências com valor
- [ ] Nenhuma recorrência derivável com `— Mensal`
- [ ] Formato `R$ X · Mensal` ou `Valor a confirmar · Mensal`
- [ ] Sem `Confiança: 100` na UI principal

### Regressão
- [ ] Suite 0.3.11–0.3.13 + `test-phase-0.3.14.js` → ALL PASS
- [ ] Console limpo · responsivo · sem scroll horizontal

---

## Fase 0.3.15 — Ações contextuais do importador (`#/importar`)

**Fixture:** `cfm_20260617_1949.json` (manual, local)

### Badge
- [ ] `Fase 0.3.15 · Ações contextuais do importador`

### Compras semelhantes (`repeated_purchase`)
- [ ] Observações: **Comparar compras** + **Marcar como conferido**
- [ ] Painel Lançamentos: título **Comparando compras semelhantes**
- [ ] Botões: **São compras diferentes**, **É duplicata**, **Revisar depois**, **Limpar comparação**
- [ ] **Não** aparece **São parcelas relacionadas** nem **Ver grupo de parcelas**

### Parcelas relacionadas (`installment_related`)
- [ ] Observações: **Ver grupo de parcelas** + **Marcar como conferido**
- [ ] Microcopy: **Parcelas vinculadas a um plano consistente — não indicam erro.**
- [ ] Aba Parcelas: banner **Filtrando grupo de parcelas relacionado** + **Limpar filtro**
- [ ] Painel: **Parcelas corretas**, **Não é parcelamento**, **Revisar depois**, **Limpar filtro**
- [ ] **Não** aparece **São compras diferentes** nem **É duplicata**

### Filtro de grupo na aba Parcelas
- [ ] Mostra todas as parcelas/planos do grupo (refs estáveis, não `#77`)
- [ ] Contador **N parcela(s) no grupo**
- [ ] Destaque visual do grupo

### Estado local
- [ ] **Marcar como conferido** / **Parcelas corretas** remove observação sem alterar JSON
- [ ] **Não é parcelamento** troca contexto local para revisão de compra (se aplicável)

### Regressão
- [ ] `node scripts/test-phase-0.3.15.js` → ALL PASS
- [ ] Suite 0.3.14 + porto + nubank + recurring + 036d/e/f → ALL PASS
- [ ] Console limpo · responsivo · sem scroll horizontal

---

## Fase 0.3.16 — Controle de parcelas relacionadas (`#/importar`)

**Fixture:** `cfm_20260617_1949.json` (manual, local)

### Badge
- [ ] `Fase 0.3.16 · Controle de parcelas relacionadas`

### Seção global Observações
- [ ] Subtítulo + botão **Ver todas as parcelas relacionadas** abaixo do título
- [ ] Nunca mostra `0 parcela(s) no grupo` quando há observações

### Por card
- [ ] **Comparar este par** + **Marcar como conferido**
- [ ] Sem **São compras diferentes** / **É duplicata**

### Aba Parcelas (filtro global)
- [ ] Painel **Controlando parcelas relacionadas**
- [ ] Banner **Filtrando parcelas relacionadas das observações**
- [ ] Contador **N ocorrência(s) nas observações** ou planos relacionados
- [ ] Fallback **Grupo identificado nas observações** se planos não baterem
- [ ] **Marcar todas como conferidas** remove observações (sessionStorage)

### Aba Lançamentos (par)
- [ ] **Comparar este par** mostra exatamente 2 transações
- [ ] Painel **Conferindo par de parcelas** sem opções de compra/duplicata

### Regressão
- [ ] `node scripts/test-phase-0.3.16.js` → ALL PASS
- [ ] Suite 0.3.15 + anteriores → ALL PASS

---

## Fase 0.3.17 — Conclusão individual de grupos de parcelas (`#/importar`)

### Badge
- [ ] `Fase 0.3.17 · Conclusão individual de parcelas`

### Filtro global — ação por grupo
- [ ] Cada grupo exibe **Marcar grupo como concluído**
- [ ] Grupo com 2 transações: **Comparar este par**
- [ ] Grupo com 3+ transações: **Ver lançamentos do grupo**
- [ ] Concluir um grupo remove só aquele card
- [ ] Contador de grupos/ocorrências diminui
- [ ] Aba Observações reflete a conclusão (sessionStorage)
- [ ] Feedback *Grupo marcado como concluído.*

### Estado vazio e global
- [ ] Concluir todos individualmente → estado *Todas as parcelas relacionadas foram conferidas*
- [ ] **Marcar todas como conferidas** (topo) continua funcionando
- [ ] **Limpar filtro** restaura aba Parcelas normal

### Regressão
- [ ] `node scripts/test-phase-0.3.17.js` → ALL PASS
- [ ] Suite 0.3.16 + anteriores → ALL PASS

---

## Fase 0.3.18 — Modais internos do projeto

### Badge
- [ ] `Fase 0.3.18 · Modais internos do projeto`

### Regra de produto
- [ ] Nenhum `alert` / `confirm` / `prompt` nativo em produção
- [ ] Decisões sempre via componente interno (`CFM.openAppConfirm`)

### Modal de confirmação
- [ ] `Marcar todas como conferidas` abre modal interno (não popup do navegador)
- [ ] Título: *Marcar todas como conferidas?*
- [ ] Botões: **Marcar todas** / **Cancelar**
- [ ] Botões com visual consistente com o app
- [ ] ESC e clique no overlay cancelam
- [ ] Foco retorna ao botão que abriu o modal
- [ ] Modal com foco acessível (trap + `focus-visible`)
- [ ] `role="dialog"`, `aria-modal="true"`, foco preso no modal
- [ ] Responsivo desktop/tablet/mobile, sem scroll horizontal
- [ ] Cancelar mantém estado; confirmar executa a ação esperada

### Regressão
- [ ] `node scripts/test-phase-0.3.18.js` → ALL PASS
- [ ] Suite 0.3.17 + anteriores → ALL PASS

---

## Fase 0.3.19 — Polimento visual final do importador

### Badge
- [ ] `Fase 0.3.19 · Polimento visual final`

### Escopo (somente visual)
- [ ] Nenhuma alteração de schema JSON, parser ou regras financeiras
- [ ] Contadores e comportamentos funcionais preservados
- [ ] Nenhum popup nativo (`alert`/`confirm`/`prompt`)

### Layout geral
- [ ] Aviso local elegante (não alarmante)
- [ ] Card do arquivo com aparência de produto
- [ ] Container do relatório com profundidade refinada
- [ ] Sem scroll horizontal; valores financeiros legíveis

### Abas e painéis
- [ ] Tabs com estado ativo premium e badges integrados
- [ ] Resumo: métricas com hierarquia clara
- [ ] Cartões: barras de utilização e snapshot elegantes
- [ ] Faturas: status aberta/quitada claros; total em destaque
- [ ] Lançamentos: linhas legíveis; comparação intencional
- [ ] Observações: checklist inteligente; parcelas como painel de controle
- [ ] Recorrências: ativas vs candidatas distintas
- [ ] Segurança: checklist de privacidade
- [ ] Modal interno polido; ESC/foco/backdrop OK

### Microinterações
- [ ] Hover/focus discretos em cards e botões
- [ ] `prefers-reduced-motion` respeitado

### Regressão
- [ ] Suite completa de testes automatizados → ALL PASS

---

## Fase 0.3.20 — Formatação monetária e datas

### Badge
- [ ] `Fase 0.3.20 · Formatação monetária e datas`

### Moeda
- [ ] Nenhum valor com uma casa decimal (ex.: R$ 70,6)
- [ ] Sempre duas casas (ex.: R$ 70,60 · R$ 1.676,50)
- [ ] Labels como *Valor a confirmar* preservados

### Datas
- [ ] Lançamentos em `dd/mm/aaaa` (não ISO `2026-01-15`)
- [ ] Competências de fatura em `Junho/2026`
- [ ] Período do arquivo formatado em PT-BR

### Regressão
- [ ] `node scripts/test-phase-0.3.20.js` → ALL PASS
- [ ] Suite 0.3.19 + anteriores → ALL PASS

---

## Fase 0.4.0 — Base de conciliação cruzada

### Badge
- [ ] `Fase 0.4.0 · Base de conciliação`

### Escopo (base técnica, sem UI)
- [ ] `report.reconciliationReport` gerado em memória
- [ ] Nenhuma alteração de schema JSON ou contadores 0.3
- [ ] Nenhum popup nativo
- [ ] Conciliações não marcadas como definitivas (`definitive: false`)

### Casos validados (automático)
- [ ] Fatura paga → `matched`
- [ ] Diferença de centavos → informativa, `blocking: false`
- [ ] Fatura aberta/provisória → `open_provisional`, sem bloqueio
- [ ] Crédito interno Porto → não erro
- [ ] Saldo MP → `credit_balance`
- [ ] Pagamento histórico ≠ compra comum
- [ ] Cada entrada com `reasonCodes` + `displayMessage`

### Regressão
- [ ] `node scripts/test-phase-0.4.0.js` → ALL PASS
- [ ] Suite 0.3.x completa → ALL PASS

---

## Fase 0.5.0 — Confirmação de importação e persistência local

### Badge
- [ ] `Fase 0.5.0 · Confirmação de importação`

### Escopo
- [ ] Botão **Confirmar importação** habilitado só sem bloqueios
- [ ] Persistência em `localStorage` (`cfm:v1:appData`, versão `cfm.local.v1`)
- [ ] Transações ignoradas excluídas dos lançamentos ativos
- [ ] Duplicidade → modal interno (Cancelar / Substituir importação)
- [ ] Feedback **Importação concluída** com contadores
- [ ] **Limpar importação** não apaga dados confirmados
- [ ] Dashboard lê contadores básicos do lote ativo
- [ ] Nenhum popup nativo

### Regressão
- [ ] `node scripts/test-phase-0.5.0.js` → ALL PASS
- [ ] `node scripts/test-phase-0.4.0.js` → ALL PASS
- [ ] Suite 0.3.x completa → ALL PASS

---

## Fase 0.5.1 — Consumo dos dados importados nas páginas

### Badge
- [ ] `Fase 0.5.1 · Dados importados nas páginas`

### Escopo
- [ ] Dashboard, Cartões e Histórico leem `localStoreService` / read model
- [ ] `getActiveFinancialData()` retorna arrays + `activeBatch` + `batches` + `hasData`
- [ ] Dashboard exibe totais do mês (não `R$ —` quando há dados)
- [ ] Cartões lista cartões importados (não empty state falso)
- [ ] Histórico agrega meses por competência (não empty state falso)
- [ ] Pagamentos de fatura excluídos dos totais (sem dupla contagem)
- [ ] Reload preserva dados
- [ ] Nenhum popup nativo

### Regressão
- [ ] `node scripts/test-phase-0.5.1.js` → ALL PASS
- [ ] `node scripts/test-phase-0.5.0.js` → ALL PASS
- [ ] Suite completa → ALL PASS

---

## Fase 0.5.2 — Reimportação inteligente

### Badge
- [ ] `Fase 0.5.2 · Reimportação inteligente`

### Escopo
- [ ] Mesmo arquivo reimportado → modal “Arquivo já importado”, sem duplicidade
- [ ] Mesmo conteúdo, nome diferente → modal, sem duplicidade
- [ ] Lançamentos novos → modo incremental com banner e UI filtrada
- [ ] Confirmação incremental mescla só novos lançamentos
- [ ] `changed_existing` para mesma identidade com valor alterado
- [ ] Entidades relacionadas mescladas, não duplicadas
- [ ] Dashboard/Cartões/Histórico refletem conjunto consolidado
- [ ] Nenhum popup nativo

### Regressão
- [ ] `node scripts/test-phase-0.5.2.js` → ALL PASS
- [ ] Suite 0.5.x + 0.4.0 + 0.3.x → ALL PASS

---

## Fase 0.5.3 — Identidade semântica de importação

### Badge
- [ ] `Fase 0.5.3 · Identidade semântica de importação`

### Escopo
- [ ] Reimportar consolidado final → modal “Arquivo já importado”
- [ ] Importar JSON legado (`cfm_import_v1_cardsnapshots.json`) após consolidado → sem massa de lançamentos novos
- [ ] Status `legacy_overlap` / `unsafe_legacy_import` ou incremental só com lançamentos realmente seguros
- [ ] Equivalência semântica entre versões (Apple, Spotify, GitHub, pagamento fatura Nubank, Banco Pan)
- [ ] Compras repetidas reais (Kelly Lanchonete) não colapsadas quando data/valor diferem
- [ ] `possible_duplicate` não importado automaticamente
- [ ] `changed_existing` não sobrescreve dado salvo
- [ ] Confirmar incremental salva apenas `safeNewTransactions`
- [ ] Overlap legado sem novidades seguras → modal “Arquivo antigo já contemplado”
- [ ] Banner incremental: X novos, Y já existem, Z possíveis duplicidades
- [ ] Detalhes técnicos listam já existentes, possíveis duplicidades, alterados e motivo
- [ ] Nenhum popup nativo

### Regressão
- [ ] `node scripts/test-phase-0.5.3.js` → ALL PASS
- [ ] Suite 0.5.x + 0.4.0 + 0.3.x → ALL PASS

---

## Fase 0.5.4 — Importação idempotente real

### Badge
- [ ] `Fase 0.5.4 · Importação idempotente real`

### Escopo
- [ ] Importar `cfm_20260617_1949.json` → 245 txs, 8 faturas, 4 cartões, 24 recorrências, 60 parcelas
- [ ] Importar `cfm_import_v1_cardsnapshots.json` depois → `legacy_overlap_blocked`, confirmação desabilitada
- [ ] Base permanece intacta (sem cartões/faturas/recorrências duplicadas)
- [ ] Incremental mensal seguro importa só novos lançamentos
- [ ] `changed_existing` bloqueia autosave (`requires_review`) até decisão
- [ ] Entidades equivalentes remapeadas, não append bruto
- [ ] Banner “Arquivo antigo ou sobreposto detectado” para JSON legado
- [ ] Banner “Importação incremental segura” para mensal válido
- [ ] Nenhum popup nativo

### Regressão
- [ ] `node scripts/test-phase-0.5.4.js` → ALL PASS
- [ ] Suite 0.5.x + 0.4.0 + 0.3.x → ALL PASS

---

Atualizar tabela de critérios em `STATUS_DO_PROJETO.md` ao concluir cada fase.
