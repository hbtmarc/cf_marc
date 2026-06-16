# Arquitetura

## Visão geral

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub Pages (estático)               │
│  index.html → CSS → JS (CFM namespace) → Hash Router   │
└──────────────────────────┬──────────────────────────────┘
                           │ (Fase 1+)
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Firebase (client-side SDK)                  │
│  ┌─────────────┐    ┌──────────────────────────────┐   │
│  │    Auth     │    │   Realtime Database (RTDB)    │   │
│  │  uid/token  │───▶│   /users/{uid}/...            │   │
│  └─────────────┘    └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Camadas frontend

| Camada | Pasta | Responsabilidade |
|--------|-------|------------------|
| Shell | `index.html`, `assets/css` | Layout, tema, responsividade |
| Bootstrap | `src/app/bootstrap.js` | Inicialização, wiring |
| Router | `src/router/router.js` | Hash routing, título, nav ativa |
| Pages | `src/pages/*.page.js` | Renderização por rota |
| Store | `src/store/app.store.js` | Estado UI em memória |
| Schemas | `src/schemas/` | Validação estrutural |
| Services | `src/services/` | Lógica de domínio (import, etc.) |
| Config | `src/app/config.js` | Credenciais Firebase (gitignored) |

## Princípios

1. **Zero build** — arquivos servidos como estão; paths relativos.
2. **Fail closed** — RTDB nega tudo até regra explícita por uid.
3. **Leituras estreitas** — dados organizados por uid → mês → entidade.
4. **Centavos + flow** — nunca valor negativo; direção semântica separada.
5. **Auth ≠ autorização** — token válido não implica acesso a dados de terceiros.

## Fluxo de importação (planejado)

```
JSON file → parseJson → validate (cfm.import.v1) → preview → [Auth] → persist RTDB
                                                              ↑
                                                         Fase 0: stub
```

## Roteamento

| Hash | Módulo |
|------|--------|
| `#/dashboard` | `dashboard.page.js` |
| `#/importar` | `importer.page.js` |
| `#/cartoes` | `cards.page.js` |
| `#/historico` | `history.page.js` |

Fallback: redireciona para `#/dashboard`.

## Compatibilidade GitHub Pages

- Sem `import`/`export` ES modules (bloqueio CORS em `file://`).
- Scripts clássicos com namespace `window.CFM`.
- Assets com paths relativos (`assets/...`, `src/...`).
- Hash routing (não depende de rewrite server-side).

## Segurança (resumo)

Ver [APPSEC.md](APPSEC.md). Regras RTDB iniciais em `database.rules.json` — **rascunho**, refinamento obrigatório antes de produção.
