/**
 * CFMarc — cache do app shell (arquivos estáticos locais)
 */

// Bump this version whenever index.html, styles.css, app.js or shell assets change.
var CACHE_NAME = "cfmarc-app-shell-v3";

var SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js"
];

function ehArquivoEstaticoShell(url) {
  var caminho = url.pathname;

  return (
    caminho.endsWith("/index.html") ||
    caminho.endsWith("/styles.css") ||
    caminho.endsWith("/app.js") ||
    caminho.endsWith("/sw.js") ||
    caminho.endsWith("/")
  );
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_FILES);
    }).catch(function () {
      return caches.open(CACHE_NAME).then(function (cache) {
        var promessas = [];
        var i;

        for (i = 0; i < SHELL_FILES.length; i++) {
          promessas.push(
            cache.add(SHELL_FILES[i]).catch(function () {
              return undefined;
            })
          );
        }

        return Promise.all(promessas);
      });
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (chaves) {
      return Promise.all(
        chaves.map(function (chave) {
          if (chave.indexOf("cfmarc-") === 0 && chave !== CACHE_NAME) {
            return caches.delete(chave);
          }
          return undefined;
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var pedido = event.request;

  if (pedido.method !== "GET") {
    return;
  }

  var url = new URL(pedido.url);

  if (pedido.mode === "navigate") {
    event.respondWith(
      fetch(pedido).catch(function () {
        return caches.match("./index.html");
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (!ehArquivoEstaticoShell(url)) {
    return;
  }

  event.respondWith(
    caches.match(pedido).then(function (respostaCache) {
      if (respostaCache) {
        return respostaCache;
      }
      return fetch(pedido);
    })
  );
});
