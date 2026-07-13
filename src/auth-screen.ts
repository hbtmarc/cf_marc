import { el, escapeHtml } from "./ui";

export function renderAuthLoading(): HTMLElement {
  const screen = el("section", "auth-screen");
  screen.setAttribute("aria-busy", "true");
  screen.innerHTML = `
    <div class="auth-screen__card">
      <p class="auth-screen__mark" aria-hidden="true">CFM</p>
      <h1 class="auth-screen__title">Controle Financeiro Mensal</h1>
      <p class="auth-screen__text">Conectando…</p>
    </div>
  `;
  return screen;
}

export function renderAuthScreen(options: {
  error?: string | null;
  loading?: boolean;
}): HTMLElement {
  const screen = el("section", "auth-screen");
  screen.innerHTML = `
    <div class="auth-screen__card">
      <p class="auth-screen__mark" aria-hidden="true">CFM</p>
      <h1 class="auth-screen__title">Controle Financeiro Mensal</h1>
      <p class="auth-screen__text">
        Seus dados financeiros ficam vinculados à sua conta Google e sincronizados na nuvem.
      </p>
      ${
        options.error
          ? `<p class="auth-screen__error" role="alert">${escapeHtml(options.error)}</p>`
          : ""
      }
      <button type="button" class="btn btn--primary auth-screen__button" id="auth-google-button"${options.loading ? " disabled" : ""}>
        ${options.loading ? "Entrando…" : "Entrar com Google"}
      </button>
    </div>
  `;
  return screen;
}
