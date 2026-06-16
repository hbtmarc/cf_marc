# Decisões Técnicas

Registro de decisões arquiteturais (ADR simplificado).

---

## ADR-001: Stack vanilla (HTML/CSS/JS)

**Status:** Aceito  
**Contexto:** Hospedagem em GitHub Pages sem infraestrutura de build.  
**Decisão:** Sem React, Vue, npm ou bundler.  
**Consequências:** Organização via namespace global; scripts em ordem fixa no HTML.

---

## ADR-002: Hash routing

**Status:** Aceito  
**Contexto:** GitHub Pages não reescreve URLs para SPAs por padrão.  
**Decisão:** Rotas `#/dashboard`, `#/importar`, etc.  
**Consequências:** URLs com hash; funciona em `file://` e Pages sem config extra.

---

## ADR-003: Firebase RTDB (não Firestore)

**Status:** Aceito  
**Contexto:** Modelo hierárquico por uid/mês; leituras pontuais; custo previsível.  
**Decisão:** Realtime Database como store primário.  
**Consequências:** Modelo documentado em `MODELO_DADOS_RTD.md`; regras em JSON.

---

## ADR-004: Valores em centavos (inteiros)

**Status:** Aceito  
**Contexto:** Evitar erros de ponto flutuante em finanças.  
**Decisão:** `amountCents` sempre inteiro positivo; `flow`: `in` | `out` | `neutral`.  
**Consequências:** UI formata para BRL; validação rejeita negativos.

---

## ADR-005: Schema de importação versionado

**Status:** Aceito  
**Contexto:** Múltiplas fontes de exportação no futuro.  
**Decisão:** `schemaVersion: cfm.import.v1` com campos canônicos documentados.  
**Consequências:** Breaking changes exigem `cfm.import.v2`.

---

## ADR-006: Supabase fora do escopo

**Status:** Aceito  
**Contexto:** Foco em Firebase como plano primário nesta fase.  
**Decisão:** Não adicionar Supabase até reavaliação explícita.  
**Consequências:** Sem dependência dual de backend.

---

## ADR-007: config.js gitignored

**Status:** Aceito  
**Contexto:** API keys Firebase são expostas no client, mas não devem vazar entre repos.  
**Decisão:** `config.example.js` no repo; `config.js` local ignorado.  
**Consequências:** Deploy manual copia config; documentado no README.

---

## ADR-008: Scripts clássicos vs ES modules

**Status:** Aceito  
**Contexto:** Critério de aceite exige abrir `index.html` diretamente.  
**Decisão:** `<script src>` sem `type="module"`.  
**Consequências:** Sem tree-shaking; ordem de scripts manual no HTML.

---

## ADR-009: Persistência de importação adiada

**Status:** Aceito (Fase 0)  
**Contexto:** Auth e regras RTDB ainda não integrados.  
**Decisão:** `import.service.js` valida em memória; `persistImport` retorna stub.  
**Consequências:** Fase 1 implementa gravação real.

---

## ADR-010: Tema claro como padrão oficial do produto (sem dark mode no MVP)

**Status:** Aceito (Fase 0.1 — refinamento visual)  
**Contexto:** O produto foi inicialmente prototipado em tema escuro por convenção de ferramenta. Após revisão de direção do produto, concluiu-se que o perfil do usuário e o posicionamento de produto financeiro premium exigem tema claro como padrão.  
**Decisão:** O design system oficial adota tema claro (`--color-bg: #f5f7fb`, superfícies brancas, texto escuro, acentos azul/verde/vermelho/âmbar apenas em contexto financeiro semântico). Não haverá toggle dark/light nem tema alternativo no MVP.  
**Consequências:**
- `base.css` reescrito com tokens light premium.
- Todos os componentes, layout e páginas usam exclusivamente os novos tokens.
- Nenhuma `@media (prefers-color-scheme: dark)` adicionada nesta fase.
- Decisão pode ser revisada em fase futura, após feedback de usuários reais.
