# CF Marc

Controle financeiro pessoal mensal, local-first, construído com Vite, TypeScript e Firebase Realtime Database.

A versão `0.3.0` concentra o escopo necessário ao MVP: importação financeira, lançamentos, recorrências, parcelamentos, faturas, planejamento, dashboard, checklist mensal de pagamentos, persistência local e sincronização remota.

## Fluxo principal

1. Importe ou registre receitas, despesas, cartões e faturas.
2. Confira o mês no Dashboard.
3. Use **Pagamentos do mês** como checklist ao receber o salário.
4. Marque contas fixas, faturas reais e demais compromissos já conferidos.
5. Conclua o fechamento para congelar a fotografia daquele momento.

O checklist é deliberadamente uma camada de acompanhamento. Marcar um item não altera o lançamento, a recorrência ou a fatura de origem. O estado financeiro continua sendo controlado nas telas próprias; a página de pagamentos apenas registra a conferência mensal.

## Páginas

- Dashboard: visão executiva da competência.
- Lançamentos: receitas, despesas, parcelamentos e projeções.
- Faturas: valores reais e projetados dos cartões.
- Planejamento: recorrências e compromissos futuros.
- Pagamentos do mês: checklist pós-salário e fotografia de fechamento.
- Ajustes: importação, backup, persistência e sincronização.

## Comandos

```bash
npm ci
npm run dev
npm run verify
npm run clean
```

`npm run verify` executa typecheck, testes e build de produção.

Para testar Rules localmente, com Java instalado:

```bash
npm run firebase:test-rules
```

## Persistência

- `localStorage`: cache local e funcionamento local-first.
- Firebase Realtime Database: cópia remota sincronizada com controle de revisão.
- Backup JSON: exportação e restauração manual.

## Segurança atual

A interface de login e o fechamento das Rules foram deliberadamente adiados. As Rules atuais permitem acesso público aos nós financeiros configurados; portanto, esta versão deve ser usada apenas em ambiente pessoal/controlado. A segurança completa é o primeiro marco pós-MVP e está documentada em `docs/SECURITY.md`.

## Estrutura essencial

```text
src/
  pages/                  controladores das telas
  cloud-sync.ts           leitura, escrita e conflito remoto
  payment-checklist.ts    composição do checklist mensal
  monthly-balance.ts      persistência e fotografia do fechamento
  storage.ts              validação e persistência local
  finance.ts              cálculos financeiros centrais
scripts/
  clean.mjs               remove artefatos gerados
docs/
  STATUS.md
  ROADMAP.md
  SECURITY.md
```

## Estado do produto

Consulte `docs/STATUS.md` para a validação atual e `docs/ROADMAP.md` para o ponto final do MVP.
