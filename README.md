# Controle Financeiro Anual

Aplicação web estática para visualização anual e mensal de finanças pessoais a partir de um arquivo JSON.

## Sobre o projeto

Este é um projeto **estático** feito apenas com **HTML**, **CSS** e **JavaScript** (vanilla). Não há build, bundler nem dependências npm.

Os ícones vêm do [Phosphor Icons](https://phosphoricons.com/), carregados via CDN (peso *regular*). Para usar um ícone, combine a classe base `ph` com o nome do ícone, por exemplo: `<i class="ph ph-house"></i>`. Consulte o site para ver todos os ícones disponíveis.

O cabeçalho unificado exibe a marca **CFMarc** à esquerda e a navegação por ícones à direita; ao passar o mouse ou focar com o teclado, cada item expande e mostra o nome da página dentro do próprio botão.

A estrutura inicial inclui navegação por rotas hash e placeholders para cada seção:

- `#/dashboard` — visão geral
- `#/importar` — importação de JSON
- `#/balanco` — receitas, despesas e saldo
- `#/cartoes` — cartões e faturas
- `#/configuracoes` — preferências do app

Rotas antigas ou inválidas (incluindo `#/inicio`) redirecionam para `#/dashboard`. As funcionalidades de importação JSON, cálculos financeiros e integração com Firebase serão adicionadas em etapas posteriores.

## Como executar localmente

1. Clone ou baixe este repositório.
2. Abra o arquivo `index.html` diretamente no navegador (duplo clique ou arraste para uma aba).

Não é necessário instalar Node.js nem executar `npm install`.

## Publicação no GitHub Pages

1. Envie o projeto para um repositório no GitHub.
2. Em **Settings → Pages**, escolha a branch principal e a pasta raiz (`/`) como origem.
3. Acesse a URL gerada pelo GitHub Pages. As rotas hash funcionam sem configuração extra de servidor.

## Estrutura de arquivos

```
├── index.html   # Página principal e navegação
├── styles.css   # Estilos da aplicação
├── app.js       # Roteamento e renderização das seções
└── README.md    # Este arquivo
```

## Próximos passos

- Importação de arquivo JSON
- Cálculos e visualizações financeiras
- Integração com Firebase
