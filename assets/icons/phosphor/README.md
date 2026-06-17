# Phosphor Icons (CFM)

Ícones oficiais do projeto, extraídos de [phosphor-icons/core](https://github.com/phosphor-icons/core).

- **Peso padrão:** `regular`
- **SVGs de referência:** `regular/*.svg`
- **Runtime:** `src/utils/phosphor-icons.js` (`CFM.icon`, `CFM.hydrateIcons`)

Ao adicionar um ícone novo:

1. Baixe o SVG de `assets/regular/<nome>.svg` no repositório Phosphor.
2. Salve em `assets/icons/phosphor/regular/<nome>.svg`.
3. Copie o atributo `d` do `<path>` para `PATHS` em `phosphor-icons.js` (ou regenere o arquivo).
4. Use `CFM.icon("<nome>")` na UI — nunca emoji nem SVG inline solto.
