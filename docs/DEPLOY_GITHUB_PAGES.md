# Deploy — GitHub Pages

Publicação estática do Controle Financeiro Mensal.

---

## Pré-requisitos

- Repositório no GitHub
- Branch `main` (ou `master`) com `index.html` na raiz
- Nenhum build necessário

---

## Opção A: Branch `gh-pages`

1. No GitHub: **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `gh-pages` / `/ (root)`
4. Push da raiz do projeto para `gh-pages`:

```bash
git subtree push --prefix . origin gh-pages
```

Ou copie arquivos estáticos para branch dedicada.

---

## Opção B: Pasta `/docs` (alternativa)

Se preferir manter código na raiz e publicar só `/docs`:

1. Mover assets para estrutura compatível **ou** usar GitHub Actions para copiar
2. Settings → Pages → Source: `main` / `/docs`

> **Projeto atual:** `index.html` está na **raiz** — Opção A é a mais direta.

---

## URL resultante

```text
https://{usuario}.github.io/{repositorio}/
```

Rotas hash funcionam sem config extra:

```text
https://{usuario}.github.io/{repositorio}/#/dashboard
```

---

## Firebase após deploy (Fase 1+)

1. Console Firebase → Authentication → Authorized domains
2. Adicionar `{usuario}.github.io`
3. Google Cloud Console → API Key restrictions → HTTP referrers:

```text
https://{usuario}.github.io/*
```

4. Copiar `config.example.js` → `config.js` **localmente** ou via CI secret (nunca commitar)

---

## Checklist pós-deploy

- [ ] `index.html` carrega (200)
- [ ] CSS/JS carregam (paths relativos OK)
- [ ] Hash router funciona na URL Pages
- [ ] Console sem 404 de assets
- [ ] Mobile responsivo na URL pública

---

## Limitações GitHub Pages

| Recurso | Suportado |
|---------|-----------|
| HTML/CSS/JS estático | ✅ |
| Hash routing | ✅ |
| ES modules via `file://` local | ❌ (usamos scripts clássicos) |
| Server-side API | ❌ |
| Environment secrets no Pages | ❌ (config client-side) |

---

## CI opcional (futuro)

GitHub Action pode:

- Validar JSON de exemplo (`jq` ou script)
- Lint de docs
- Deploy automático em push para `main`

Não incluído na Fase 0.

---

## Rollback

Reverter commit no branch publicado ou apontar Pages para commit anterior em Settings.
