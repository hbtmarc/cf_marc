import type { User } from "firebase/auth";
import { renderAuthLoading, renderAuthScreen } from "./auth-screen";
import { signInWithGoogle, signOutUser, subscribeAuthState, completeRedirectSignIn, AuthRedirectStartedError } from "./auth-service";
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
  bootstrapUserData,
  bindCloudUser,
  migrateLocalDataToCloud,
  persistAppData,
  retryCloudSync,
  subscribeSyncStatus,
  waitForPendingCloudWrite,
  type SyncStatusState,
} from "./data-store";
import { isFirebaseConfigured } from "./firebase-config";
import { initFirebase } from "./firebase";
import {
  emptyAppData,
  loadAppData,
  type LoadError,
} from "./storage";
import type { AppData, RoutePath } from "./types";
import type { AppMutations } from "./forms";
import {
  announce,
  bindCompetenceShortcuts,
  clearChildren,
  initUiRoots,
  openConfirmModal,
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
let appShell: HTMLElement | null = null;
let authHost: HTMLElement | null = null;
let syncStatusHost: HTMLElement | null = null;
let currentUser: User | null = null;
let authResolved = false;

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

function renderSyncStatus(stateSync: SyncStatusState): void {
  if (!syncStatusHost) {
    return;
  }
  syncStatusHost.innerHTML = `
    <span class="sidebar__status" aria-hidden="true"></span>
    <span role="status" aria-live="polite">${stateSync.message}</span>
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

function showAuthView(node: HTMLElement): void {
  if (appShell) {
    appShell.hidden = true;
  }
  if (!authHost) {
    return;
  }
  clearChildren(authHost);
  authHost.hidden = false;
  authHost.appendChild(node);
}

function showAppShell(): void {
  if (authHost) {
    authHost.hidden = true;
    clearChildren(authHost);
  }
  if (appShell) {
    appShell.hidden = false;
  }
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
        isFirebaseConfigured() && currentUser !== null,
        async () => {
          await waitForPendingCloudWrite();
          await signOutUser();
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
    <div id="auth-host" hidden></div>
    <div class="app-shell" hidden>
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

  authHost = document.getElementById("auth-host");
  appShell = app.querySelector<HTMLElement>(".app-shell");
  mainHost = document.getElementById("main-content");
  competenceHost = document.getElementById("competence-host");
  pageActionsHost = document.getElementById("page-actions-host");
  pageOverline = document.querySelector(".page-header__overline");
  syncStatusHost = document.getElementById("sync-status-host");
}

function promptMigration(data: AppData, uid: string): Promise<void> {
  return new Promise((resolve) => {
    openConfirmModal({
      title: "Levar dados deste dispositivo para a nuvem",
      message:
        "Foram encontrados dados financeiros salvos neste dispositivo. Eles serão copiados para a sua conta autenticada. Os dados locais permanecem como cache.",
      confirmLabel: "Levar para a nuvem",
      cancelLabel: "Agora não",
      onConfirm: () => {
        void migrateLocalDataToCloud(uid, data).finally(resolve);
      },
      onCancel: () => {
        resolve();
      },
    });
  });
}

async function activateUser(user: User): Promise<void> {
  currentUser = user;
  bindCloudUser(user.uid);
  showAuthView(renderAuthLoading());

  try {
    const boot = await bootstrapUserData(user.uid);
    if (boot.needsMigration) {
      await promptMigration(boot.data, user.uid);
    }

    state = {
      data: boot.data,
      storageError: null,
      route: resolveRoute(),
      ready: true,
    };
    showAppShell();
    registerRoutes();
    if (!routerStarted) {
      startRouter((route) => {
        state.route = route;
      });
      routerStarted = true;
    }
    render();
    announce("Aplicação carregada.");
  } catch {
    const local = loadAppData();
    state = {
      data: local.ok ? local.data : emptyAppData(),
      storageError: local.ok
        ? null
        : {
            ok: false,
            message: "Não foi possível carregar os dados remotos.",
            raw: null,
          },
      route: resolveRoute(),
      ready: true,
    };
    showAppShell();
    registerRoutes();
    if (!routerStarted) {
      startRouter((route) => {
        state.route = route;
      });
      routerStarted = true;
    }
    render();
  }
}

function startLocalOnlyApp(): void {
  const loaded = loadAppData();
  state = {
    data: loaded.ok ? loaded.data : emptyAppData(),
    storageError: loaded.ok ? null : loaded,
    route: resolveRoute(),
    ready: true,
  };
  showAppShell();
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

  if (!isFirebaseConfigured()) {
    startLocalOnlyApp();
    return;
  }

  initFirebase();
  showAuthView(renderAuthLoading());
  void bootstrapAuth();
}

async function bootstrapAuth(): Promise<void> {
  try {
    await completeRedirectSignIn();
  } catch {
    // Falha no retorno do redirect não impede nova tentativa de login.
  }

  subscribeAuthState((user) => {
    if (user) {
      authResolved = true;
      void activateUser(user);
      return;
    }

    if (!authResolved) {
      authResolved = true;
    }

    currentUser = null;
    bindCloudUser(null);
    state = {
      data: emptyAppData(),
      storageError: null,
      route: "/dashboard",
      ready: false,
    };
    showLoginScreen();
  });
}

function bindGoogleSignIn(): void {
  const button = authHost?.querySelector<HTMLButtonElement>("#auth-google-button");
  if (!button || button.dataset.bound === "true") {
    return;
  }
  button.dataset.bound = "true";
  button.addEventListener("click", () => {
    button.disabled = true;
    button.textContent = "Entrando…";
    void signInWithGoogle().catch((error: unknown) => {
      if (error instanceof AuthRedirectStartedError) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "Não foi possível entrar com Google.";
      showAuthView(renderAuthScreen({ error: message }));
      bindGoogleSignIn();
    });
  });
}

function showLoginScreen(): void {
  showAuthView(renderAuthScreen({}));
  bindGoogleSignIn();
}
