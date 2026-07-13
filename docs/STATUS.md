# Status atual — CF Marc 0.3.0

## Situação

**Release candidate do MVP.** O escopo funcional essencial foi fechado. Não devem entrar novas funcionalidades antes da validação final e da tag do MVP.

## Entregue

- importação financeira e prevenção de duplicidade;
- receitas, despesas, taxas e estornos;
- cartões, faturas reais e faturas projetadas;
- parcelas e compromissos futuros;
- recorrências e reconciliação;
- dashboard mensal;
- planejamento;
- checklist pós-salário em **Pagamentos do mês**;
- fotografia congelada ao concluir o fechamento;
- persistência local-first;
- sincronização Firebase com revisão e detecção de conflito;
- backup e restauração;
- suíte automatizada e build de produção.

## Correções desta versão

- a transação do Realtime Database passa a tratar corretamente o valor bruto recebido pelo callback;
- gravações remotas consecutivas incrementam a revisão;
- uma revisão remota mais nova bloqueia sobrescrita silenciosa;
- typecheck sem imports órfãos;
- concorrência do Vitest limitada para execução mais previsível;
- Playwright atualizado;
- arquivos históricos, artefatos gerados, configurações locais e módulos órfãos removidos;
- documentação consolidada.

## Semântica do checklist

- lê contas fixas, faturas reais e outros compromissos da competência;
- mantém previsões separadas dos itens pagáveis;
- registra checks apenas no fechamento mensal;
- não altera lançamentos, recorrências nem faturas;
- calcula progresso, saldo atual, compromissos em aberto e saldo estimado após quitação;
- ao concluir, congela a fotografia financeira e a lista conferida.

## Validação técnica

- TypeScript: aprovado;
- testes unitários: 352 aprovados em 32 arquivos;
- build de produção: aprovado;
- teste automatizado de primeira gravação, gravação consecutiva e conflito remoto: aprovado;
- Rules: mantidas públicas por decisão de escopo; teste de emulador fica para a etapa de segurança;
- deploy e smoke test no Firebase real: pendentes como validação final operacional.

## Não bloqueadores conhecidos

- aviso de tamanho do chunk principal no build; não há evidência de impacto relevante para este MVP;
- vulnerabilidades moderadas transitivas em ferramentas de desenvolvimento do Firebase; nenhuma vulnerabilidade alta permaneceu após a atualização aplicada;
- autenticação, Rules privadas e App Check foram movidos para o pós-MVP.
