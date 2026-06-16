/**
 * Hash router simples — compatível com GitHub Pages e file://
 */
window.CFM = window.CFM || {};

(function (CFM) {
  var routes = {};
  var notFoundHandler = null;

  function normalizeHash(hash) {
    var path = (hash || "#/dashboard").replace(/^#/, "");
    if (path.charAt(0) !== "/") {
      path = "/" + path;
    }
    return path.split("?")[0];
  }

  function navigate(path) {
    if (path.charAt(0) !== "/") {
      path = "/" + path;
    }
    window.location.hash = path;
  }

  function register(path, handler) {
    routes[path] = handler;
  }

  function setNotFound(handler) {
    notFoundHandler = handler;
  }

  function resolve() {
    var path = normalizeHash(window.location.hash);
    var handler = routes[path];

    if (CFM.store) {
      CFM.store.setState({ currentRoute: path });
    }

    document.querySelectorAll(".nav-list__link").forEach(function (link) {
      var route = link.getAttribute("data-route");
      link.classList.toggle("is-active", route === path);
    });

    var titles = {
      "/dashboard": "Dashboard",
      "/importar": "Importar",
      "/cartoes": "Cartões",
      "/historico": "Histórico"
    };
    var titleEl = document.getElementById("header-title");
    if (titleEl) {
      titleEl.textContent = titles[path] || "Controle Financeiro";
    }

    if (handler) {
      handler(path);
    } else if (notFoundHandler) {
      notFoundHandler(path);
    }
  }

  function start() {
    window.addEventListener("hashchange", resolve);
    if (!window.location.hash) {
      window.location.hash = "#/dashboard";
    } else {
      resolve();
    }
  }

  CFM.router = {
    register: register,
    setNotFound: setNotFound,
    navigate: navigate,
    start: start,
    normalizeHash: normalizeHash
  };
})(window.CFM);
