import "./styles.css";

const root = document.querySelector<HTMLElement>(".page");

if (root === null) {
  throw new Error("Elemento raiz da aplicação não encontrado.");
}
