import type { RoutePath } from "./types";

type RouteHandler = () => void;

const routes = new Map<RoutePath, RouteHandler>();
let notFoundHandler: RouteHandler | null = null;

export function normalizeRoute(hash: string): RoutePath {
  const path = hash.replace(/^#/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = normalized.split("?")[0] ?? "/dashboard";

  if (
    base === "/dashboard" ||
    base === "/balanco" ||
    base === "/lancamentos" ||
    base === "/faturas" ||
    base === "/planejamento" ||
    base === "/importar" ||
    base === "/ajustes"
  ) {
    return base;
  }

  return "/dashboard";
}

export function registerRoute(path: RoutePath, handler: RouteHandler): void {
  routes.set(path, handler);
}

export function setNotFoundHandler(handler: RouteHandler): void {
  notFoundHandler = handler;
}

export function navigate(path: RoutePath): void {
  window.location.hash = path;
}

export function resolveRoute(): RoutePath {
  return normalizeRoute(window.location.hash || "#/dashboard");
}

export function runRoute(path: RoutePath): void {
  const handler = routes.get(path);
  if (handler) {
    handler();
    return;
  }
  if (notFoundHandler) {
    notFoundHandler();
  }
}

export function startRouter(onRoute: (path: RoutePath) => void): void {
  const handle = (): void => {
    const path = resolveRoute();
    onRoute(path);
    runRoute(path);
  };

  window.addEventListener("hashchange", handle);
  handle();
}

export const ROUTE_LABELS: Record<RoutePath, string> = {
  "/dashboard": "Dashboard",
  "/balanco": "Balanço",
  "/lancamentos": "Lançamentos",
  "/faturas": "Faturas",
  "/planejamento": "Planejamento",
  "/importar": "Importar",
  "/ajustes": "Ajustes",
};
