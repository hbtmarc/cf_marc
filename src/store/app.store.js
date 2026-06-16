/**
 * Store mínimo em memória — sem persistência nesta fase.
 */
window.CFM = window.CFM || {};

(function (CFM) {
  var state = {
    currentRoute: "/dashboard",
    user: null,
    selectedMonth: null,
    isSidebarOpen: false
  };

  var listeners = [];

  function getState() {
    return Object.freeze(Object.assign({}, state));
  }

  function setState(partial) {
    state = Object.assign({}, state, partial);
    listeners.forEach(function (fn) {
      fn(getState());
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function unsubscribe() {
      listeners = listeners.filter(function (l) {
        return l !== fn;
      });
    };
  }

  CFM.store = {
    getState: getState,
    setState: setState,
    subscribe: subscribe
  };
})(window.CFM);
