# DDSMS — Atenção às Mudanças

Apresentação web horizontal para condução de **DDSMS** sobre a **Regra de Ouro 8 — Atenção às Mudanças**.

**Mensagem central:** Quando algo muda, pare. Processe. Só prossiga com segurança.

## Experiência

- **6 painéis horizontais** com transições cinematográficas
- Rolagem do mouse/trackpad (**1 painel por gesto**)
- Navegação por menu, rail inferior, teclado e barra de progresso
- Vídeo abre **externamente no SharePoint** (sem embed na página)
- Visual premium industrial — HTML/CSS/JS puro

## Estrutura de pastas

```
ddsms/
├── index.html
├── README.md
├── .gitignore
├── assets/
│   ├── css/          base, layout, components, responsive
│   ├── js/           app.js (scroll/transições)
│   └── img/          hero-tank.svg, og-image.jpg
└── docs/
    └── roteiro-ddsms.md
```

## Como rodar localmente

```bash
cd ddsms
python3 -m http.server 8080
# Acesse http://localhost:8080
```

Também funciona abrindo `index.html` diretamente.

## Vídeo — SharePoint (link externo)

O site é **100% estático**. O vídeo **não roda embutido** na página.

### Como funciona

1. No painel **Vídeo**, clique no placeholder ou em **Abrir vídeo no SharePoint**
2. O vídeo abre em **nova aba** (`target="_blank"`, `rel="noopener noreferrer"`)
3. Faça login com conta corporativa, se necessário
4. Após assistir, retorne à apresentação e avance para o **Debrief**

### Placeholder visual

O painel exibe um card premium 16:9 com botão play, selo **7min28s** e label **SharePoint** — sem carregar vídeo na página.

### O que NÃO existe no projeto

- Nenhum iframe de vídeo na página
- Nenhum MP4 no repositório
- Nenhuma transcrição/VTT na interface
- Nenhuma tentativa de burlar autenticação
- Nenhum backend ou token

O `.gitignore` bloqueia `assets/video/*.mp4`. Material interno deve permanecer fora do repositório.

### Publicação

O site pode ser publicado no GitHub Pages **sem vídeo interno**. O acesso ao vídeo depende de conta corporativa com permissão no SharePoint.

## Navegação horizontal

| Ação | Comportamento |
|------|----------------|
| Scroll mouse/trackpad | Avança/volta 1 painel |
| Menu superior | Vai ao painel |
| Rail inferior (bolinhas) | Vai ao painel |
| `→` / `PageDown` | Próximo painel |
| `←` / `PageUp` | Painel anterior |
| `Home` | Início |
| `End` | Fechamento |
| `P` | Modo apresentação (oculta header) |

Contador **01 / 06** no header. Barra de progresso no topo.

## Painéis

1. Início (Hero)
2. Regra de Ouro 8
3. Os 3 Ps
4. Vídeo (link SharePoint)
5. Debrief
6. Fechamento

## Publicar no GitHub Pages

> **GitHub Pages é público.** Não publique vídeo MP4, documentos internos ou materiais sem autorização.

Repositório recomendado: **`ddsms-atencao-as-mudancas`** (novo, separado do DDSMS antigo).

1. Crie repositório `ddsms-atencao-as-mudancas`
2. Envie os arquivos **sem MP4**
3. Settings → Pages → branch `main`, pasta `/ (root)`
4. O link SharePoint continuará exigindo login corporativo

## Checklist antes de publicar

- [ ] Autorização para publicar textos e referências ao caso
- [ ] OG image sem informação sensível
- [ ] Teste horizontal em desktop, tablet e mobile
- [ ] Teste do link SharePoint logado na rede corporativa
- [ ] Roteiro revisado com facilitador (~2min45s além do vídeo)
- [ ] Nenhum MP4 no commit
- [ ] Nenhum iframe de vídeo no HTML

## Tecnologias

HTML5, CSS modular, JavaScript vanilla. Sem backend, frameworks, npm ou build.

## Licença de uso interno

Material corporativo de SMS. Uso conforme políticas internas da organização.
