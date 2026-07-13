# Controle Financeiro Mensal

Aplicação web para controle financeiro pessoal mensal — receitas, despesas e faturas de cartão por competência, com sincronização na nuvem via Firebase.

## Stack

- Vite + TypeScript (modo estrito)
- Hash routing (`#/rota`) compatível com GitHub Pages
- Firebase Authentication (Google)
- Firebase Realtime Database (`cfmarc-marc35`)
- `localStorage` como cache e contingência offline

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

### Caminho RTDB

```text
users/{uid}/finance
```

### Envelope

```json
{
  "schemaVersion": "cfm.cloud.v1",
  "updatedAt": 1719792000000,
  "data": { /* AppData — schema interno cfm.local.v2 */ }
}
```

### Camadas

| Arquivo | Função |
|---------|--------|
| `firebase-config.ts` | Config pública do projeto |
| `firebase.ts` | Init SDK (`getApps`/`getApp`) |
| `auth-service.ts` | Google popup/redirect, persistência local, logout |
| `cloud-sync.ts` | Leitura/escrita RTDB |
| `data-store.ts` | Bootstrap, migração, debounce 600 ms, estados de sync |
| `storage.ts` | Cache `cfm:v2:appData` |

### Fonte de verdade

Após login: **Firebase** é principal; `localStorage` é cache. Offline continua legível/gravável localmente. Política do MVP: **última gravação válida vence**.

### Migração

| Cenário | Comportamento |
|---------|---------------|
| Remoto válido | Carrega remoto; atualiza cache; não sobrescreve com local |
| Remoto vazio + local com dados | Modal confirmável |
| Ambos vazios | `emptyAppData()` |
| Remoto inválido | Mantém cache local; erro recuperável |

### Security Rules

Negam tudo por padrão. Acesso somente em `users/{uid}/finance` quando `auth.uid === $uid`. Envelope validado (`schemaVersion`, `updatedAt` numérico, `data`).

Publicar: `npm run firebase:deploy-database`

## GitHub Pages

- Base do build: `/cf_marc/`
- Workflow: `.github/workflows/deploy.yml` (typecheck → test → build → deploy)
- Domínios autorizados no Auth: `localhost`, `hbtmarc.github.io`, `cfmarc-marc35.firebaseapp.com`

Pré-visualizar build como no Pages:

```bash
npm run build
mkdir -p .preview/cf_marc && cp -R dist/* .preview/cf_marc/
npx serve .preview -l 4177
# http://localhost:4177/cf_marc/
```

## Recuperação offline

Dados permanecem em `cfm:v2:appData`. Após reconectar, use **Tentar novamente** na sidebar ou recarregue autenticado.

## Licença

Projeto privado — uso pessoal.
