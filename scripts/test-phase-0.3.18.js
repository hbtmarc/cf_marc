/**
 * Fase 0.3.18 — Modais internos do projeto.
 * Uso: node scripts/test-phase-0.3.18.js
 */
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");

var fails = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    fails++;
  } else {
    console.log("OK:", msg);
  }
}

var forbiddenPatterns = [
  { re: /window\.confirm\s*\(/, label: "window.confirm(" },
  { re: /window\.alert\s*\(/, label: "window.alert(" },
  { re: /window\.prompt\s*\(/, label: "window.prompt(" },
  { re: /(?<!window\.)\bconfirm\s*\(/, label: "confirm(" },
  { re: /(?<!window\.)\balert\s*\(/, label: "alert(" },
  { re: /(?<!window\.)\bprompt\s*\(/, label: "prompt(" }
];

function listFiles(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  fs.readdirSync(dir).forEach(function (name) {
    var full = path.join(dir, name);
    var stat = fs.statSync(full);
    if (stat.isDirectory()) listFiles(full, acc);
    else if (/\.(js|html)$/.test(name)) acc.push(full);
  });
  return acc;
}

var scanRoots = [
  path.join(root, "src"),
  path.join(root, "assets", "js"),
  path.join(root, "index.html")
].filter(function (p) { return fs.existsSync(p); });

var files = [];
scanRoots.forEach(function (entry) {
  if (fs.statSync(entry).isDirectory()) listFiles(entry, files);
  else files.push(entry);
});

files.forEach(function (filePath) {
  var rel = path.relative(root, filePath).replace(/\\/g, "/");
  if (rel.indexOf("scripts/") === 0) return;
  if (rel.indexOf("docs/") === 0) return;
  if (rel.indexOf(".agents/") === 0) return;

  var content = fs.readFileSync(filePath, "utf8");
  forbiddenPatterns.forEach(function (item) {
    if (item.re.test(content)) {
      assert(false, "proibido " + item.label + " em " + rel);
    }
  });
});

assert(
  files.some(function (f) { return f.replace(/\\/g, "/").endsWith("src/components/app-confirm.js"); }),
  "componente app-confirm.js existe"
);

var confirmSrc = fs.readFileSync(path.join(root, "src/components/app-confirm.js"), "utf8");
assert(confirmSrc.indexOf("openAppConfirm") >= 0, "helper openAppConfirm definido");
assert(confirmSrc.indexOf('role="dialog"') >= 0, "modal com role=dialog");
assert(confirmSrc.indexOf('aria-modal="true"') >= 0, "modal com aria-modal");

var importerSrc = fs.readFileSync(path.join(root, "src/pages/importer.page.js"), "utf8");
assert(importerSrc.indexOf("openAppConfirm") >= 0, "importador usa openAppConfirm");
assert(importerSrc.indexOf("window.confirm") < 0, "importador sem window.confirm");
assert(
  importerSrc.indexOf("Marcar todas como conferidas?") >= 0 &&
  importerSrc.indexOf("Marcar todas") >= 0,
  "microcopy do modal Marcar todas"
);

assert(fs.readFileSync(path.join(root, "index.html"), "utf8").indexOf("app-confirm.js") >= 0,
  "index.html carrega app-confirm.js");

console.log(fails === 0 ? "\nALL PASS" : "\nFAILURES: " + fails);
process.exit(fails === 0 ? 0 : 1);
