# Controle Financeiro Mensal

Aplicação web para controle financeiro pessoal mensal — receitas, despesas e faturas de cartão por competência, com sincronização na nuvem via Firebase.

## Objetivo

Responder rapidamente, para cada mês:

- quanto pretendo receber e quanto já recebi;
- quanto pretendo pagar e quanto já paguei;
- qual é o saldo planejado e o saldo realizado.

O cartão de crédito é controlado pela **fatura mensal**, sem compras individuais nesta etapa.

## Stack

- Vite + TypeScript (modo estrito)
- HTML semântico e CSS próprio
- Hash routing compatível com GitHub Pages (`#/rota`)
- Firebase Authentication (Google)
- Firebase Realtime Database
- `localStorage` como cache e contingência offline

## Comandos

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run test:rules   # requer Java (Emulator Suite)
npm run build
npm run preview
npm run emulators    # Auth + RTDB locais
```

## Configuração do Firebase

1. Copie `.env.example` para `.env` e preencha com os valores do Firebase Console (configuração web do app).
2. **Não** inclua service account, chave privada ou token administrativo no repositório.
3. Para desenvolvimento local com emuladores, defina `VITE_USE_FIREBASE_EMULATORS=true`.
4. Sem variáveis configuradas, o app opera em modo somente local (útil para testes e CI).

Variáveis Vite:

| Variável | Uso |
|----------|-----|
| `VITE_FIREBASE_API_KEY` | API key pública |
| `VITE_FIREBASE_AUTH_DOMAIN` | Domínio Auth |
| `VITE_FIREBASE_DATABASE_URL` | URL do RTDB |
| `VITE_FIREBASE_PROJECT_ID` | ID do projeto |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket (config web) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
| `VITE_FIREBASE_APP_ID` | App ID |
| `VITE_USE_FIREBASE_EMULATORS` | `true` para emuladores locais |

### Passos manuais no Firebase Console

- Habilitar **Google** como provedor de login em Authentication.
- Adicionar domínios autorizados: `localhost`, URL do GitHub Pages (`*.github.io`).
- Publicar as regras: `firebase deploy --only database`.

**App Check** pode ser adicionado futuramente como hardening; não está implementado neste MVP.

## Arquitetura de dados

### Caminho no Realtime Database

```text
users/{uid}/finance
```

### Envelope na nuvem

```json
{
  "schemaVersion": "cfm.cloud.v1",
  "updatedAt": "2026-07-01T00:00:00.000Z",
  "data": { /* AppData completo — schema cfm.local.v2 */ }
}
```

- Um snapshot financeiro por usuário (MVP).
- Validação e normalização reutilizam `storage.ts`.
- Edições simultâneas em dois dispositivos: prevalece a gravação mais recente (sem merge campo a campo).

### Fonte de verdade e cache

| Situação | Comportamento |
|----------|---------------|
| Autenticado + online | Firebase é a fonte principal; cada leitura válida atualiza `localStorage` |
| Offline / falha temporária | Cache local continua legível e gravável |
| Sem Firebase configurado | Somente `localStorage` (testes, CI) |

Chave local: `cfm:v2:appData` — schema `cfm.local.v2`.

### Migração inicial

| Cenário | Ação |
|---------|------|
| Remoto com dados | Carrega remoto; atualiza cache; **não** sobrescreve com local |
| Remoto vazio + local com dados | Modal de confirmação antes de enviar |
| Ambos vazios | Estado vazio normal |

Os dados locais **não** são apagados após a migração.

### Sincronização

Estados na sidebar (`role="status"`, `aria-live="polite"`):

- Conectando…
- Sincronizando…
- Salvo na nuvem
- Offline — salvo neste dispositivo
- Erro ao sincronizar (+ **Tentar novamente** quando aplicável)

Gravações remotas usam debounce de 600 ms; ações concluídas são persistidas. O app tenta aguardar gravações pendentes ao sair.

## Security Rules

Arquivo: `database.rules.json`

- Negar leitura/escrita por padrão.
- Permitir somente `auth.uid === $uid` em `users/$uid/finance`.
- Validar envelope (`schemaVersion`, `updatedAt`, `data`).

Testes: `npm run test:rules` (Firebase Emulator Suite + Vitest). Requer **Java** instalado.

## Deploy — GitHub Pages

- Base do Vite: `/cf_marc/` (build e preview).
- Workflow: `.github/workflows/deploy.yml` — typecheck, testes, build e deploy.
- Configure os secrets `VITE_FIREBASE_*` no repositório GitHub para o build de produção.
- Host permanece no GitHub Pages (não Firebase Hosting).

Pré-visualizar o build como no Pages:

```bash
npm run build
mkdir -p .preview/cf_marc && cp -R dist/* .preview/cf_marc/
npx serve .preview -l 4177
# abrir http://localhost:4177/cf_marc/
```

## Estrutura principal

```text
src/
  app.ts              # bootstrap, auth gate, migração
  data-store.ts       # sync, debounce, estados
  firebase.ts         # init SDK modular
  cloud-sync.ts       # leitura/escrita RTDB
  cloud-envelope.ts   # envelope cfm.cloud.v1
  auth-service.ts     # Google sign-in/out
  auth-screen.ts      # tela de acesso
  storage.ts          # localStorage + validação AppData
  pages/              # telas do MVP
```

## Recuperação com cache local

Se a sincronização falhar de forma persistente:

1. Os dados continuam disponíveis no navegador (`cfm:v2:appData`).
2. Corrija conectividade ou credenciais Firebase.
3. Use **Tentar novamente** na sidebar ou recarregue após autenticar.
4. Se o remoto estiver vazio e o local tiver dados, o fluxo de migração oferece envio manual.

## Limites atuais

- Login somente com Google
- Sem colaboração em tempo real nem resolução avançada de conflitos
- Sem Cloud Functions, Firestore, Storage, PWA ou service worker
- Sem novas funcionalidades financeiras nesta etapa

## Legado preservado

| Item | Referência |
|------|------------|
| Commit funcional anterior | `bebde71` |
| Tag | `legacy-v0.6.0` |

## Licença

Projeto privado — uso pessoal.
