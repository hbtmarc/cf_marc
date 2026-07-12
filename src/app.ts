import { renderAjustes } from "./pages/ajustes";
import { renderDashboard } from "./pages/dashboard";
import { renderFaturas, renderFaturasHeaderActions } from "./pages/faturas";
import { renderImportar, resetImportarPage } from "./pages/importar";
import { renderLancamentos } from "./pages/lancamentos";
import { renderPlanejamento } from "./pages/planejamento";
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
import { currentCompetenceMonth } from "./finance";

interface AppState {
  data: AppData;
  storageError: LoadError | null;
  route: RoutePath;
}

let state: AppState;
let mainHost: HTMLElement | null = null;
let competenceHost: HTMLElement | null = null;
let pageActionsHost: HTMLElement | null = null;
let pageOverline: HTMLElement | null = null;

const COMPETENCE_ROUTES: RoutePath[] = [
  "/dashboard",
  "/lancamentos",
  "/faturas",
  "/planejamento",
];

const PAGE_OVERLINE: Record<RoutePath, string> = {
  "/dashboard": "Competência",
  "/lancamentos": "Competência",
  "/faturas": "Competência",
  "/planejamento": "Competência",
  "/importar": "Operação",
  "/ajustes": "Configurações",
};

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
  if (pageOverline) {
    pageOverline.textContent = PAGE_OVERLINE[state.route];
  }
  if (!competenceHost) {
    return;
  }
  clearChildren(competenceHost);
  if (!COMPETENCE_ROUTES.includes(state.route)) {
    competenceHost.classList.add("is-hidden");
    return;
  }
  competenceHost.classList.remove("is-hidden");
  const shortcuts = bindCompetenceShortcuts(
    state.data.selectedCompetenceMonth,
    setCompetenceMonth,
  );
  competenceHost.appendChild(
    renderCompetenceBar({
      competenceMonth: state.data.selectedCompetenceMonth,
      onPrevious: shortcuts.previous,
      onNext: shortcuts.next,
      onToday: () => setCompetenceMonth(currentCompetenceMonth()),
      onPick: (month) => setCompetenceMonth(month),
    }),
  );
}

function renderPageHeaderActions(rerender: () => void): void {
  if (!pageActionsHost) {
    return;
  }
  clearChildren(pageActionsHost);
  if (state.storageError || state.route !== "/faturas") {
    pageActionsHost.classList.add("is-hidden");
    return;
  }
  pageActionsHost.classList.remove("is-hidden");
  renderFaturasHeaderActions(pageActionsHost, state.data, mutations, rerender);
}

function renderNavigation(route: RoutePath): void {
  const sidebar = document.getElementById("sidebar-nav");
  const bottomNav = document.getElementById("bottom-nav");
  if (sidebar) {
    sidebar.innerHTML = renderNav(route, state.data);
  }
  if (bottomNav) {
    bottomNav.innerHTML = renderNav(route, state.data);
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
    case "/planejamento":
      renderPlanejamento(mainHost, state.data, mutations, rerender);
      break;
    case "/importar":
      renderImportar(
        mainHost,
        () => state.data,
        mutations,
        rerender,
      );
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
  const rerender = (): void => {
    render();
  };
  renderCompetence();
  renderNavigation(state.route);
  renderPageHeaderActions(rerender);
  renderMain();
}

function registerRoutes(): void {
  const routes: RoutePath[] = [
    "/dashboard",
    "/lancamentos",
    "/faturas",
    "/planejamento",
    "/importar",
    "/ajustes",
  ];

  for (const route of routes) {
    registerRoute(route, () => {
      if (state.route === "/importar" && route !== "/importar") {
        resetImportarPage();
      }
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
          <span class="sidebar__mark" aria-hidden="true">CFM</span>
          <p class="sidebar__eyebrow">Controle financeiro</p>
          <p class="sidebar__title">Mensal</p>
        </div>
        <nav id="sidebar-nav" class="sidebar__nav" aria-label="Seções"></nav>
        <footer class="sidebar__footer">
          <p class="sidebar__footnote">
            <span class="sidebar__status" aria-hidden="true"></span>
            Salvo neste dispositivo
          </p>
          <a class="sidebar__footnote-link" href="#/ajustes">Ajustes</a>
        </footer>
      </aside>
      <div class="app-shell__main">
        <header class="page-header">
          <div class="page-header__inner">
            <p class="page-header__overline">Competência</p>
            <div class="page-header__row">
              <div class="page-header__titles">
                <h1 class="page-header__title" id="page-title">${ROUTE_LABELS["/dashboard"]}</h1>
                <p class="page-header__desc" id="page-description"></p>
              </div>
              <div class="page-header__tools">
                <div id="competence-host" class="page-header__competence"></div>
                <div id="page-actions-host" class="page-header__actions is-hidden"></div>
              </div>
            </div>
          </div>
        </header>
        <main id="main-content" class="main-content page-stack" tabindex="-1"></main>
      </div>
      <nav id="bottom-nav" class="bottom-nav" aria-label="Navegação mobile"></nav>
    </div>
  `;

  mainHost = document.getElementById("main-content");
  competenceHost = document.getElementById("competence-host");
  pageActionsHost = document.getElementById("page-actions-host");
  pageOverline = document.querySelector(".page-header__overline");
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
