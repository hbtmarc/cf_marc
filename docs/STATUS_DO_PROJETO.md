# Status do Projeto

**Projeto:** Controle Financeiro Mensal (CFM)  
**Última atualização:** 10 de julho de 2026  
**Etapa atual:** Etapa 4 — Importação local funcional

---

## Etapa 4 — concluída

### Objetivo

Permitir importação local de arquivos JSON `cfm.import.v1` com validação, revisão, confirmação e idempotência — sem alterar a fundação visual.

### Entregas

- Rota `#/importar` no grupo Operação.
- Validação de schema, referências, centavos inteiros e `canonicalFingerprint`.
- Revisão antes da gravação; confirmação explícita.
- Idempotência por `sourceImportId` e fingerprint.
- Integração com Dashboard, Lançamentos e Faturas.
- Fatura credora com `creditBalanceCents` e status "Credora".
- Modelo `cfm.local.v2` estendido minimamente (`importMeta`, campos opcionais).

### Validação

- `npm run typecheck`, `npm test` (50), `npm run build` — OK.
- Screenshots em `docs/screenshots-etapa4/` (não versionados).

---

## Etapa 3E — concluída

### Objetivo

Acabamento geométrico da fundação visual: alinhamento, espaçamento, eixos, baselines e ritmo vertical/horizontal entre páginas — sem redesign, novas cores, tipografia ou funcionalidades.

### Sistema de espaçamento

Escala consolidada em múltiplos de 4 px via tokens existentes (`--space-1` … `--space-16`):

| Token | Valor | Uso principal |
|-------|-------|---------------|
| `--space-2` | 8 px | Label → campo; overline → H1; itens íntimos |
| `--space-3` | 12 px | Cabeçalho de seção → conteúdo; título → tabela |
| `--space-4` | 16 px | Padding interno; painéis na mesma coluna |
| `--space-5` | 20 px | Grupos intermediários; subseções contextuais |
| `--space-6` | 24 px | Toolbar → listagem; colunas do dashboard |
| `--space-8` | 32 px | Grandes seções (Ajustes, cards → faturas) |

### Regras de propriedade do gap

- **Página:** gutter, largura máxima, distância header → conteúdo (`page-stack`, `main-content`).
- **Seção:** distância cabeçalho → conteúdo interno (`section-header`, `list-panel`).
- **Componente:** padding e gap internos (`panel`, `card-panel`, `toolbar-panel`).
- **Elementos:** sem margens externas arbitrárias para corrigir fluxo.

### Principais correções

- **Dashboard:** colunas independentes — transações recentes dentro de `dashboard-grid__primary` (elimina faixa vazia sob Ritmo do mês).
- **Lançamentos:** toolbar separada da listagem (`list-panel`); 24 px entre grupos; contador na baseline do título.
- **Faturas:** ritmo cards → faturas (32 px); cabeçalhos e tabela com eixos compartilhados.
- **Ajustes:** ritmo entre seções (32 px); details com padding uniforme; texto com largura de leitura.
- **Sidebar:** espaçamento previsível entre marca, grupos e rodapé.
- **Global:** baselines em headers, contadores, toolbars e ações; campos com mesma altura na mesma linha.

### Fundação visual

Etapas 3B–3D estabeleceram identidade, componentes e hierarquia. A Etapa 3E encerra definitivamente a fundação visual. Próximos trabalhos devem avançar o roadmap funcional (Firebase, domínio), não novo reskin nem ajustes cosméticos ad hoc.

### Validação

- Viewports: 1920×1080 a 320×568; zoom 100–200%.
- `npm run typecheck`, `npm test` (34), `npm run build` — OK.
- Screenshots em `docs/screenshots-etapa3e/` (não versionados).
- Playwright executado em diretório temporário fora do repositório (sem alterar manifests).

### Limitações conscientes

Sem rotas Contas/Importação/Balanço; sem limites de cartão, parcelas ou conciliação no schema.

## Projeto legado

Tag `legacy-v0.6.0` (commit `bebde71`).

## Etapas anteriores

- **Etapa 2:** MVP financeiro local.
- **Etapa 3B–3D:** Identidade, componentes, hierarquia e polimento sistêmico (base desta fundação).
