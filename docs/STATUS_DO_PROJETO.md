# Status do Projeto

**Projeto:** Controle Financeiro Mensal (CFM)  
**Última atualização:** 10 de julho de 2026  
**Etapa atual:** MVP financeiro mensal local concluído

---

## Projeto legado

O frontend anterior foi encerrado. O código legado permanece acessível pela tag `legacy-v0.6.0` (commit `bebde71`).

## Etapa 2 — concluída

MVP local implementado com:

- receitas e despesas manuais por competência;
- cartões de crédito e faturas mensais;
- dashboard consolidado;
- hash routing (`#/dashboard`, `#/lancamentos`, `#/faturas`, `#/ajustes`);
- persistência em `cfm:v2:appData`;
- testes unitários para cálculos e storage.

## Decisões técnicas

- Valores em centavos inteiros — nunca float.
- Fatura mensal representa o cartão; sem compras individuais.
- Funções de cálculo puras em `finance.ts`.
- `localStorage` centralizado em `storage.ts`.
- Sem framework, sem store global complexo.

## Riscos

- Dados locais podem ser perdidos ao limpar o navegador.
- Sem backup automático ou sincronização entre dispositivos.
- Schema `cfm.local.v2` não migra dados do legado `cfm:v1:appData`.

## Próximo marco

Integração Firebase (Auth + RTDB) e publicação no GitHub Pages.

## Funcionalidades adiadas

- Firebase e autenticação
- Sincronização em nuvem
- Importação bancária (JSON, OFX, CSV)
- Compras individuais de cartão
- Parcelamentos
- Recorrências automáticas
- Categorias inteligentes
- Relatórios avançados e gráficos
- Exportação de dados
- GitHub Actions
