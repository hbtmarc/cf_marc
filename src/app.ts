import { renderAjustes } from "./pages/ajustes";
import { renderBalanco } from "./pages/balanco";
import { renderDashboard } from "./pages/dashboard";
import { renderFaturas, renderFaturasHeaderActions } from "./pages/faturas";
import { renderImportar, resetImportarPage } from "./pages/importar";
import { renderLancamentos } from "./pages/lancamentos";
import { renderPlanejamento, renderPlanejamentoHeaderActions } from "./pages/planejamento";
import {
  navigate,
  registerRoute,
  resolveRoute,
  ROUTE_LABELS,
  setNotFoundHandler,
  startRouter,
} from "./router";
import {
  dismissConflictBackup,
  getConflictBackup,
  hasConflictBackup,
  persistAppData,
  retryCloudSync,
  setDataChangeListener,
  startBackgroundSync,
  subscribeSyncStatus,
  waitForPendingCloudWrite,
  type SyncStatus,
  type SyncStatusState,
} from "./data-store";
import { syncCloudIcon, syncDeviceIcon, type SyncIconTone } from "./icons";
import { initFirebase } from "./firebase";
import { emptyAppData, loadAppData, type LoadError } from "./storage";
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
  ready: boolean;
}

let state: AppState;
let mainHost: HTMLElement | null = null;
let competenceHost: HTMLElement | null = null;
let pageActionsHost: HTMLElement | null = null;
let pageOverline: HTMLElement | null = null;
let syncStatusHost: HTMLElement | null = null;

const COMPETENCE_ROUTES: RoutePath[] = [
  "/dashboard",
  "/balanco",
  "/lancamentos",
  "/faturas",
  "/planejamento",
];

const PAGE_OVERLINE: Record<RoutePath, string> = {
  "/dashboard": "Competência",
  "/balanco": "Competência",
  "/lancamentos": "Competência",
  "/faturas": "Competência",
  "/planejamento": "Competência",
  "/importar": "Operação",
  "/ajustes": "Configurações",
};

const mutations: AppMutations = {
  update(mutator) {
    if (!state.ready || state.storageError) {
      return;
    }
    mutator(state.data);
    const saved = persistAppData(state.data);
    if (!saved) {
      announce("Não foi possível salvar os dados locais.");
      return;
    }
    render();
  },
};

function setCompetenceMonth(month: string): void {
  if (!state.ready) {
    return;
  }
  state.data.selectedCompetenceMonth = month;
  const saved = persistAppData(state.data);
  if (!saved) {
    announce("Não foi possível salvar a competência selecionada.");
    return;
  }
  render();
}

function syncIconTones(status: SyncStatus): { local: SyncIconTone; cloud: SyncIconTone } {
  switch (status) {
    case "synced":
    case "remote_newer":
      return { local: "synced", cloud: "synced" };
    case "syncing":
    case "connecting_cloud":
    case "offline":
    case "error":
      return { local: "synced", cloud: "syncing" };
  }
}

function renderSyncStatus(stateSync: SyncStatusState): void {
  if (!syncStatusHost) {
    return;
  }
  const tones = syncIconTones(stateSync.status);
  syncStatusHost.innerHTML = `
    <span class="sidebar__sync" role="group" aria-label="${stateSync.message}">
      ${syncDeviceIcon(tones.local)}
      ${syncCloudIcon(tones.cloud)}
    </span>
    <span class="sr-only" role="status" aria-live="polite">${stateSync.message}</span>
    ${
      stateSync.canRetry
        ? `<button type="button" class="sidebar__retry btn btn--ghost btn--compact" data-action="retry-sync">Tentar novamente</button>`
        : ""
    }
  `;
  syncStatusHost
    .querySelector<HTMLButtonElement>('[data-action="retry-sync"]')
    ?.addEventListener("click", () => {
      void retryCloudSync(state.data);
    });
}

function renderCompetence(): void {
  if (!state.ready) {
    return;
  }
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
  if (!state.ready || !pageActionsHost) {
    return;
  }
  clearChildren(pageActionsHost);
  if (state.storageError) {
    pageActionsHost.classList.add("is-hidden");
    return;
  }
  if (state.route === "/faturas") {
    pageActionsHost.classList.remove("is-hidden");
    renderFaturasHeaderActions(pageActionsHost, state.data, mutations, rerender);
    return;
  }
  if (state.route === "/planejamento") {
    pageActionsHost.classList.remove("is-hidden");
    renderPlanejamentoHeaderActions(pageActionsHost);
    return;
  }
  pageActionsHost.classList.add("is-hidden");
}

function renderNavigation(route: RoutePath): void {
  if (!state.ready) {
    return;
  }
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
  if (!mainHost || !state.ready) {
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
    case "/balanco":
      renderBalanco(mainHost, state.data, mutations, rerender, setCompetenceMonth);
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
      renderImportar(mainHost, () => state.data, mutations, rerender);
      break;
    case "/ajustes":
      renderAjustes(
        mainHost,
        state.data,
        mutations,
        rerender,
        () => {
          state.data = emptyAppData();
          state.storageError = null;
          persistAppData(state.data);
          render();
        },
        hasConflictBackup(),
        () => {
          const backup = getConflictBackup();
          if (!backup) {
            return;
          }
          announce(
            "Cópia local preservada disponível. Os dados atuais refletem a versão mais recente da nuvem.",
          );
          dismissConflictBackup();
          render();
        },
      );
      break;
    default:
      navigate("/dashboard");
      break;
  }
}

function render(): void {
  if (!state.ready) {
    return;
  }
  const rerender = (): void => {
    render();
  };
  renderCompetence();
  renderNavigation(state.route);
  renderPageHeaderActions(rerender);
  renderMain();
}

let routesRegistered = false;
let routerStarted = false;

function registerRoutes(): void {
  if (routesRegistered) {
    return;
  }
  routesRegistered = true;
  const routes: RoutePath[] = [
    "/dashboard",
    "/balanco",
    "/lancamentos",
    "/faturas",
    "/planejamento",
    "/importar",
    "/ajustes",
  ];

  for (const route of routes) {
    registerRoute(route, () => {
      if (!state.ready) {
        return;
      }
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
          <p class="sidebar__footnote" id="sync-status-host"></p>
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
  syncStatusHost = document.getElementById("sync-status-host");
}

function mountLocalFirst(): void {
  const loaded = loadAppData();
  state = {
    data: loaded.ok ? loaded.data : emptyAppData(),
    storageError: loaded.ok ? null : loaded,
    route: resolveRoute(),
    ready: true,
  };

  registerRoutes();
  if (!routerStarted) {
    startRouter((route) => {
      state.route = route;
    });
    routerStarted = true;
  }
  render();
  announce("Aplicação carregada.");
}

export function startApp(): void {
  initUiRoots();
  buildShell();
  subscribeSyncStatus(renderSyncStatus);

  window.addEventListener("beforeunload", () => {
    void waitForPendingCloudWrite();
  });

  setDataChangeListener((data) => {
    if (!state.ready) {
      return;
    }
    state.data = data;
    render();
  });

  mountLocalFirst();
  initFirebase();
  void startBackgroundSync();
}
