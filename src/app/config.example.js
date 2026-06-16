/**
 * Exemplo de configuração Firebase — NÃO commitar credenciais reais.
 * Copie para config.js e preencha com os valores do Console Firebase.
 * config.js deve estar no .gitignore.
 */
window.CFM = window.CFM || {};

window.CFM.config = {
  firebase: {
    apiKey: "SUA_API_KEY",
    authDomain: "seu-projeto.firebaseapp.com",
    databaseURL: "https://seu-projeto-default-rtdb.firebaseio.com",
    projectId: "seu-projeto",
    storageBucket: "seu-projeto.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:xxxxxxxxxxxxxxxx"
  },
  app: {
    name: "Controle Financeiro Mensal",
    locale: "pt-BR",
    currency: "BRL"
  }
};
