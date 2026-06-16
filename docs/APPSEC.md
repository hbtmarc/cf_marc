# AppSec — Checklist de Segurança

Controle Financeiro Mensal — orientações de segurança para frontend estático + Firebase RTDB.

---

## Princípio fundamental

> **Autenticação não é autorização.**

Ter um token Firebase válido (usuário logado) **não** concede acesso automático a todos os dados. Cada operação no RTDB deve ser validada pelas **Security Rules** no path correto (`auth.uid == $uid`).

---

## Checklist — Fase 0 (fundação)

| Item | Status | Notas |
|------|--------|-------|
| RTDB: deny-by-default na raiz | ✅ | `.read`/`.write` false globais |
| RTDB: acesso só em `/users/{uid}` | ✅ | Rascunho — refinar `.validate` |
| Sem credenciais reais no repo | ✅ | `config.example.js` apenas |
| `config.js` no `.gitignore` | ✅ | |
| Exemplo JSON sanitizado | ✅ | Sem PII financeira real |
| Importação sem persistência | ✅ | Stub explícito |
| Supabase não adicionado | ✅ | Superfície de ataque reduzida |
| Sem secrets server-side | ✅ | App 100% estático |

## Checklist — Fase 0.3 (importador JSON local)

| Item | Status | Notas |
|------|--------|-------|
| Leitura via `FileReader` (sem servidor) | ✅ | Arquivo nunca sai do navegador |
| Nenhuma persistência (RTDB / localStorage / IndexedDB) | ✅ | `persistImport` retorna stub explícito |
| Payload completo não logado no console | ✅ | Apenas metadados/contadores |
| HTML dinâmico sanitizado via `escapeHtml()` | ✅ | Todas as strings de usuário escapadas antes de `innerHTML` |
| `source.institution` e `documentType` obrigatórios | ✅ | Sem valores fictícios silenciosos |
| CPF / conta completa / boleto / cartão completo rejeitados | ✅ | Não são campos do schema |
| `lastFour`/`last4` limitado a 4 caracteres | ✅ | Validação no schema |
| Fingerprint não expõe dados sensíveis na UI | ✅ | Apenas descrição normalizada + metadados de contexto |
| `canonicalFingerprint` calculado localmente | ✅ | Sem envio a servidor; usado para simulação de idempotência |
| Simulação de reimportação não persiste dados | ✅ | `simulateReimport` em memória apenas |
| Regras pessoais locais gitignored | ✅ | `classification-rules.local.js` |
| Regras pessoais não logadas com transações | ✅ | Apenas contadores no relatório |
| Snapshots de cartão locais gitignored | ✅ | `card-snapshots.local.js` |
| Limite de cartão separado de total de fatura | ✅ | Modelo `cardSnapshots` |
| Sample JSON contém apenas dados fictícios | ✅ | Auditado: sem PII real |
| Firebase não conectado / SDK não importado | ✅ | Verificável em DevTools > Sources |

---

## Checklist — Antes de produção (Fase 1+)

### Firebase Auth

- [ ] Habilitar apenas provedores necessários
- [ ] Configurar domínios autorizados (GitHub Pages URL)
- [ ] Exigir e-mail verificado (se e-mail/senha)
- [ ] Logout limpa estado local e listeners RTDB
- [ ] Não confiar em `email`/`displayName` do client para autorização

### Realtime Database Rules

- [ ] Revisão com [firebase-security-rules-auditor](../.agents/skills/firebase-security-rules-auditor/SKILL.md)
- [ ] Nenhum `.read: true` ou `.write: true` sem condição `auth.uid`
- [ ] `.validate` em `amountCents` (inteiro > 0)
- [ ] `.validate` em `flow` (enum)
- [ ] Impedir usuário escrever em `/users/{outroUid}`
- [ ] Testar regras no Simulator do Console Firebase
- [ ] Deploy rules antes de liberar app ao público

### Dados sensíveis

- [ ] Nunca armazenar: CPF, cartão completo, conta/agência, boleto, QR
- [ ] Apenas `lastFour` e hashes opacos
- [ ] Logs do client sem payload financeiro completo

### Frontend

- [ ] CSP headers via meta tag (quando possível no Pages)
- [ ] Sanitizar HTML dinâmico (preferir `textContent` sobre `innerHTML` com input user)
- [ ] Validar JSON no client **e** confiar nas rules no server (defense in depth)

