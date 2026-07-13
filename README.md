# Controle Financeiro Mensal

Aplicação web para controle financeiro pessoal mensal — receitas, despesas e faturas de cartão por competência, com acesso imediato via cache local e sincronização na nuvem via Firebase.

## Stack

- Vite + TypeScript (modo estrito)
- Hash routing (`#/rota`) compatível com GitHub Pages
- Firebase Authentication anônimo (sessão técnica invisível)
- Firebase Realtime Database (`cfmarc-marc35`)
- `localStorage` como cache durável e operação offline

## Comandos

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run build
npm run preview

# Firebase CLI local (npx firebase)
npm run firebase:login
npm run firebase:projects
npm run firebase:emulators
npm run firebase:test-rules      # JDK 21+ e Emulator Suite
npm run firebase:deploy-database
npm run firebase:deploy-auth
```

## Firebase

**Projeto:** `cfmarc-marc35`  
**RTDB:** `https://cfmarc-marc35-default-rtdb.firebaseio.com`  
**GitHub Pages:** `https://hbtmarc.github.io/cf_marc/`

A configuração web pública está versionada em `src/firebase-config.ts`. Não há secrets do Firebase no GitHub Actions — o bundle já contém os valores públicos do cliente.

Única variável de ambiente opcional (`.env.example`):

| Variável | Uso |
|----------|-----|
| `VITE_USE_FIREBASE_EMULATORS` | `true` → Auth `127.0.0.1:9099`, RTDB `127.0.0.1:9000` |

**Nunca** versionar service account, chave privada ou token administrativo.

**App Check** — hardening futuro; não implementado.

## Arquitetura

### Acesso imediato (local-first)

1. Lê e valida `cfm:v2:appData` no `localStorage`
2. Monta o Dashboard imediatamente (sem tela de login)
3. Inicia Firebase em segundo plano
4. Cria ou reutiliza sessão anônima invisível (`signInAnonymously`)
5. Escuta `personal/finance` com `onValue` e reconcilia com o cache local

### Caminho RTDB

```text
personal/finance
```

O `uid` anônimo autorizado nas Security Rules **não** faz parte do caminho dos dados — serve apenas para autorização.

### Envelope

```json
{
  "schemaVersion": "cfm.cloud.v1",
  "revision": 0,
  "updatedAt": 1719792000000,
  "writerId": "uuid-da-instalação",
  "data": { /* AppData — schema interno cfm.local.v2 */ }
}
```

### Camadas

| Arquivo | Função |
|---------|--------|
| `firebase-config.ts` | Config pública do projeto |
| `firebase.ts` | Init SDK (`getApps`/`getApp`) |
| `auth-service.ts` | Sessão anônima invisível, `browserLocalPersistence` |
| `firebase-owner.ts` | UID anônimo autorizado nas Rules |
| `cloud-sync.ts` | `onValue`, `runTransaction`, conectividade |
| `sync-meta.ts` | Metadados de sync no `localStorage` |
| `data-store.ts` | Bootstrap local-first, debounce 600 ms, conflitos |
| `storage.ts` | Cache `cfm:v2:appData` |

### Dupla persistência

Toda alteração legítima:

1. Atualiza estado da aplicação
2. Grava imediatamente no `localStorage`
3. Marca `pendingSync` quando necessário
4. Grava no RTDB após debounce (~600 ms)
5. Confirma e atualiza metadados de revisão

### Estados de sincronização

`Conectando à nuvem…` · `Salvo neste dispositivo e na nuvem` · `Sincronizando…` · `Offline — alterações salvas neste dispositivo` · `Erro ao sincronizar` · `Dados mais recentes recebidos da nuvem`

Indicador discreto na sidebar (`role="status"`, `aria-live="polite"`). Não bloqueia a interface.

### Security Rules

Negam tudo por padrão. Acesso somente em `personal/finance` quando `auth.uid` corresponde ao UID anônimo do dispositivo proprietário. Envelope validado (`schemaVersion`, `revision`, `updatedAt`, `writerId`, `data`). Deleção integral rejeitada.

Testar: `npm run firebase:test-rules`  
Publicar: `npm run firebase:deploy-database`

### Sessão anônima — limitações

- A sessão está vinculada ao armazenamento do navegador
- Apagar dados do navegador pode gerar novo `uid` e perder autorização nas Rules
- Um segundo dispositivo futuro exigirá inclusão controlada do respectivo `uid` nas Rules
- Autenticação permanente entre dispositivos permanece fora do escopo do MVP

Habilitar provedor: Firebase Console → Authentication → Sign-in method → **Anonymous** → Enable

### Registrar dispositivo proprietário

O `uid` anônimo autorizado nas Rules corresponde ao navegador em que a sessão foi criada:

1. Abra `http://localhost:5173/#/dashboard`
2. No console do navegador:  
   `(await import('/src/auth-service.ts')).ensureAnonymousSession().then(u => console.log(u.uid))`
3. Atualize `src/firebase-owner.ts` e `database.rules.json` com esse uid
4. Execute `npm run firebase:test-rules` e `npm run firebase:deploy-database`

Ou use `node scripts/obtain-owner-uid.mjs` (perfil Playwright em `.playwright-owner-profile/`).

**Não apague todo o `localStorage`** — isso remove também a sessão Firebase e gera um novo `uid`.

### Política de conflito

- Remoto mais recente prevalece quando não há alteração local pendente
- Alteração local pendente com remoto mais recente: backup local preservado; remoto aplicado; ação em Ajustes para verificar cópia preservada
- Sem merge por campo, CRDT ou event sourcing

## GitHub Pages

- Base do build: `/cf_marc/`
- Workflow: `.github/workflows/deploy.yml` (typecheck → test → build → deploy)
- Hash routing preservado

Pré-visualizar build como no Pages:

```bash
npm run build
mkdir -p .preview/cf_marc && cp -R dist/* .preview/cf_marc/
npx serve .preview -l 4177
# http://localhost:4177/cf_marc/
```

## Recuperação offline

Dados permanecem em `cfm:v2:appData`. Alterações offline ficam marcadas em `cfm:v2:syncMeta` (`pendingSync`). Após reconectar, a sincronização retoma automaticamente ou use **Tentar novamente** na sidebar.

## Licença

Projeto privado — uso pessoal.
