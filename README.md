# Controle Financeiro Mensal (CFM)

Aplicação web premium para controle financeiro pessoal mensal — entradas, saídas, cartões, faturas, despesas fixas, recorrências, parcelas, histórico e importação JSON.

## Stack

- HTML, CSS e JavaScript puros (sem framework, sem npm)
- Hospedável em **GitHub Pages**
- Hash routing (`#/dashboard`, `#/importar`, etc.)
- **Firebase** (Auth + Realtime Database) — integração planejada; não conectada nesta fase
- UI em **PT-BR**

## Fase atual

**Fase 0 — Fundação.** Shell visual, documentação, schema de importação e regras RTDB iniciais. Sem CRUD funcional, sem Auth, sem persistência.

Consulte [docs/STATUS_DO_PROJETO.md](docs/STATUS_DO_PROJETO.md) para detalhes.

## Executar localmente

Abra `index.html` diretamente no navegador (duplo clique ou arraste para a janela). Não é necessário servidor.

```text
index.html
```

## Rotas

| Hash | Página |
|------|--------|
| `#/dashboard` | Visão do mês |
| `#/importar` | Importação JSON |
| `#/cartoes` | Cartões de crédito |
| `#/historico` | Histórico mensal |

## Estrutura

```text
/
├── index.html
├── assets/css|js|img
├── src/app|router|components|pages|services|store|schemas|utils
├── data/sample-import.cfm.v1.json
├── docs/
├── database.rules.json
└── firebase.json
```

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [STATUS_DO_PROJETO.md](docs/STATUS_DO_PROJETO.md) | Estado atual, riscos, próximos passos |
| [ROADMAP.md](docs/ROADMAP.md) | Marcos do produto |
| [ARQUITETURA.md](docs/ARQUITETURA.md) | Visão técnica |
| [MODELO_DADOS_RTD.md](docs/MODELO_DADOS_RTD.md) | Estrutura Firebase RTDB |
| [SCHEMA_IMPORTACAO_JSON.md](docs/SCHEMA_IMPORTACAO_JSON.md) | Formato cfm.import.v1 |
| [APPSEC.md](docs/APPSEC.md) | Checklist de segurança |
| [DEPLOY_GITHUB_PAGES.md](docs/DEPLOY_GITHUB_PAGES.md) | Publicação |

## Firebase (preparação)

1. Copie `src/app/config.example.js` → `src/app/config.js` (ignorado pelo git)
2. Preencha credenciais do Console Firebase
3. Revise `database.rules.json` antes de deploy em produção

## Licença

Projeto privado — uso pessoal.
