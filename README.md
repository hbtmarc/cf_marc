# Controle Financeiro Mensal

Aplicação web para controle financeiro pessoal mensal — receitas, despesas e faturas de cartão por competência.

## Objetivo

Responder rapidamente, para cada mês:

- quanto pretendo receber e quanto já recebi;
- quanto pretendo pagar e quanto já paguei;
- qual é o saldo planejado e o saldo realizado.

O cartão de crédito é controlado pela **fatura mensal**, sem compras individuais nesta etapa.

## Stack

- Vite
- TypeScript (modo estrito)
- HTML semântico e CSS próprio
- Hash routing compatível com GitHub Pages
- Persistência local em `localStorage`

## Comandos

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run build
npm run preview
```

## Estrutura

```text
src/
  app.ts           # bootstrap e estado
  router.ts        # hash routing
  types.ts         # contratos de dados
  finance.ts       # cálculos e validações puras
  storage.ts       # localStorage cfm:v2:appData
  ui.ts            # componentes visuais compartilhados
  forms.ts         # formulários e CRUD
  pages/           # telas do MVP
  styles.css
```

## Armazenamento local

Chave: `cfm:v2:appData`

Schema: `cfm.local.v2`

Os dados ficam apenas no navegador deste dispositivo. Não há migração automática do legado `cfm:v1:appData`.

## Regras de cálculo

Para a competência selecionada:

| Indicador | Regra |
|-----------|-------|
| Receitas planejadas | soma de todas as receitas |
| Receitas recebidas | receitas com status `settled` |
| Despesas planejadas | despesas + faturas da competência |
| Despesas pagas | despesas `settled` + faturas `paid` |
| Saldo planejado | receitas planejadas − despesas planejadas |
| Saldo realizado | receitas recebidas − despesas pagas |

Valores monetários são sempre inteiros em centavos.

## Limites atuais

- Sem Firebase, login ou sincronização
- Sem importação bancária
- Sem compras individuais de cartão, parcelas ou recorrências
- Sem gráficos, relatórios avançados ou exportação

## Legado preservado

| Item | Referência |
|------|------------|
| Commit funcional anterior | `bebde71` |
| Tag | `legacy-v0.6.0` |

## Deploy

O build de produção usa base `/cf_marc/` para publicação futura no GitHub Pages. O workflow de deploy será configurado posteriormente.

## Licença

Projeto privado — uso pessoal.
