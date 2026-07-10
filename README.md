# Controle Financeiro Mensal

Aplicação web para controle financeiro pessoal mensal — receitas, despesas e faturas.

## Propósito

Este repositório foi reiniciado com uma fundação limpa. O legado anterior foi encerrado e preservado via tag Git. O MVP financeiro local será implementado na próxima etapa.

## Stack

- [Vite](https://vite.dev/) — bundler e servidor de desenvolvimento
- TypeScript — tipagem estática
- HTML semântico e CSS próprio — sem framework frontend

## Comandos

```bash
npm install
npm run dev        # desenvolvimento local
npm run typecheck  # verificação de tipos
npm run build      # build de produção (base /cf_marc/)
npm run preview    # pré-visualização do build
```

## Legado preservado

| Item | Referência |
|------|------------|
| Commit funcional | `bebde71` (Fase 0.6.0) |
| Tag | `legacy-v0.6.0` |

Para consultar o código anterior:

```bash
git show legacy-v0.6.0
```

## Integrações futuras

- **Firebase** — Auth e Realtime Database serão integrados em etapa posterior (infraestrutura já presente: `.firebaserc`, `firebase.json`, `database.rules.json`).
- **GitHub Pages** — publicação em `https://hbtmarc.github.io/cf_marc/` será configurada posteriormente.

## Licença

Projeto privado — uso pessoal.
