/**
 * Bootstrap da aplicação — registra rotas e UI shell.
 */
window.CFM = window.CFM || {};

(function (CFM) {
  var ROUTE_MAP = {
    "/dashboard": "dashboard",
    "/importar": "importer",
    "/cartoes": "cards",
    "/historico": "history"
  };

  function getOutlet() {
    return document.getElementById("app-outlet");
  }

  function renderPage(routeKey) {
    var outlet = getOutlet();
    if (!outlet || !CFM.pages || !CFM.pages[routeKey]) return;
    CFM.pages[routeKey].render(outlet);
  }

  function registerRoutes() {
    Object.keys(ROUTE_MAP).forEach(function (path) {
      var key = ROUTE_MAP[path];
      CFM.router.register(path, function () {
        renderPage(key);
      });
    });

    CFM.router.setNotFound(function () {
      CFM.router.navigate("/dashboard");
    });
  }

  function setupNavigation() {
    document.querySelectorAll(".nav-list__link").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        var route = link.getAttribute("data-route");
        if (route) {
          CFM.router.navigate(route);
        }
        closeSidebar();
      });
    });
  }

  function setupSidebar() {
    var toggle = document.getElementById("menu-toggle");
    var sidebar = document.getElementById("app-sidebar");
    var overlay = document.getElementById("sidebar-overlay");

    function openSidebar() {
      if (sidebar) sidebar.classList.add("is-open");
      if (overlay) overlay.classList.add("is-visible");
      if (CFM.store) CFM.store.setState({ isSidebarOpen: true });
    }

    function closeSidebarFn() {
      if (sidebar) sidebar.classList.remove("is-open");
      if (overlay) overlay.classList.remove("is-visible");
      if (CFM.store) CFM.store.setState({ isSidebarOpen: false });
    }

    window.CFM.closeSidebar = closeSidebarFn;

    if (toggle) {
      toggle.addEventListener("click", openSidebar);
    }
    if (overlay) {
      overlay.addEventListener("click", closeSidebarFn);
    }
  }

  function closeSidebar() {
    if (typeof window.CFM.closeSidebar === "function") {
      window.CFM.closeSidebar();
    }
  }

  function init() {
    if (CFM.hydrateIcons) CFM.hydrateIcons(document);
    registerRoutes();
    setupNavigation();
    setupSidebar();
    CFM.router.start();
  }

  CFM.bootstrap = { init: init };
})(window.CFM);
