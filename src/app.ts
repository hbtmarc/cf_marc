import { renderAjustes } from "./pages/ajustes";
import { renderDashboard } from "./pages/dashboard";
import { renderFaturas } from "./pages/faturas";
import { renderLancamentos } from "./pages/lancamentos";
import {
  navigate,
  registerRoute,
  resolveRoute,
  ROUTE_LABELS,
  setNotFoundHandler,
  startRouter,
} from "./router";
import {
  emptyAppData,
  loadAppData,
  saveAppData,
  type LoadError,
} from "./storage";
import type { AppData, RoutePath } from "./types";
import type { AppMutations } from "./forms";
import {
  announce,
  bindCompetenceShortcuts,
  clearChildren,
  initUiRoots,
  renderCompetenceBar,
  renderNav,
  renderStorageError,
  setPageTitle,
} from "./ui";

interface AppState {
  data: AppData;
  storageError: LoadError | null;
  route: RoutePath;
}

let state: AppState;
let mainHost: HTMLElement | null = null;
let competenceHost: HTMLElement | null = null;

const mutations: AppMutations = {
  update(mutator) {
    if (state.storageError) {
      return;
    }
    mutator(state.data);
    const saved = saveAppData(state.data);
    if (!saved) {
      announce("Não foi possível salvar os dados locais.");
      return;
    }
    render();
  },
};

function setCompetenceMonth(month: string): void {
  state.data.selectedCompetenceMonth = month;
  const saved = saveAppData(state.data);
  if (!saved) {
    announce("Não foi possível salvar a competência selecionada.");
    return;
  }
  render();
}

function renderCompetence(): void {
  if (!competenceHost) {
    return;
  }
  clearChildren(competenceHost);
  const shortcuts = bindCompetenceShortcuts(
    state.data.selectedCompetenceMonth,
    setCompetenceMonth,
  );
  competenceHost.appendChild(
    renderCompetenceBar({
      competenceMonth: state.data.selectedCompetenceMonth,
      onPrevious: shortcuts.previous,
      onNext: shortcuts.next,
    }),
  );
}

function renderNavigation(route: RoutePath): void {
  const sidebar = document.getElementById("sidebar-nav");
  const bottomNav = document.getElementById("bottom-nav");
  if (sidebar) {
    sidebar.innerHTML = renderNav(route);
  }
  if (bottomNav) {
    bottomNav.innerHTML = renderNav(route);
  }
}

function renderMain(): void {
  if (!mainHost) {
    return;
  }

  clearChildren(mainHost);
  setPageTitle(state.route);

  if (state.storageError) {
    mainHost.appendChild(renderStorageError(state.storageError.message));
    return;
  }

  const rerender = (): void => {
    render();
  };

  switch (state.route) {
    case "/dashboard":
      renderDashboard(mainHost, state.data, mutations, rerender);
      break;
    case "/lancamentos":
      renderLancamentos(mainHost, state.data, mutations, rerender);
      break;
    case "/faturas":
      renderFaturas(mainHost, state.data, mutations, rerender);
      break;
    case "/ajustes":
      renderAjustes(mainHost, state.data, mutations, rerender, () => {
        state.data = emptyAppData();
        state.storageError = null;
        render();
      });
      break;
    default:
      navigate("/dashboard");
      break;
  }
}

function render(): void {
  renderCompetence();
  renderNavigation(state.route);
  renderMain();
}

function registerRoutes(): void {
  const routes: RoutePath[] = [
    "/dashboard",
    "/lancamentos",
    "/faturas",
    "/ajustes",
  ];

  for (const route of routes) {
    registerRoute(route, () => {
      state.route = route;
      render();
    });
  }

  setNotFoundHandler(() => {
    navigate("/dashboard");
  });
}

function buildShell(): void {
  const app = document.getElementById("app");
  if (!app) {
    throw new Error("Elemento #app não encontrado.");
  }

  app.innerHTML = `
    <div class="app-shell">
      <a class="skip-link" href="#main-content">Ir para o conteúdo</a>
      <aside class="sidebar" aria-label="Navegação principal">
        <div class="sidebar__brand">
          <p class="sidebar__eyebrow">CFM</p>
          <p class="sidebar__title">Controle Financeiro Mensal</p>
        </div>
        <nav id="sidebar-nav" class="sidebar__nav"></nav>
      </aside>
      <div class="app-shell__main">
        <header class="topbar">
          <div class="topbar__titles">
            <p class="topbar__eyebrow">Competência</p>
            <h1 class="topbar__title" id="page-title">${ROUTE_LABELS["/dashboard"]}</h1>
          </div>
          <div id="competence-host" class="topbar__competence"></div>
        </header>
        <main id="main-content" class="main-content" tabindex="-1"></main>
      </div>
      <nav id="bottom-nav" class="bottom-nav" aria-label="Navegação mobile"></nav>
    </div>
  `;

  mainHost = document.getElementById("main-content");
  competenceHost = document.getElementById("competence-host");
}

export function startApp(): void {
  initUiRoots();
  buildShell();

  const loaded = loadAppData();
  if (loaded.ok) {
    state = {
      data: loaded.data,
      storageError: null,
      route: resolveRoute(),
    };
  } else {
    state = {
      data: emptyAppData(),
      storageError: loaded,
      route: resolveRoute(),
    };
  }

  registerRoutes();
  startRouter((route) => {
    state.route = route;
  });
  render();
  announce("Aplicação carregada.");
}