### GitHub Pages

- [ ] Repo público: confirmar que nenhum secret está commitado
- [ ] Branch `gh-pages` ou `/docs` — apenas assets estáticos
- [ ] API Key Firebase: restrita por HTTP referrer no Google Cloud Console

---

## API Key Firebase no client

A API Key do Firebase **é exposta** em apps client-side — isso é esperado. Proteções:

1. **Security Rules** — barreira real de autorização
2. **App Check** (fase futura) — reduz abuso automatizado
3. **Restrições de API** no Google Cloud — referrer do domínio Pages
4. **Quotas e alertas** de billing

---

## Modelo de ameaças (resumido)

| Ameaça | Mitigação |
|--------|-----------|
| Leitura de dados de outro usuário | Rules `auth.uid == $uid` |
| Escrita massiva / spam | Rules + quotas; App Check futuro |
| Import malicioso (JSON huge) | Limite de tamanho no client; validate rules |
| XSS via descrição importada | `escapeHtml()` em toda string antes de `innerHTML` |
| Credencial vazada no git | gitignore + secret scan |

---

## Checklist — Fase 0.3.2 (revisor local e conciliação)

- [x] Arquivo JSON lido apenas via `FileReader` (local, sem upload para servidor)
- [x] Nenhuma gravação em Firebase RTDB, localStorage ou IndexedDB
- [x] Payload completo não registrado em `console.log` (sem vazamento de dados financeiros)
- [x] Toda string de usuário escapada com `esc()` antes de injetar no DOM (XSS mitigation)
- [x] Scanner de privacidade verifica CPF, número de cartão completo, boleto (47-48 dígitos) e sequências numéricas longas (≥12)
- [x] Campos de ID/hash excluídos do scanner (`rawHash`, `externalRef`, `accountId`, `cardId`, etc.)
- [x] Valores iniciados com `sha256:` não flagrados como dados sensíveis
- [x] `lastFour`/`last4` limitados a 4 caracteres — nunca número completo do cartão
- [x] Transações `credit_card_payment` identificadas visualmente; saldo credor NÃO tratado como receita
- [x] `.gitignore` protege: `/imports-local/`, `/data/private/`, `*.real.json`, `*.sensitive.json`, `cfm_import_v1_final_perfeito_validado.json`
- [x] Arquivo real `cfm_import_v1_final_perfeito_validado.json` nunca copiado para `/data` ou versionado
- [x] Ausência confirmada: Firebase SDK, Supabase, dependências externas, chamadas de rede
- [x] Descrições truncadas a 100 chars no relatório (não expor dados longos na UI)
- [x] Duplicatas exatas identificadas por hash; prováveis por fingerprint — nenhuma removida automaticamente
- [x] Status geral do arquivo comunicado visualmente (blockers / pending / ready) antes de qualquer ação do usuário

## Checklist — Fase 0.3.1-B (contrato canônico + drag and drop)

- [x] Enum `transaction.type` alinhado ao contrato canônico (`income`, `expense`, `transfer`, `credit_card_purchase`, `credit_card_payment`, `adjustment`, `fee`, `refund`)
- [x] Rastreabilidade verificada via `transaction.externalRef` ou `transaction.source.rawHash` (não exige `rawHash` na raiz)
- [x] Aviso de rastreabilidade suprimido quando `source.rawHash` presente na transação
- [x] Drag and drop local — arquivo lido via `FileReader`, sem upload para servidor
- [x] Apenas `.json` / `application/json` aceitos; múltiplos arquivos rejeitados com erro claro
- [x] `processImportFile` compartilhado entre input file e drop (sem duplicação de pipeline)
- [x] Nenhuma persistência; Firebase/SDK ausentes

- [x] Classificação de semelhanças local — nenhuma remoção automática de transações
- [x] Sugestões de revisão exibidas sem aplicação automática (`buildSuggestedAction`)

## Incidentes

1. Rotacionar API keys se expostas indevidamente
2. Revisar regras RTDB imediatamente
3. Auditar nós `/users/*` afetados
4. Documentar em STATUS_DO_PROJETO.md

---

## Referências

- [Firebase Security Rules](https://firebase.google.com/docs/database/security)
- [MODELO_DADOS_RTD.md](MODELO_DADOS_RTD.md)
- `database.rules.json` (rascunho — **não considerar produção-ready**)
