# Roadmap com ponto final

## Etapa 11 — estabilização e fechamento funcional

**Concluída no código.**

- corrigir transações consecutivas no Firebase;
- corrigir typecheck;
- criar testes de sincronização;
- transformar Balanço em checklist pós-salário;
- manter checklist independente do estado financeiro de origem;
- congelar fotografia ao concluir;
- sanitizar código, scripts, documentação e dependências.

## Etapa 12 — validação final do MVP

Esta é a última etapa antes do ponto de corte.

1. Em uma instalação limpa, executar:

```bash
npm ci
npm run verify
```

2. No ambiente real, fazer o smoke test mínimo:
   - salvar uma alteração e sincronizar;
   - salvar uma segunda alteração e sincronizar novamente;
   - recarregar a página e confirmar persistência;
   - marcar o checklist de uma competência;
   - concluir, reabrir e concluir novamente;
   - exportar um backup JSON.

3. Publicar no GitHub Pages.
4. Criar a tag `v0.3.0-mvp`.

## Definição objetiva de pronto

O MVP termina quando todos os itens abaixo estiverem confirmados:

- `npm run verify` verde em instalação limpa;
- duas gravações remotas consecutivas persistidas;
- recarga mantém os dados;
- checklist conclui e reabre sem alterar lançamentos ou faturas;
- backup exportado com sucesso;
- versão publicada e tag criada.

**Depois da tag, o MVP está encerrado.** Nenhuma melhoria estética, refatoração ampla ou nova funcionalidade deve atrasar esse corte.

## Pós-MVP — novos rumos

Ordem recomendada:

1. autenticação e Rules privadas por usuário;
2. App Check e endurecimento da segurança;
3. refinamentos de UX baseados no uso real;
4. otimização de bundle apenas se métricas indicarem necessidade;
5. novas funcionalidades priorizadas por valor de uso.
