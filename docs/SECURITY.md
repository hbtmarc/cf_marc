# Segurança — decisão temporária de MVP

## Estado atual

A aplicação não exige login visível e os nós financeiros configurados no Realtime Database permanecem com leitura e escrita públicas. Essa condição é intencional e temporária para acelerar a validação funcional.

## Consequência

Qualquer pessoa que descubra a configuração e os caminhos do banco pode tentar ler ou alterar os dados. Portanto, o MVP não deve ser tratado como ambiente seguro para disponibilização ampla ou uso multiusuário.

## Marco pós-MVP

A segurança será implementada como um pacote único e delimitado:

- autenticação do proprietário;
- dados particionados ou autorizados por `uid`;
- Rules negando usuários não autorizados;
- testes no Firebase Emulator;
- revisão de backup, restauração e conflitos sob autenticação;
- App Check após as Rules estarem corretas.

Essa etapa não deve alterar a lógica financeira ou redesenhar o produto.
