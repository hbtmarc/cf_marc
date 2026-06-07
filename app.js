/**
 * CFMarc — roteamento e importação JSON (MVP Junho/2026)
 */

var ROTA_PADRAO = "dashboard";

var ROTAS_VALIDAS = [
  "dashboard",
  "importar",
  "balanco",
  "cartoes",
  "configuracoes"
];

var MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

var ERRO_JSON_INVALIDO = "Não foi possível ler este arquivo. Verifique se ele é um JSON válido.";
var ERRO_ARQUIVO_OFICIAL = "Este arquivo não corresponde ao modelo do CFMarc.";
var ERRO_PERIODO_JUNHO = "Este arquivo não corresponde ao modelo do CFMarc para Junho/2026.";

var SECOES = {
  configuracoes: {
    icone: "ph-gear",
    titulo: "Configurações",
    texto: "Ajustes e preferências do app."
  }
};

window.appState = window.appState || {
  importedData: null,
  importConfirmed: false,
  importedAt: null,
  importSession: null
};

var conteudoEl = document.getElementById("conteudo");
var linksNav = document.querySelectorAll(".nav__link");

/* --- Utilitários --- */

function escapeHtml(texto) {
  if (texto === null || texto === undefined) {
    return "";
  }
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCurrency(valor) {
  if (valor === null || valor === undefined || valor === "" || isNaN(Number(valor))) {
    return "—";
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(valor));
}

function formatPeriodLabel(ano, mes) {
  if (!ano || !mes) {
    return "Não informado";
  }
  var indice = Number(mes) - 1;
  if (indice < 0 || indice > 11) {
    return "Não informado";
  }
  return MESES_PT[indice] + "/" + ano;
}

function formatPeriodoTexto(periodoTexto) {
  if (!periodoTexto || typeof periodoTexto !== "string") {
    return "Não informado";
  }
  var partes = periodoTexto.split("-");
  if (partes.length !== 2) {
    return periodoTexto;
  }
  return formatPeriodLabel(Number(partes[0]), Number(partes[1]));
}

function formatDataBr(dataIso) {
  if (!dataIso) {
    return "—";
  }
  var partes = String(dataIso).split("-");
  if (partes.length !== 3) {
    return dataIso;
  }
  return partes[2] + "/" + partes[1] + "/" + partes[0];
}

function formatDataOuPeriodo(valor) {
  if (!valor) {
    return "—";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
    return formatDataBr(valor);
  }
  return formatPeriodoTexto(valor);
}

function formatPercentualUso(usado, limite) {
  if (usado === null || usado === undefined || !limite) {
    return "—";
  }
  return formatPercentualNumero((Number(usado) / Number(limite)) * 100);
}

function formatPercentualNumero(valor) {
  if (valor === null || valor === undefined || isNaN(Number(valor))) {
    return "—";
  }
  return Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
}

function formatCount(quantidade, singular, plural) {
  if (quantidade === 0) {
    return "Nenhum " + singular;
  }
  if (quantidade === 1) {
    return "1 " + singular;
  }
  return quantidade + " " + plural;
}

function traduzirSituacaoCartao(status) {
  var mapa = {
    freeze: "Uso congelado",
    emergencyOnly: "Somente emergência",
    smallEssentialsOnly: "Somente essenciais"
  };
  return mapa[status] || status || "—";
}

function traduzirNivelAlerta(nivel) {
  var mapa = {
    critical: "Crítico",
    high: "Alto",
    medium: "Médio",
    low: "Leve"
  };
  return mapa[String(nivel || "").toLowerCase()] || "Alerta";
}

function traduzirStatusChecklist(status) {
  var mapa = {
    done: "Concluído",
    open: "Pendente",
    pending: "Pendente"
  };
  return mapa[String(status || "").toLowerCase()] || "Pendente";
}

function obterRotaAtual() {
  var hash = window.location.hash || "#/" + ROTA_PADRAO;
  return hash.replace(/^#\/?/, "").split("/")[0];
}

function rotaEhValida(rota) {
  return ROTAS_VALIDAS.indexOf(rota) !== -1;
}

function redirecionarParaPadrao() {
  window.location.replace("#/" + ROTA_PADRAO);
}

function criarSessaoImportacao() {
  return {
    fileName: null,
    parsedData: null,
    preview: null,
    error: null,
    success: null
  };
}

function obterSessaoImportacao() {
  if (!window.appState.importSession) {
    window.appState.importSession = criarSessaoImportacao();
  }
  return window.appState.importSession;
}

/* --- Camada de leitura dos dados importados --- */

function hasConfirmedImport() {
  return !!(
    window.appState &&
    window.appState.importConfirmed === true &&
    window.appState.importedData
  );
}

function getImportedData() {
  if (!hasConfirmedImport()) {
    return null;
  }
  return window.appState.importedData;
}

function getActivePeriod() {
  var dados = getImportedData();
  if (!dados || !Array.isArray(dados.periods)) {
    return null;
  }

  var ativos = findActiveImportPeriod(dados.periods);
  if (ativos.length === 1) {
    return ativos[0];
  }

  for (var i = 0; i < dados.periods.length; i++) {
    if (periodoEhJunho2026(dados.periods[i])) {
      return dados.periods[i];
    }
  }

  return null;
}

function getMonthlySummary() {
  var dados = getImportedData();
  if (!dados) {
    return null;
  }

  if (dados.monthlySummary) {
    return dados.monthlySummary;
  }

  var periodo = getActivePeriod();
  if (periodo && periodo.monthlySummary) {
    return periodo.monthlySummary;
  }

  return null;
}

function getCards() {
  var periodo = getActivePeriod();
  if (periodo && Array.isArray(periodo.cards)) {
    return periodo.cards;
  }

  var dados = getImportedData();
  if (dados && Array.isArray(dados.cards)) {
    return dados.cards;
  }

  return [];
}

function getInvoices() {
  var periodo = getActivePeriod();
  if (periodo && Array.isArray(periodo.invoices)) {
    return periodo.invoices;
  }

  var dados = getImportedData();
  if (dados && Array.isArray(dados.invoices)) {
    return dados.invoices;
  }

  return [];
}

function getFutureCommitments() {
  var dados = getImportedData();
  if (!dados || !Array.isArray(dados.futureCommitments)) {
    return [];
  }
  return dados.futureCommitments;
}

function getReceivables() {
  var periodo = getActivePeriod();
  if (periodo && Array.isArray(periodo.receivables)) {
    return periodo.receivables;
  }

  var dados = getImportedData();
  if (dados && Array.isArray(dados.receivables)) {
    return dados.receivables;
  }

  return [];
}

function getAlerts() {
  var lista = [];
  var dados = getImportedData();
  if (!dados) {
    return lista;
  }

  var periodo = getActivePeriod();
  if (periodo && Array.isArray(periodo.alerts)) {
    lista = lista.concat(periodo.alerts);
  }

  if (Array.isArray(dados.alerts)) {
    lista = lista.concat(dados.alerts);
  }

  return lista;
}

function getChecklist() {
  var periodo = getActivePeriod();
  if (periodo && Array.isArray(periodo.checklist)) {
    return periodo.checklist;
  }

  var dados = getImportedData();
  if (dados && Array.isArray(dados.checklist)) {
    return dados.checklist;
  }

  return [];
}

function getCardUsagePercent(card) {
  if (!card) {
    return null;
  }

  if (card.usagePercent !== undefined && card.usagePercent !== null && !isNaN(Number(card.usagePercent))) {
    return Number(card.usagePercent);
  }

  var usado = card.used !== undefined && card.used !== null ? card.used : card.usedLimit;
  var limite = card.limit;

  if (
    usado !== undefined &&
    usado !== null &&
    limite !== undefined &&
    limite !== null &&
    Number(limite) > 0
  ) {
    return (Number(usado) / Number(limite)) * 100;
  }

  return null;
}

function obterPeriodoAtualLabel() {
  var periodo = getActivePeriod();
  if (!periodo) {
    return "—";
  }
  if (periodo.label) {
    return periodo.label;
  }
  return formatPeriodLabel(periodo.year, periodo.month);
}

function obterValorCartaoUsado(cartao) {
  if (cartao.used !== undefined && cartao.used !== null) {
    return cartao.used;
  }
  return cartao.usedLimit;
}

function obterValorCartaoDisponivel(cartao) {
  if (cartao.available !== undefined && cartao.available !== null) {
    return cartao.available;
  }
  return cartao.availableLimit;
}

window.CFMarcData = {
  hasConfirmedImport: hasConfirmedImport,
  getImportedData: getImportedData,
  getActivePeriod: getActivePeriod,
  getMonthlySummary: getMonthlySummary,
  getCards: getCards,
  getInvoices: getInvoices,
  getFutureCommitments: getFutureCommitments,
  getReceivables: getReceivables,
  getAlerts: getAlerts,
  getChecklist: getChecklist,
  getCardUsagePercent: getCardUsagePercent
};

/* --- Estados das rotas (vazio / carregado) --- */

function renderEstadoVazio(tituloPagina, icone, tituloVazio, texto, ctaTexto) {
  return (
    "<section class=\"secao\">" +
      "<h2 class=\"secao__titulo\">" +
        "<i class=\"ph " + icone + " secao__icone\" aria-hidden=\"true\"></i>" +
        escapeHtml(tituloPagina) +
      "</h2>" +
      "<div class=\"estado-vazio\" role=\"status\">" +
        "<div class=\"estado-vazio__icone\" aria-hidden=\"true\"><i class=\"ph ph-folder-open\"></i></div>" +
        "<h3 class=\"estado-vazio__titulo\">" + escapeHtml(tituloVazio) + "</h3>" +
        "<p class=\"estado-vazio__texto\">" + escapeHtml(texto) + "</p>" +
        "<a href=\"#/importar\" class=\"btn btn--primario estado-vazio__cta\">" + escapeHtml(ctaTexto) + "</a>" +
      "</div>" +
    "</section>"
  );
}

function renderItemResumo(rotulo, valor) {
  return (
    "<div class=\"estado-carregado__item\">" +
      "<dt>" + escapeHtml(rotulo) + "</dt>" +
      "<dd>" + escapeHtml(valor) + "</dd>" +
    "</div>"
  );
}

function getFirstValue(objeto, chaves) {
  return obterValorResumo(objeto, chaves);
}

function formatPercent(valor) {
  if (valor === null || valor === undefined || isNaN(Number(valor))) {
    return "—";
  }
  var numero = Number(valor);
  if (numero > 0 && numero <= 1) {
    numero = numero * 100;
  }
  return formatPercentualNumero(numero);
}

function traduzirSeveridadeDashboard(nivel) {
  var mapa = {
    critical: "Crítico",
    high: "Alto",
    medium: "Médio",
    low: "Baixo"
  };
  return mapa[String(nivel || "").toLowerCase()] || "—";
}

function obterPrioridadeAlerta(alerta) {
  var mapa = { critical: 0, high: 1, medium: 2, low: 3 };
  var nivel = String(alerta.level || alerta.severity || "").toLowerCase();
  return mapa[nivel] !== undefined ? mapa[nivel] : 9;
}

function obterAlertasPriorizados(limite) {
  var alertas = getAlerts().slice();
  alertas.sort(function (a, b) {
    return obterPrioridadeAlerta(a) - obterPrioridadeAlerta(b);
  });
  return alertas.slice(0, limite || 5);
}

function obterCompromissosFuturosFiltrados() {
  var lista = getFutureCommitments();
  var filtrados = [];
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].type !== "expectedReceivable") {
      filtrados.push(lista[i]);
    }
  }
  return filtrados;
}

function getCommitmentTitle(item) {
  return getFirstValue(item, ["title", "name", "description", "descricao", "label", "item"]) || "Compromisso";
}

function getCommitmentValue(item) {
  return getFirstValue(item, [
    "amount", "value", "total", "valor", "valorTotal",
    "expectedAmount", "projectedAmount", "monthlyAmount"
  ]);
}

function getCommitmentDate(item) {
  var data = getFirstValue(item, [
    "date", "dueDate", "vencimento", "period", "month",
    "competencia", "nextDate", "firstPeriod"
  ]);
  return formatDataOuPeriodo(data);
}

function classifyCommitmentType(item) {
  var tipoBruto = String(item.type || "");
  var categoria = String(getFirstValue(item, ["category", "categoria"]) || "");
  var titulo = String(getCommitmentTitle(item) || "");
  var texto = normalizarTextoBusca(tipoBruto + " " + categoria + " " + titulo);

  if (
    tipoBruto === "financing" ||
    texto.indexOf("financiamento") !== -1 ||
    texto.indexOf("financing") !== -1 ||
    texto.indexOf("financed") !== -1 ||
    texto.indexOf("loan") !== -1 ||
    texto.indexOf("emprestimo") !== -1 ||
    texto.indexOf("moto financiada") !== -1 ||
    texto.indexOf("vehicle financing") !== -1
  ) {
    return "Financiamento";
  }

  if (
    tipoBruto === "creditCardInstallment" ||
    texto.indexOf("parcela") !== -1 ||
    texto.indexOf("parcelado") !== -1 ||
    texto.indexOf("parcelamento") !== -1 ||
    texto.indexOf("installment") !== -1 ||
    texto.indexOf("installments") !== -1 ||
    texto.indexOf("future installment") !== -1
  ) {
    return "Parcelados";
  }

  if (
    tipoBruto === "recurringFixedExpense" ||
    texto.indexOf("recorrente") !== -1 ||
    texto.indexOf("recurring") !== -1 ||
    texto.indexOf("fixo") !== -1 ||
    texto.indexOf("fixa") !== -1 ||
    texto.indexOf("fixed") !== -1 ||
    texto.indexOf("mensal") !== -1 ||
    texto.indexOf("assinatura") !== -1 ||
    texto.indexOf("contrato") !== -1 ||
    texto.indexOf("commitment fixed") !== -1
  ) {
    return "Fixos";
  }

  return null;
}

function getCommitmentTypeLabel(item) {
  var categoria = getFirstValue(item, ["category", "categoria"]);
  if (categoria) {
    return String(categoria);
  }
  return classifyCommitmentType(item) || "";
}

function getCommitmentDateSortKey(item) {
  var data = getFirstValue(item, [
    "date", "dueDate", "vencimento", "period", "month",
    "competencia", "nextDate", "firstPeriod"
  ]);
  return data ? String(data) : "9999-99";
}

function compareCommitmentDates(a, b) {
  var chaveA = getCommitmentDateSortKey(a);
  var chaveB = getCommitmentDateSortKey(b);
  if (chaveA < chaveB) {
    return -1;
  }
  if (chaveA > chaveB) {
    return 1;
  }
  return 0;
}

function sortCommitmentsByImpact(items) {
  var copia = items.slice();
  copia.sort(function (a, b) {
    var valorA = getCommitmentValue(a);
    var valorB = getCommitmentValue(b);
    var numA = valorA !== null && valorA !== undefined && !isNaN(Number(valorA)) ? Number(valorA) : -Infinity;
    var numB = valorB !== null && valorB !== undefined && !isNaN(Number(valorB)) ? Number(valorB) : -Infinity;

    if (numB !== numA) {
      return numB - numA;
    }

    return compareCommitmentDates(a, b);
  });
  return copia;
}

function somarValoresCompromissos(compromissos) {
  var total = 0;
  var temValor = false;

  for (var i = 0; i < compromissos.length; i++) {
    var valor = getCommitmentValue(compromissos[i]);
    if (valor !== null && valor !== undefined && !isNaN(Number(valor))) {
      total += Number(valor);
      temValor = true;
    }
  }

  return temValor ? total : null;
}

function getMonthlyIncome(resumo) {
  return getFirstValue(resumo || {}, [
    "income", "totalIncome", "receitas",
    "operationalIncomeTotal", "grossIncomeTotal", "monthlyIncome"
  ]);
}

function calcularPesoSobreReceitas(total, receita) {
  if (
    receita === null || receita === undefined ||
    isNaN(Number(receita)) || Number(receita) <= 0
  ) {
    return null;
  }
  if (total === null || total === undefined || isNaN(Number(total))) {
    return null;
  }
  return (Number(total) / Number(receita)) * 100;
}

function getIncomeWeightLabel(percentual) {
  if (percentual === null || percentual === undefined || isNaN(Number(percentual))) {
    return "";
  }

  var numero = Number(percentual);

  if (numero <= 30) {
    return "Confortável";
  }
  if (numero <= 50) {
    return "Atenção";
  }
  if (numero <= 70) {
    return "Alto";
  }
  return "Crítico";
}

function getIncomeWeightLevel(percentual) {
  if (percentual === null || percentual === undefined || isNaN(Number(percentual))) {
    return "neutro";
  }

  var numero = Number(percentual);

  if (numero <= 30) {
    return "confortavel";
  }
  if (numero <= 50) {
    return "atencao";
  }
  if (numero <= 70) {
    return "alto";
  }
  return "critico";
}

function contarGruposCompromissos(compromissos) {
  var grupos = {
    "Financiamento": 0,
    "Fixos": 0,
    "Parcelados": 0
  };
  var i;
  var classificado;

  for (i = 0; i < compromissos.length; i++) {
    classificado = classifyCommitmentType(compromissos[i]);
    if (classificado && grupos[classificado] !== undefined) {
      grupos[classificado]++;
    }
  }

  return grupos;
}

function summarizeFutureCommitments(compromissos, resumo) {
  var ordenados = sortCommitmentsByImpact(compromissos);

  return {
    totalValor: somarValoresCompromissos(compromissos),
    quantidade: compromissos.length,
    peso: calcularPesoSobreReceitas(somarValoresCompromissos(compromissos), getMonthlyIncome(resumo)),
    maiorImpacto: ordenados[0] || null,
    principais: ordenados.slice(0, 3),
    grupos: contarGruposCompromissos(compromissos)
  };
}

function renderIncomeWeightBar(percentual) {
  if (percentual === null || percentual === undefined || isNaN(Number(percentual))) {
    return "<span class=\"compromissos-exec__peso-valor\">—</span>";
  }

  var textoPercentual = formatPercent(percentual);
  var rotulo = getIncomeWeightLabel(percentual);
  var nivel = getIncomeWeightLevel(percentual);
  var textoCompleto = textoPercentual + " · " + rotulo;
  var largura = Math.min(100, Math.max(0, Number(percentual)));

  return (
    "<div class=\"compromissos-exec__peso\">" +
      "<div class=\"compromissos-exec__peso-trilha\" role=\"img\" aria-label=\"Comprometimento: " + escapeHtml(textoCompleto) + "\">" +
        "<div class=\"compromissos-exec__peso-preenchimento compromissos-exec__peso-preenchimento--" + nivel + "\" style=\"width: " + largura + "%\"></div>" +
      "</div>" +
      "<span class=\"compromissos-exec__peso-valor compromissos-exec__peso-valor--" + nivel + "\">" + escapeHtml(textoCompleto) + "</span>" +
    "</div>"
  );
}

function renderCommitmentTypeChip(rotulo, quantidade) {
  if (!quantidade) {
    return "";
  }
  return "<span class=\"compromissos-exec__chip\" role=\"listitem\">" + escapeHtml(rotulo + " · " + quantidade) + "</span>";
}

function renderCommitmentTypeChips(grupos) {
  var contagem = grupos || {};

  return (
    renderCommitmentTypeChip("Financiamento", contagem["Financiamento"]) +
    renderCommitmentTypeChip("Fixos", contagem["Fixos"]) +
    renderCommitmentTypeChip("Parcelados", contagem["Parcelados"])
  );
}

function renderCommitmentItemCompact(item) {
  var titulo = getCommitmentTitle(item);
  var valor = getCommitmentValue(item);
  var data = getCommitmentDate(item);
  var tipo = getCommitmentTypeLabel(item);
  var detalhe = formatCurrency(valor) + " · " + data;

  if (tipo) {
    detalhe += " · " + tipo;
  }

  return (
    "<li class=\"compromissos-exec__item\">" +
      "<span class=\"compromissos-exec__item-titulo\">" + escapeHtml(titulo) + "</span>" +
      "<span class=\"compromissos-exec__item-detalhe\">" + escapeHtml(detalhe) + "</span>" +
    "</li>"
  );
}

function renderDashboardKpi(rotulo, valor) {
  return (
    "<div class=\"dashboard__kpi\">" +
      "<span class=\"dashboard__kpi-rotulo\">" + escapeHtml(rotulo) + "</span>" +
      "<span class=\"dashboard__kpi-valor\">" + escapeHtml(valor) + "</span>" +
    "</div>"
  );
}

function renderDashboardSecao(titulo, conteudo) {
  return (
    "<section class=\"dashboard__secao\">" +
      "<h3 class=\"dashboard__secao-titulo\">" + escapeHtml(titulo) + "</h3>" +
      conteudo +
    "</section>"
  );
}

function renderDashboardEmptyState() {
  conteudoEl.innerHTML = renderEstadoVazio(
    "Dashboard",
    "ph-house",
    "Adicione seu arquivo financeiro.",
    "O resumo do mês aparecerá aqui.",
    "Importar arquivo"
  );
}

function normalizarTextoBusca(texto) {
  return String(texto || "").toLowerCase()
    .replace(/[áàâã]/g, "a")
    .replace(/[éê]/g, "e")
    .replace(/[í]/g, "i")
    .replace(/[óôõ]/g, "o")
    .replace(/[ú]/g, "u")
    .replace(/ç/g, "c");
}

function alertaEhAltoOuCritico(alerta) {
  var campos = [
    alerta.severity,
    alerta.level,
    alerta.priority,
    alerta.status,
    alerta.type
  ];
  var termos = ["critical", "critico", "critica", "high", "alto", "alta", "grave"];

  for (var i = 0; i < campos.length; i++) {
    var normalizado = normalizarTextoBusca(campos[i]);
    for (var t = 0; t < termos.length; t++) {
      if (normalizado === termos[t] || normalizado.indexOf(termos[t]) !== -1) {
        return true;
      }
    }
  }

  return false;
}

function hasHighOrCriticalAlerts(alertas) {
  for (var i = 0; i < alertas.length; i++) {
    if (alertaEhAltoOuCritico(alertas[i])) {
      return true;
    }
  }
  return false;
}

function normalizePercent(valor) {
  if (valor === null || valor === undefined || isNaN(Number(valor))) {
    return null;
  }
  var numero = Number(valor);
  if (numero > 0 && numero <= 1) {
    numero = numero * 100;
  }
  return numero;
}

function hasCardUsageAbove(cartoes, limite) {
  for (var i = 0; i < cartoes.length; i++) {
    var percentual = normalizePercent(getCardUsagePercent(cartoes[i]));
    if (percentual !== null && percentual > limite) {
      return true;
    }
  }
  return false;
}

function getCashSnapshot() {
  var resumo = getMonthlySummary() || {};
  return {
    saldoAtual: getFirstValue(resumo, [
      "currentCashConfirmed", "currentCash", "currentBalance", "cashBalance", "saldoAtual"
    ]),
    aposDebitos: getFirstValue(resumo, [
      "projectedCashAfterScheduledDebits", "projectedCashAfterScheduledDebit",
      "projectedBalanceAfterScheduledDebits", "cashAfterScheduledDebits",
      "saldoAposDebitos", "projectedBalanceAfterDebits"
    ]),
    aposRecebiveis: getFirstValue(resumo, [
      "projectedCashAfterLuiza", "projectedCashAfterReceivables",
      "cashAfterReceivables", "saldoAposRecebiveis", "projectedBalanceAfterReceivables"
    ])
  };
}

function valorEhNegativo(valor) {
  return valor !== null && valor !== undefined && !isNaN(Number(valor)) && Number(valor) < 0;
}

function valorEhPositivo(valor) {
  return valor !== null && valor !== undefined && !isNaN(Number(valor)) && Number(valor) > 0;
}

function textoContemLuizaEClaro(alertas, checklist) {
  var partes = [];
  var i;

  for (i = 0; i < alertas.length; i++) {
    partes.push(alertas[i].description, alertas[i].title, alertas[i].message);
  }

  for (i = 0; i < checklist.length; i++) {
    partes.push(checklist[i].description, checklist[i].title);
  }

  var texto = normalizarTextoBusca(partes.join(" "));
  return texto.indexOf("luiza") !== -1 && texto.indexOf("claro") !== -1;
}

function obterAcaoRecomendada(status, motivoAtencao, alertas, checklist, caixa) {
  if (
    motivoAtencao === "debitos" &&
    !valorEhNegativo(caixa.aposRecebiveis) &&
    textoContemLuizaEClaro(alertas, checklist)
  ) {
    return "Confirmar recebível da Luiza e débito Claro.";
  }

  if (motivoAtencao === "debitos" && !valorEhNegativo(caixa.aposRecebiveis)) {
    return "Confirmar os recebíveis previstos e acompanhar os débitos agendados.";
  }

  if (status === "Mês crítico") {
    return "Revisar despesas e priorizar compromissos essenciais.";
  }

  if (status === "Mês em atenção" && motivoAtencao === "alertas") {
    return "Resolver os principais alertas antes de assumir novos compromissos.";
  }

  if (status === "Mês saudável") {
    return "Manter o controle atual e acompanhar os próximos compromissos.";
  }

  if (status === "Mês controlado") {
    return "Acompanhar cartões e compromissos até o fechamento do mês.";
  }

  return "Acompanhar o caixa e os compromissos do mês.";
}

function obterClasseStatusExecutivo(status) {
  var mapa = {
    "Mês crítico": "critico",
    "Mês em atenção": "atencao",
    "Mês controlado": "controlado",
    "Mês saudável": "saudavel"
  };
  return mapa[status] || "controlado";
}

function buildExecutiveDiagnosis() {
  var caixa = getCashSnapshot();
  var alertas = getAlerts();
  var cartoes = getCards();
  var checklist = getChecklist();
  var status;
  var motivoAtencao = null;
  var diagnostico;

  if (valorEhNegativo(caixa.aposRecebiveis)) {
    status = "Mês crítico";
  } else if (valorEhNegativo(caixa.aposDebitos)) {
    status = "Mês em atenção";
    motivoAtencao = "debitos";
  } else if (hasHighOrCriticalAlerts(alertas)) {
    status = "Mês em atenção";
    motivoAtencao = "alertas";
  } else if (
    valorEhPositivo(caixa.saldoAtual) &&
    !valorEhNegativo(caixa.aposDebitos) &&
    !valorEhNegativo(caixa.aposRecebiveis) &&
    !hasHighOrCriticalAlerts(alertas) &&
    !hasCardUsageAbove(cartoes, 70)
  ) {
    status = "Mês saudável";
  } else {
    status = "Mês controlado";
  }

  if (status === "Mês crítico") {
    diagnostico = "Mesmo após os recebíveis, o saldo previsto permanece negativo.";
  } else if (status === "Mês em atenção" && motivoAtencao === "debitos") {
    diagnostico = "O saldo fica negativo antes da entrada dos recebíveis.";
  } else if (status === "Mês em atenção") {
    diagnostico = "Há pontos de atenção que precisam ser acompanhados neste mês.";
  } else if (status === "Mês saudável") {
    diagnostico = "O mês está positivo, sem alertas relevantes e sem uso elevado dos cartões.";
  } else {
    diagnostico = "O mês está sob controle, mas ainda exige acompanhamento.";
  }

  return {
    periodo: obterPeriodoAtualLabel(),
    status: status,
    diagnostico: diagnostico,
    acao: obterAcaoRecomendada(status, motivoAtencao, alertas, checklist, caixa),
    saldoAtual: caixa.saldoAtual,
    aposDebitos: caixa.aposDebitos,
    aposRecebiveis: caixa.aposRecebiveis
  };
}

function getCashFlowState(valor, papel) {
  if (valor === null || valor === undefined || isNaN(Number(valor))) {
    return "neutro";
  }

  var numero = Number(valor);

  if (papel === "debitos") {
    if (numero < 0) {
      return "negativo";
    }
    if (numero > 0) {
      return "positivo";
    }
    return "neutro";
  }

  if (papel === "recebiveis") {
    return "recuperacao";
  }

  if (numero < 0) {
    return "negativo";
  }
  if (numero > 0) {
    return "positivo";
  }
  return "neutro";
}

function renderCashFlowIndicador(estado, papel) {
  if (estado === "negativo") {
    return "<span class=\"cash-flow__indicador\">Saldo negativo</span>";
  }
  if (estado === "positivo" && papel === "inicio") {
    return "<span class=\"cash-flow__indicador\">Saldo positivo</span>";
  }
  if (estado === "recuperacao") {
    return "<span class=\"cash-flow__indicador\">Recuperação</span>";
  }
  return "";
}

function renderCashFlowStep(rotulo, valor, papel) {
  var estado = getCashFlowState(valor, papel);

  return (
    "<div class=\"cash-flow__etapa cash-flow__etapa--" + estado + "\">" +
      "<span class=\"cash-flow__rotulo\">" + escapeHtml(rotulo) + "</span>" +
      "<span class=\"cash-flow__valor\">" + escapeHtml(formatCurrency(valor)) + "</span>" +
      renderCashFlowIndicador(estado, papel) +
    "</div>"
  );
}

function renderCashFlowConnector() {
  return "<div class=\"cash-flow__conector\" aria-hidden=\"true\"><span>→</span></div>";
}

function renderCashFlow(diag) {
  var legenda = "";

  if (valorEhNegativo(diag.aposDebitos) && !valorEhNegativo(diag.aposRecebiveis)) {
    legenda = "<p class=\"cash-flow__legenda\">O caixa cai antes dos recebíveis e fecha positivo.</p>";
  }

  return (
    "<div class=\"cash-flow\" role=\"group\" aria-label=\"Fluxo do caixa no mês\">" +
      "<div class=\"cash-flow__passos\">" +
        renderCashFlowStep("Saldo atual", diag.saldoAtual, "inicio") +
        renderCashFlowConnector() +
        renderCashFlowStep("Após débitos", diag.aposDebitos, "debitos") +
        renderCashFlowConnector() +
        renderCashFlowStep("Após recebíveis", diag.aposRecebiveis, "recebiveis") +
      "</div>" +
      legenda +
    "</div>"
  );
}

function renderExecutiveDiagnosisBlock() {
  var diag = buildExecutiveDiagnosis();
  var classeStatus = obterClasseStatusExecutivo(diag.status);

  return (
    "<section class=\"dashboard__executivo\" aria-labelledby=\"dashboard-diagnostico-titulo\">" +
      "<div class=\"dashboard__executivo-decisao\">" +
        "<p class=\"dashboard__executivo-periodo\">" + escapeHtml(diag.periodo) + "</p>" +
        "<p id=\"dashboard-diagnostico-titulo\" class=\"dashboard__executivo-badge dashboard__executivo-badge--" + classeStatus + "\">" +
          escapeHtml(diag.status) +
        "</p>" +
        "<p class=\"dashboard__executivo-diagnostico\">" + escapeHtml(diag.diagnostico) + "</p>" +
        "<p class=\"dashboard__executivo-acao\">" +
          "<span class=\"dashboard__executivo-acao-rotulo\">Próximo passo:</span> " +
          escapeHtml(diag.acao) +
        "</p>" +
      "</div>" +
      "<div class=\"dashboard__executivo-caixa\">" +
        renderCashFlow(diag) +
        "<div class=\"dashboard__executivo-folego\">" +
          "<span class=\"dashboard__executivo-folego-rotulo\">Fôlego previsto</span>" +
          "<span class=\"dashboard__executivo-folego-valor\">" + escapeHtml(formatCurrency(diag.aposRecebiveis)) + "</span>" +
        "</div>" +
      "</div>" +
    "</section>"
  );
}

function renderDashboardContextRow() {
  var resumo = getMonthlySummary() || {};

  return (
    "<section class=\"dashboard__contexto\">" +
      "<h3 class=\"dashboard__contexto-titulo\">Resumo do mês</h3>" +
      "<div class=\"dashboard__contexto-grid\">" +
        renderDashboardKpi("Receitas", formatCurrency(getFirstValue(resumo, [
          "operationalIncomeTotal", "grossIncomeTotal", "income", "totalIncome", "receitas"
        ]))) +
        renderDashboardKpi("Despesas", formatCurrency(getFirstValue(resumo, [
          "postedOperationalExpenseTotal", "postedGrossExpenseTotal", "expenses", "totalExpenses", "despesas", "operationalExpenseTotal"
        ]))) +
        renderDashboardKpi("Faturas", formatCurrency(getFirstValue(resumo, [
          "closedInvoicesTotal", "invoicesTotal", "invoiceTotal", "faturas"
        ]))) +
        renderDashboardKpi("Recebíveis", formatCurrency(getFirstValue(resumo, [
          "receivablesOpenTotal", "receivablesTotal", "recebiveis"
        ]))) +
      "</div>" +
    "</section>"
  );
}

function coletarTextosAlertasChecklist(alertas, checklist) {
  var partes = [];
  var i;

  for (i = 0; i < alertas.length; i++) {
    partes.push(
      alertas[i].description,
      alertas[i].title,
      alertas[i].message,
      alertas[i].action
    );
  }

  for (i = 0; i < checklist.length; i++) {
    partes.push(
      checklist[i].description,
      checklist[i].title,
      checklist[i].label
    );
  }

  return normalizarTextoBusca(partes.join(" "));
}

function textoContemTermos(textoNormalizado, termos) {
  for (var i = 0; i < termos.length; i++) {
    if (textoNormalizado.indexOf(normalizarTextoBusca(termos[i])) !== -1) {
      return true;
    }
  }
  return false;
}

function resumirTextoPrioridade(texto) {
  var limpo = String(texto || "").trim();
  if (!limpo) {
    return "";
  }
  if (limpo.length <= 80) {
    return limpo;
  }
  return limpo.substring(0, 77) + "...";
}

function buildPriorityAction(alertas, checklist) {
  if (textoContemLuizaEClaro(alertas, checklist)) {
    return "Confirmar recebível da Luiza e débito Claro.";
  }

  var priorizados = obterAlertasPriorizados(5);
  for (var i = 0; i < priorizados.length; i++) {
    if (alertaEhAltoOuCritico(priorizados[i])) {
      var texto =
        priorizados[i].action ||
        priorizados[i].description ||
        priorizados[i].title ||
        priorizados[i].message;
      var resumo = resumirTextoPrioridade(texto);
      if (resumo) {
        return resumo;
      }
    }
  }

  return "Acompanhar os principais alertas do mês.";
}

function buildRiskChips(alertas, checklist, cartoes) {
  var chips = [];
  var texto = coletarTextosAlertasChecklist(alertas, checklist);

  if (textoContemTermos(texto, ["reserva", "emergencia", "zerada", "zerado", "sem reserva"])) {
    chips.push("Reserva zerada");
  }

  if (hasCardUsageAbove(cartoes, 80)) {
    chips.push("Cartões acima de 80%");
  }

  if (textoContemTermos(texto, ["rotativo", "minimo", "pagamento minimo", "fatura minima"])) {
    chips.push("Evitar rotativo/mínimo");
  }

  return chips.slice(0, 3);
}

function obterNomeCartaoDashboard(cartao) {
  return getFirstValue(cartao, ["name", "cardName", "nome", "label"]) || "Cartão";
}

function obterUsadoCartaoDashboard(cartao) {
  return getFirstValue(cartao, ["used", "totalUsed", "usado", "usedAmount", "currentUsed", "usedLimit"]);
}

function obterDisponivelCartaoDashboard(cartao) {
  return getFirstValue(cartao, ["available", "availableLimit", "disponivel", "availableAmount"]);
}

function obterSituacaoCartaoDashboard(cartao) {
  var exibicao = getFirstValue(cartao, ["displayStatus", "situacao"]);
  if (exibicao) {
    return String(exibicao);
  }
  if (cartao.status) {
    return traduzirSituacaoCartao(cartao.status);
  }
  return "—";
}

function getCardPressureLevel(percentual) {
  if (percentual === null || percentual === undefined || isNaN(Number(percentual))) {
    return "desconhecido";
  }
  if (percentual > 80) {
    return "alta";
  }
  if (percentual >= 50) {
    return "moderada";
  }
  return "baixa";
}

function obterRotuloPressaoCartao(nivel) {
  if (nivel === "alta") {
    return "Pressão alta";
  }
  if (nivel === "moderada") {
    return "Pressão moderada";
  }
  if (nivel === "baixa") {
    return "Pressão baixa";
  }
  return "";
}

function renderUsageBar(percentual) {
  var numero = normalizePercent(percentual);
  var nivel = getCardPressureLevel(numero);
  var largura = numero === null ? 0 : Math.min(100, Math.max(0, numero));
  var textoUso = formatPercent(percentual);
  var rotuloPressao = obterRotuloPressaoCartao(nivel);

  return (
    "<div class=\"card-row__barra\">" +
      "<span class=\"card-row__barra-rotulo\">Uso</span>" +
      "<div class=\"card-row__barra-trilha\" role=\"img\" aria-label=\"Uso do cartão: " + escapeHtml(textoUso) +
        (rotuloPressao ? ", " + escapeHtml(rotuloPressao) : "") + "\">" +
        "<div class=\"card-row__barra-preenchimento card-row__barra-preenchimento--" + nivel + "\" style=\"width: " + largura + "%\"></div>" +
      "</div>" +
      "<div class=\"card-row__barra-meta\">" +
        "<span class=\"card-row__barra-valor\">" + escapeHtml(textoUso) + "</span>" +
        (rotuloPressao ? "<span class=\"card-row__barra-pressao\">" + escapeHtml(rotuloPressao) + "</span>" : "") +
      "</div>" +
    "</div>"
  );
}

function renderPrioritiesSection() {
  var alertas = getAlerts();
  var checklist = getChecklist();
  var cartoes = getCards();
  var acao = buildPriorityAction(alertas, checklist);
  var riscos = buildRiskChips(alertas, checklist, cartoes);
  var html;

  html =
    "<div class=\"prioridades\">" +
      "<article class=\"prioridades__principal\">" +
        "<span class=\"prioridades__principal-rotulo\">Prioridade agora</span>" +
        "<p class=\"prioridades__principal-texto\">" + escapeHtml(acao) + "</p>" +
      "</article>" +
      "<div class=\"prioridades__riscos\" role=\"list\" aria-label=\"Riscos do mês\">";

  if (riscos.length === 0) {
    html += "<span class=\"prioridades__risco prioridades__risco--neutro\" role=\"listitem\">Sem prioridade crítica no momento.</span>";
  } else {
    for (var i = 0; i < riscos.length; i++) {
      html +=
        "<span class=\"prioridades__risco\" role=\"listitem\">" + escapeHtml(riscos[i]) + "</span>";
    }
  }

  html += "</div></div>";

  return renderDashboardSecao("Prioridades", html);
}

function renderCardUsageRow(cartao) {
  var nome = obterNomeCartaoDashboard(cartao);
  var usado = obterUsadoCartaoDashboard(cartao);
  var disponivel = obterDisponivelCartaoDashboard(cartao);
  var situacao = obterSituacaoCartaoDashboard(cartao);
  var percentual = getCardUsagePercent(cartao);

  return (
    "<article class=\"card-row\">" +
      "<h4 class=\"card-row__nome\">" + escapeHtml(nome) + "</h4>" +
      "<div class=\"card-row__metrica\">" +
        "<span class=\"card-row__rotulo\">Usado</span>" +
        "<span class=\"card-row__valor\">" + escapeHtml(formatCurrency(usado)) + "</span>" +
      "</div>" +
      "<div class=\"card-row__metrica\">" +
        "<span class=\"card-row__rotulo\">Disponível</span>" +
        "<span class=\"card-row__valor\">" + escapeHtml(formatCurrency(disponivel)) + "</span>" +
      "</div>" +
      "<div class=\"card-row__metrica\">" +
        "<span class=\"card-row__rotulo\">Uso</span>" +
        "<span class=\"card-row__valor\">" + escapeHtml(formatPercent(percentual)) + "</span>" +
      "</div>" +
      "<div class=\"card-row__metrica card-row__metrica--situacao\">" +
        "<span class=\"card-row__rotulo\">Situação</span>" +
        "<span class=\"card-row__valor\">" + escapeHtml(situacao) + "</span>" +
      "</div>" +
      renderUsageBar(percentual) +
    "</article>"
  );
}

function renderCardsUsageSection() {
  var cartoes = getCards();
  var html;

  if (cartoes.length === 0) {
    html = "<p class=\"dashboard__vazio\">Nenhum cartão para exibir.</p>";
  } else {
    html = "<div class=\"card-rows\">";
    for (var i = 0; i < cartoes.length; i++) {
      html += renderCardUsageRow(cartoes[i]);
    }
    html += "</div>";
  }

  return renderDashboardSecao("Cartões em uso", html);
}

function renderFutureCommitmentsSection() {
  var compromissos = obterCompromissosFuturosFiltrados();
  var resumo = getMonthlySummary() || {};
  var html;

  if (compromissos.length === 0) {
    html = "<p class=\"dashboard__vazio\">Nenhum compromisso futuro para exibir.</p>";
  } else {
    var dados = summarizeFutureCommitments(compromissos, resumo);
    var grupos = dados.grupos || {};
    var impacto = dados.maiorImpacto;
    var impactoTitulo = impacto ? getCommitmentTitle(impacto) : "—";
    var impactoValor = impacto ? formatCurrency(getCommitmentValue(impacto)) : "—";
    var impactoTipo = impacto ? getCommitmentTypeLabel(impacto) : "";
    var chips = renderCommitmentTypeChips(grupos);

    html =
      "<div class=\"compromissos-exec\">" +
        "<div class=\"compromissos-exec__resumo\">" +
          "<div class=\"compromissos-exec__kpi\">" +
            "<span class=\"compromissos-exec__kpi-rotulo\">Total previsto</span>" +
            "<span class=\"compromissos-exec__kpi-valor\">" + escapeHtml(formatCurrency(dados.totalValor)) + "</span>" +
          "</div>" +
          "<div class=\"compromissos-exec__kpi\">" +
            "<span class=\"compromissos-exec__kpi-rotulo\">Compromissos</span>" +
            "<span class=\"compromissos-exec__kpi-valor\">" + escapeHtml(formatCount(dados.quantidade, "compromisso", "compromissos")) + "</span>" +
          "</div>" +
          "<div class=\"compromissos-exec__kpi compromissos-exec__kpi--peso\">" +
            "<span class=\"compromissos-exec__kpi-rotulo\">Comprometimento</span>" +
            renderIncomeWeightBar(dados.peso) +
          "</div>" +
        "</div>" +
        "<article class=\"compromissos-exec__impacto\">" +
          "<span class=\"compromissos-exec__impacto-rotulo\">Maior impacto</span>" +
          "<p class=\"compromissos-exec__impacto-titulo\">" + escapeHtml(impactoTitulo) + "</p>" +
          "<p class=\"compromissos-exec__impacto-valor\">" + escapeHtml(impactoValor) + "</p>" +
          (impactoTipo ? "<p class=\"compromissos-exec__impacto-tipo\">" + escapeHtml(impactoTipo) + "</p>" : "") +
        "</article>";

    if (chips) {
      html +=
        "<div class=\"compromissos-exec__chips\" role=\"list\" aria-label=\"Tipos de compromisso\">" +
          chips +
        "</div>";
    }

    html +=
        "<div class=\"compromissos-exec__maiores\">" +
          "<h4 class=\"compromissos-exec__maiores-titulo\">Maiores impactos</h4>" +
          "<ul class=\"compromissos-exec__lista\">";

    for (var i = 0; i < dados.principais.length; i++) {
      html += renderCommitmentItemCompact(dados.principais[i]);
    }

    html += "</ul></div></div>";
  }

  return renderDashboardSecao("Próximos compromissos", html);
}

function obterFrasePrioridadeLeitura(prioridade, alertas, checklist) {
  if (textoContemLuizaEClaro(alertas, checklist)) {
    return "Confirme o recebível da Luiza e o débito Claro antes de assumir novos gastos.";
  }

  var texto = String(prioridade || "").trim();
  if (!texto) {
    return "";
  }

  if (texto.indexOf("Confirmar") === 0) {
    texto = "Confirme" + texto.substring("Confirmar".length);
  }

  if (texto.charAt(texto.length - 1) !== ".") {
    texto += ".";
  }

  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function obterFraseCuidadoLeitura(riscos) {
  var temRotativo = false;
  var temCartoes = false;
  var temReserva = false;
  var i;

  for (i = 0; i < riscos.length; i++) {
    if (riscos[i].indexOf("rotativo") !== -1 || riscos[i].indexOf("mínimo") !== -1) {
      temRotativo = true;
    }
    if (riscos[i].indexOf("Cartões") !== -1 || riscos[i].indexOf("80%") !== -1) {
      temCartoes = true;
    }
    if (riscos[i].indexOf("Reserva") !== -1) {
      temReserva = true;
    }
  }

  var partes = [];
  if (temRotativo) {
    partes.push("evite rotativo");
  }
  if (temCartoes) {
    partes.push("mantenha os cartões sob controle");
  }
  if (temReserva) {
    partes.push("atenção à reserva de emergência");
  }

  if (partes.length === 0) {
    return "";
  }

  var frase = partes.join(" e ");
  return frase.charAt(0).toUpperCase() + frase.slice(1) + ".";
}

function buildMonthReadingText() {
  var diag = buildExecutiveDiagnosis();
  var alertas = getAlerts();
  var checklist = getChecklist();
  var cartoes = getCards();
  var prioridade = buildPriorityAction(alertas, checklist);
  var riscos = buildRiskChips(alertas, checklist, cartoes);
  var partes = [];

  if (diag.status) {
    partes.push(diag.status + ".");
  }

  var frasePrioridade = obterFrasePrioridadeLeitura(prioridade, alertas, checklist);
  if (frasePrioridade) {
    partes.push(frasePrioridade);
  }

  var fraseCuidado = obterFraseCuidadoLeitura(riscos);
  if (fraseCuidado) {
    partes.push(fraseCuidado);
  }

  if (partes.length === 0) {
    return "Continue acompanhando caixa, cartões e compromissos do mês.";
  }

  return partes.join(" ");
}

function renderMonthReadingSection() {
  var texto = buildMonthReadingText();

  return (
    "<aside class=\"dashboard__leitura\" aria-label=\"Leitura do mês\">" +
      "<h3 class=\"dashboard__leitura-titulo\">Leitura do mês</h3>" +
      "<p class=\"dashboard__leitura-texto\">" + escapeHtml(texto) + "</p>" +
    "</aside>"
  );
}

function renderDashboardMvp() {
  return (
    "<section class=\"secao dashboard\">" +
      "<h2 class=\"secao__titulo\">" +
        "<i class=\"ph ph-house secao__icone\" aria-hidden=\"true\"></i>" +
        "Dashboard" +
      "</h2>" +
      renderExecutiveDiagnosisBlock() +
      renderDashboardContextRow() +
      renderPrioritiesSection() +
      renderCardsUsageSection() +
      renderFutureCommitmentsSection() +
      renderMonthReadingSection() +
    "</section>"
  );
}

function renderDashboardPage() {
  if (!hasConfirmedImport()) {
    renderDashboardEmptyState();
    return;
  }

  conteudoEl.innerHTML = renderDashboardMvp();
}

function formatBalancoCurrency(valor) {
  if (valor === null || valor === undefined || valor === "" || isNaN(Number(valor))) {
    return "—";
  }

  var numero = Number(valor);
  var negativo = numero < 0;
  var absoluto = Math.abs(numero);
  var textoNumero = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(absoluto);

  if (negativo) {
    return "-R$ " + textoNumero;
  }

  return "R$ " + textoNumero;
}

function getBalancoData() {
  var resumo = getMonthlySummary() || {};
  var caixa = getCashSnapshot();
  var compromissos = obterCompromissosFuturosFiltrados();

  return {
    periodo: obterPeriodoAtualLabel(),
    receitas: getFirstValue(resumo, [
      "income", "totalIncome", "receitas",
      "operationalIncomeTotal", "grossIncomeTotal", "monthlyIncome"
    ]),
    despesas: getFirstValue(resumo, [
      "expenses", "totalExpenses", "despesas",
      "postedOperationalExpenseTotal", "postedGrossExpenseTotal",
      "operationalExpenseTotal", "grossExpensesTotal", "monthlyExpenses"
    ]),
    faturas: getFirstValue(resumo, [
      "closedInvoicesTotal", "invoicesTotal", "invoiceTotal",
      "totalInvoices", "faturas", "faturasTotal", "monthlyInvoicesTotal"
    ]),
    recebiveis: getFirstValue(resumo, [
      "receivablesTotal", "receivablesOpenTotal", "recebiveis", "recebiveisTotal"
    ]),
    saldoAtual: caixa.saldoAtual,
    saldoAposDebitos: caixa.aposDebitos,
    saldoAposRecebiveis: caixa.aposRecebiveis,
    compromissosCount: compromissos.length
  };
}

function getBalancoStatus(dados) {
  if (valorEhNegativo(dados.saldoAposRecebiveis)) {
    return {
      status: "Mês crítico",
      classe: "critico",
      diagnostico: "Mesmo após os recebíveis, o mês permanece negativo.",
      cuidado: "Revisar gastos e priorizar compromissos essenciais."
    };
  }

  if (valorEhNegativo(dados.saldoAposDebitos) && !valorEhNegativo(dados.saldoAposRecebiveis)) {
    return {
      status: "Mês em atenção",
      classe: "atencao",
      diagnostico: "O caixa depende dos recebíveis para fechar positivo.",
      cuidado: "Confirmar recebíveis e evitar novos gastos até regularizar o caixa."
    };
  }

  if (!valorEhNegativo(dados.saldoAposDebitos) && valorEhPositivo(dados.saldoAposRecebiveis)) {
    return {
      status: "Mês controlado",
      classe: "controlado",
      diagnostico: "O mês fecha positivo com os valores atuais.",
      cuidado: "Manter acompanhamento de faturas e compromissos."
    };
  }

  return {
    status: "Mês controlado",
    classe: "controlado",
    diagnostico: "O mês fecha positivo com os valores atuais.",
    cuidado: "Manter acompanhamento de faturas e compromissos."
  };
}

function renderBalancoExecutiveBlock(dados) {
  var analise = getBalancoStatus(dados);

  return (
    "<section class=\"balanco__executivo\" aria-label=\"Análise do balanço\">" +
      "<div class=\"balanco-executivo\">" +
        "<div class=\"balanco-executivo__topo\">" +
          "<div class=\"balanco-executivo__periodo-bloco\">" +
            "<span class=\"balanco-executivo__periodo-rotulo\">Período</span>" +
            "<span class=\"balanco-executivo__periodo-valor\">" + escapeHtml(dados.periodo) + "</span>" +
          "</div>" +
          "<span class=\"balanco-executivo__badge balanco-executivo__badge--" + analise.classe + "\">" +
            escapeHtml(analise.status) +
          "</span>" +
        "</div>" +
        "<p class=\"balanco-executivo__diagnostico\">" + escapeHtml(analise.diagnostico) + "</p>" +
        "<div class=\"balanco-executivo__rodape\">" +
          "<div class=\"balanco-executivo__destaque\">" +
            "<span class=\"balanco-executivo__destaque-rotulo\">Saldo previsto</span>" +
            "<span class=\"balanco-executivo__destaque-valor\">" + escapeHtml(formatBalancoCurrency(dados.saldoAposRecebiveis)) + "</span>" +
          "</div>" +
          "<p class=\"balanco-executivo__cuidado\">" +
            "<span class=\"balanco-executivo__cuidado-rotulo\">Cuidado recomendado</span> " +
            escapeHtml(analise.cuidado) +
          "</p>" +
        "</div>" +
      "</div>" +
    "</section>"
  );
}

function renderBalancoKpi(rotulo, valor) {
  return (
    "<div class=\"balanco__kpi\">" +
      "<span class=\"balanco__kpi-rotulo\">" + escapeHtml(rotulo) + "</span>" +
      "<span class=\"balanco__kpi-valor\">" + escapeHtml(valor) + "</span>" +
    "</div>"
  );
}

function renderResultadoMes(dados) {
  return (
    "<section class=\"balanco__resultado\" aria-label=\"Resultado do mês\">" +
      "<h3 class=\"balanco__secao-titulo balanco__secao-titulo--secundario\">Resultado do mês</h3>" +
      "<div class=\"balanco__kpi-grid balanco__kpi-grid--resultado\">" +
        renderBalancoKpi("Receitas", formatBalancoCurrency(dados.receitas)) +
        renderBalancoKpi("Despesas", formatBalancoCurrency(dados.despesas)) +
        renderBalancoKpi("Faturas", formatBalancoCurrency(dados.faturas)) +
        renderBalancoKpi("Recebíveis", formatBalancoCurrency(dados.recebiveis)) +
        renderBalancoKpi("Saldo atual", formatBalancoCurrency(dados.saldoAtual)) +
        renderBalancoKpi("Saldo previsto", formatBalancoCurrency(dados.saldoAposRecebiveis)) +
      "</div>" +
    "</section>"
  );
}

function renderBalancoCaixaEtapa(rotulo, valor, papel) {
  var estado = getCashFlowState(valor, papel);

  return (
    "<div class=\"balanco-caixa__etapa balanco-caixa__etapa--" + estado + "\">" +
      "<span class=\"balanco-caixa__rotulo\">" + escapeHtml(rotulo) + "</span>" +
      "<span class=\"balanco-caixa__valor\">" + escapeHtml(formatBalancoCurrency(valor)) + "</span>" +
    "</div>"
  );
}

function renderBalancoCaixaConector() {
  return "<div class=\"balanco-caixa__conector\" aria-hidden=\"true\"><span>→</span></div>";
}

function renderCaixaMes(dados) {
  return (
    "<section class=\"balanco__caixa\" aria-label=\"Caixa do mês\">" +
      "<h3 class=\"balanco__secao-titulo\">Caixa do mês</h3>" +
      "<div class=\"balanco-caixa\" role=\"group\" aria-label=\"Movimentação do caixa\">" +
        "<div class=\"balanco-caixa__passos\">" +
          renderBalancoCaixaEtapa("Saldo atual", dados.saldoAtual, "inicio") +
          renderBalancoCaixaConector() +
          renderBalancoCaixaEtapa("Após débitos", dados.saldoAposDebitos, "debitos") +
          renderBalancoCaixaConector() +
          renderBalancoCaixaEtapa("Após recebíveis", dados.saldoAposRecebiveis, "recebiveis") +
        "</div>" +
      "</div>" +
    "</section>"
  );
}

function renderComposicao(dados) {
  var compromissosTexto;

  if (dados.compromissosCount === 0) {
    compromissosTexto = "Nenhum";
  } else if (dados.compromissosCount === 1) {
    compromissosTexto = "1 item";
  } else {
    compromissosTexto = dados.compromissosCount + " itens";
  }

  return (
    "<section class=\"balanco__composicao\" aria-label=\"Composição\">" +
      "<h3 class=\"balanco__secao-titulo\">Composição</h3>" +
      "<ul class=\"balanco-composicao__lista\">" +
        "<li class=\"balanco-composicao__item\">" +
          "<span class=\"balanco-composicao__rotulo\">Faturas</span>" +
          "<span class=\"balanco-composicao__valor\">" + escapeHtml(formatBalancoCurrency(dados.faturas)) + "</span>" +
        "</li>" +
        "<li class=\"balanco-composicao__item\">" +
          "<span class=\"balanco-composicao__rotulo\">Recebíveis</span>" +
          "<span class=\"balanco-composicao__valor\">" + escapeHtml(formatBalancoCurrency(dados.recebiveis)) + "</span>" +
        "</li>" +
        "<li class=\"balanco-composicao__item\">" +
          "<span class=\"balanco-composicao__rotulo\">Compromissos futuros</span>" +
          "<span class=\"balanco-composicao__valor\">" + escapeHtml(compromissosTexto) + "</span>" +
        "</li>" +
      "</ul>" +
    "</section>"
  );
}

function renderLeituraBalanco(dados) {
  var texto;

  if (valorEhNegativo(dados.saldoAposDebitos) && !valorEhNegativo(dados.saldoAposRecebiveis)) {
    texto = "O mês exige atenção porque o caixa fica negativo antes dos recebíveis. Com as entradas previstas, o saldo fecha positivo, mas novos gastos devem ser evitados.";
  } else if (valorEhNegativo(dados.saldoAposRecebiveis)) {
    texto = "Mesmo com os recebíveis previstos, o mês permanece negativo e exige revisão dos gastos.";
  } else if (!valorEhNegativo(dados.saldoAposDebitos) && valorEhPositivo(dados.saldoAposRecebiveis)) {
    texto = "O mês está controlado com saldo positivo, mas ainda exige acompanhamento de faturas e compromissos.";
  } else {
    texto = "O balanço do mês resume entradas, saídas e saldo previsto para acompanhamento contínuo.";
  }

  return (
    "<section class=\"balanco__leitura\" aria-label=\"Leitura do balanço\">" +
      "<h3 class=\"balanco__secao-titulo balanco__secao-titulo--conclusao\">Leitura do balanço</h3>" +
      "<p class=\"balanco__leitura-texto\">" + escapeHtml(texto) + "</p>" +
    "</section>"
  );
}

function renderBalancoEmptyState() {
  return renderEstadoVazio(
    "Balanço",
    "ph-chart-line-up",
    "Adicione seu arquivo financeiro.",
    "Receitas, despesas e saldo aparecerão aqui.",
    "Importar arquivo"
  );
}

function renderBalancoPage() {
  var dados;

  if (!hasConfirmedImport()) {
    conteudoEl.innerHTML = renderBalancoEmptyState();
    return;
  }

  dados = getBalancoData();

  conteudoEl.innerHTML =
    "<section class=\"secao balanco\">" +
      "<h2 class=\"secao__titulo\">" +
        "<i class=\"ph ph-chart-line-up secao__icone\" aria-hidden=\"true\"></i>" +
        "Balanço" +
      "</h2>" +
      renderBalancoExecutiveBlock(dados) +
      renderResultadoMes(dados) +
      renderCaixaMes(dados) +
      renderComposicao(dados) +
      renderLeituraBalanco(dados) +
    "</section>";
}

function renderCartoesEmptyState() {
  return renderEstadoVazio(
    "Cartões",
    "ph-credit-card",
    "Adicione seu arquivo financeiro.",
    "Limites, uso e faturas aparecerão aqui.",
    "Importar arquivo"
  );
}

function getCardDisplayName(card) {
  return getFirstValue(card, ["name", "cardName", "nome", "label"]) || "Cartão";
}

function getCardInstitution(card) {
  return getFirstValue(card, ["institution", "bank", "issuer", "instituicao", "banco"]);
}

function getCardLimit(card) {
  return getFirstValue(card, ["limit", "totalLimit", "limite", "creditLimit"]);
}

function getCardUsed(card) {
  return getFirstValue(card, ["used", "totalUsed", "usado", "usedAmount", "currentUsed", "usedLimit"]);
}

function getCardAvailable(card) {
  return getFirstValue(card, ["available", "availableLimit", "disponivel", "availableAmount"]);
}

function getCardInvoiceAmount(card, invoices) {
  var valor = getFirstValue(card, [
    "currentInvoiceAmount", "invoiceAmount", "currentInvoice",
    "faturaAtual", "invoiceTotal", "closedInvoiceAmount"
  ]);

  if (valor !== null && valor !== undefined && !isNaN(Number(valor))) {
    return valor;
  }

  var nome = getCardDisplayName(card);
  var i;

  for (i = 0; i < invoices.length; i++) {
    if (invoices[i].cardName === nome || invoices[i].cardName === card.name) {
      return invoices[i].totalAmount;
    }
  }

  return null;
}

function getCardStatusLabel(card) {
  var exibicao = getFirstValue(card, ["displayStatus", "situacao"]);
  if (exibicao) {
    return String(exibicao);
  }
  if (card.status) {
    return traduzirSituacaoCartao(card.status);
  }
  return "—";
}

function normalizeCardUsagePercent(valor) {
  return normalizePercent(valor);
}

function getCardPressure(card) {
  var percentual = normalizeCardUsagePercent(getCardUsagePercent(card));

  if (percentual === null) {
    return "—";
  }
  if (percentual < 50) {
    return "Baixa";
  }
  if (percentual < 80) {
    return "Moderada";
  }
  if (percentual < 95) {
    return "Alta";
  }
  return "Crítica";
}

function getCardPressureClass(pressao) {
  var mapa = {
    "Baixa": "baixa",
    "Moderada": "moderada",
    "Alta": "alta",
    "Crítica": "critica"
  };
  return mapa[pressao] || "neutra";
}

function getCardRecommendedAction(pressao) {
  if (pressao === "Alta" || pressao === "Crítica") {
    return "Evitar novos gastos neste cartão.";
  }
  if (pressao === "Moderada") {
    return "Usar apenas se necessário.";
  }
  if (pressao === "Baixa") {
    return "Manter uso controlado.";
  }
  return "—";
}

function somarValoresListaCartoes(cartoes, obterValor) {
  var total = 0;
  var temValor = false;
  var i;
  var valor;

  for (i = 0; i < cartoes.length; i++) {
    valor = obterValor(cartoes[i]);
    if (valor !== null && valor !== undefined && !isNaN(Number(valor))) {
      total += Number(valor);
      temValor = true;
    }
  }

  return temValor ? total : null;
}

function isNegativeNumber(valor) {
  return valor !== null && valor !== undefined && !isNaN(Number(valor)) && Number(valor) < 0;
}

function formatCartoesCurrency(valor) {
  if (valor === null || valor === undefined || valor === "" || isNaN(Number(valor))) {
    return "—";
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(valor));
}

function formatAbsoluteCurrency(valor) {
  if (valor === null || valor === undefined || isNaN(Number(valor))) {
    return "—";
  }
  return formatCartoesCurrency(Math.abs(Number(valor)));
}

function somarFaturasPositivasCartoes(cartoes, invoices) {
  var total = 0;
  var temValor = false;
  var i;
  var valor;

  for (i = 0; i < cartoes.length; i++) {
    valor = getCardInvoiceAmount(cartoes[i], invoices);
    if (valor !== null && valor !== undefined && !isNaN(Number(valor)) && Number(valor) > 0) {
      total += Number(valor);
      temValor = true;
    }
  }

  return temValor ? total : null;
}

function somarFaturasPositivasInvoices(invoices) {
  var total = 0;
  var temValor = false;
  var i;
  var valor;

  for (i = 0; i < invoices.length; i++) {
    valor = invoices[i].totalAmount;
    if (valor !== null && valor !== undefined && !isNaN(Number(valor)) && Number(valor) > 0) {
      total += Number(valor);
      temValor = true;
    }
  }

  return temValor ? total : null;
}

function getMonthlyInvoiceTotalForCardsPage(resumoMensal, cartoes, invoices) {
  var totalResumo = getFirstValue(resumoMensal || {}, [
    "closedInvoicesTotal", "invoicesTotal", "invoiceTotal",
    "totalInvoices", "faturas", "faturasTotal", "monthlyInvoicesTotal"
  ]);

  if (totalResumo !== null && totalResumo !== undefined && !isNaN(Number(totalResumo))) {
    return Number(totalResumo);
  }

  var somaCartoes = somarFaturasPositivasCartoes(cartoes, invoices);
  if (somaCartoes !== null) {
    return somaCartoes;
  }

  return somarFaturasPositivasInvoices(invoices);
}

function getCardInvoiceDisplay(card, invoices) {
  var valor = getCardInvoiceAmount(card, invoices);

  if (valor === null || valor === undefined || isNaN(Number(valor))) {
    return { rotulo: "Fatura atual", valor: "—", ehCredito: false };
  }

  if (isNegativeNumber(valor)) {
    return {
      rotulo: "Crédito/ajuste",
      valor: formatAbsoluteCurrency(valor),
      ehCredito: true
    };
  }

  return {
    rotulo: "Fatura atual",
    valor: formatCartoesCurrency(valor),
    ehCredito: false
  };
}

function normalizeText(value) {
  return normalizarTextoBusca(value);
}

function coletarTokensCartao(objeto, chaves) {
  var tokens = [];
  var vistos = {};
  var i;
  var valor;
  var normalizado;

  for (i = 0; i < chaves.length; i++) {
    valor = getFirstValue(objeto, [chaves[i]]);
    if (valor === null || valor === undefined || valor === "") {
      continue;
    }
    normalizado = normalizeText(valor);
    if (normalizado && !vistos[normalizado]) {
      vistos[normalizado] = true;
      tokens.push(normalizado);
    }
  }

  return tokens;
}

function getCardLinkageTokens(card) {
  return coletarTokensCartao(card, [
    "id", "name", "cardName", "nome", "label", "institution", "bank", "issuer"
  ]);
}

function getItemPrimaryCardTokens(item) {
  return coletarTokensCartao(item, ["cardId", "card", "cardName", "cartao", "creditCard"]);
}

function getItemSecondaryCardTokens(item) {
  return coletarTokensCartao(item, ["issuer", "institution", "bank", "banco"]);
}

function tokensCoincidem(tokensA, tokensB) {
  var i;
  var j;

  for (i = 0; i < tokensA.length; i++) {
    for (j = 0; j < tokensB.length; j++) {
      if (tokensA[i] === tokensB[j]) {
        return true;
      }
    }
  }

  return false;
}

function itemTemVinculoPrimarioCartao(item) {
  return getItemPrimaryCardTokens(item).length > 0;
}

function isCardFutureInstallment(item) {
  if (!item || item.type === "expectedReceivable") {
    return false;
  }
  if (item.type === "creditCardInstallment") {
    return true;
  }
  return classifyCommitmentType(item) === "Parcelados" && itemTemVinculoPrimarioCartao(item);
}

function isSameCard(card, item) {
  var cardId = getFirstValue(card, ["id"]);
  var itemCardId = getFirstValue(item, ["cardId"]);
  var tokensCartao;
  var tokensItem;

  if (
    cardId !== null && cardId !== undefined &&
    itemCardId !== null && itemCardId !== undefined &&
    normalizeText(cardId) === normalizeText(itemCardId)
  ) {
    return true;
  }

  tokensCartao = getCardLinkageTokens(card);
  tokensItem = getItemPrimaryCardTokens(item);

  if (tokensItem.length > 0 && tokensCoincidem(tokensItem, tokensCartao)) {
    return true;
  }

  if (item.type === "creditCardInstallment") {
    tokensItem = getItemSecondaryCardTokens(item);
    if (tokensItem.length > 0 && tokensCoincidem(tokensItem, tokensCartao)) {
      return true;
    }
  }

  return false;
}

function getFutureItemTitle(item) {
  return getCommitmentTitle(item);
}

function getFutureItemValue(item) {
  return getCommitmentValue(item);
}

function getFutureItemDate(item) {
  return getCommitmentDate(item);
}

function getFutureItemInstallmentInfo(item) {
  var atual = getFirstValue(item, [
    "currentInstallment", "installmentNumber", "parcela", "installment"
  ]);
  var total = getFirstValue(item, [
    "totalInstallments", "installments", "parcelas", "totalParcelas"
  ]);

  if (
    atual !== null && atual !== undefined &&
    total !== null && total !== undefined
  ) {
    return "Parcela " + atual + " de " + total;
  }

  if (atual !== null && atual !== undefined) {
    return "Parcela " + atual;
  }

  return "";
}

function sortLinkedFutureItems(items) {
  return sortCommitmentsByImpact(items);
}

function getLinkedFutureItemsForCard(card, futureCommitments) {
  var vinculados = [];
  var i;
  var item;

  for (i = 0; i < futureCommitments.length; i++) {
    item = futureCommitments[i];
    if (!isCardFutureInstallment(item)) {
      continue;
    }
    if (isSameCard(card, item)) {
      vinculados.push(item);
    }
  }

  return sortLinkedFutureItems(vinculados);
}

function summarizeLinkedFutureItems(items) {
  return {
    count: items.length,
    total: somarValoresCompromissos(items),
    maior: items.length > 0 ? items[0] : null
  };
}

function formatCount(count, singular, plural) {
  if (count === 0) {
    return "0 " + plural;
  }
  if (count === 1) {
    return "1 " + singular;
  }
  return count + " " + plural;
}

function formatLargestFutureItem(item) {
  if (!item) {
    return "Sem parcelas futuras";
  }
  return getFutureItemTitle(item) + " · " + formatCartoesCurrency(getFutureItemValue(item));
}

function summarizeCards(cartoes, invoices, resumoMensal) {
  var limiteTotal = somarValoresListaCartoes(cartoes, getCardLimit);
  var totalUsado = somarValoresListaCartoes(cartoes, getCardUsed);
  var totalDisponivel = somarValoresListaCartoes(cartoes, getCardAvailable);
  var faturasMes = getMonthlyInvoiceTotalForCardsPage(resumoMensal, cartoes, invoices);
  var usoGeral = null;
  var emPressao = 0;
  var i;

  if (limiteTotal !== null && totalUsado !== null && Number(limiteTotal) > 0) {
    usoGeral = (Number(totalUsado) / Number(limiteTotal)) * 100;
  }

  for (i = 0; i < cartoes.length; i++) {
    var pressao = getCardPressure(cartoes[i]);
    if (pressao === "Alta" || pressao === "Crítica") {
      emPressao++;
    }
  }

  return {
    limiteTotal: limiteTotal,
    totalUsado: totalUsado,
    totalDisponivel: totalDisponivel,
    faturasMes: faturasMes,
    usoGeral: usoGeral,
    emPressao: emPressao
  };
}

function renderCartoesKpi(rotulo, valor) {
  return (
    "<div class=\"cartoes__kpi\">" +
      "<span class=\"cartoes__kpi-rotulo\">" + escapeHtml(rotulo) + "</span>" +
      "<span class=\"cartoes__kpi-valor\">" + escapeHtml(valor) + "</span>" +
    "</div>"
  );
}

function renderCartoesUsageBar(percentual, pressao) {
  var numero = normalizeCardUsagePercent(percentual);
  var nivel = getCardPressureClass(pressao);
  var largura = numero === null ? 0 : Math.min(100, Math.max(0, numero));
  var textoUso = formatPercent(percentual);

  return (
    "<div class=\"cartoes-painel__barra\">" +
      "<div class=\"cartoes-painel__barra-trilha\" role=\"img\" aria-label=\"Uso do cartão: " + escapeHtml(textoUso) +
        ", Pressão " + escapeHtml(String(pressao)) + "\">" +
        "<div class=\"cartoes-painel__barra-preenchimento cartoes-painel__barra-preenchimento--" + nivel + "\" style=\"width: " + largura + "%\"></div>" +
      "</div>" +
      "<span class=\"cartoes-painel__barra-valor\">" + escapeHtml(textoUso) + "</span>" +
    "</div>"
  );
}

function renderCartoesPainelMetrica(rotulo, valor, classeExtra) {
  var classe = "cartoes-painel__metrica";
  if (classeExtra) {
    classe += " " + classeExtra;
  }
  return (
    "<div class=\"" + classe + "\">" +
      "<span class=\"cartoes-painel__rotulo\">" + escapeHtml(rotulo) + "</span>" +
      "<span class=\"cartoes-painel__valor\">" + escapeHtml(valor) + "</span>" +
    "</div>"
  );
}

function renderDetalheMetrica(rotulo, valor, classeExtra) {
  var classe = "cartoes-detalhe__metrica";
  if (classeExtra) {
    classe += " " + classeExtra;
  }
  return (
    "<div class=\"" + classe + "\">" +
      "<span class=\"cartoes-detalhe__rotulo\">" + escapeHtml(rotulo) + "</span>" +
      "<span class=\"cartoes-detalhe__valor\">" + escapeHtml(valor) + "</span>" +
    "</div>"
  );
}

function renderLinkedFutureItemRow(item) {
  var titulo = getFutureItemTitle(item);
  var valor = formatCartoesCurrency(getFutureItemValue(item));
  var data = getFutureItemDate(item);
  var parcela = getFutureItemInstallmentInfo(item);
  var metaPartes = [];
  var metaHtml = "";

  if (data && data !== "—") {
    metaPartes.push(data);
  }
  if (parcela) {
    metaPartes.push(parcela);
  }
  if (metaPartes.length > 0) {
    metaHtml = "<span class=\"cartoes-detalhe__item-meta\">" + escapeHtml(metaPartes.join(" · ")) + "</span>";
  }

  return (
    "<li class=\"cartoes-detalhe__item\">" +
      "<span class=\"cartoes-detalhe__item-titulo\">" + escapeHtml(titulo) + "</span>" +
      "<span class=\"cartoes-detalhe__item-valor\">" + escapeHtml(valor) + "</span>" +
      metaHtml +
    "</li>"
  );
}

function formatFutureInstallmentCount(count) {
  if (count === 0) {
    return "Sem parcelas futuras";
  }
  if (count === 1) {
    return "1 parcela futura";
  }
  return count + " parcelas futuras";
}

function renderCardFutureSummary(linkedItems) {
  var resumoFuturo = summarizeLinkedFutureItems(linkedItems);
  var texto = formatFutureInstallmentCount(resumoFuturo.count);

  if (resumoFuturo.count > 0 && resumoFuturo.total !== null) {
    texto += " · " + formatCartoesCurrency(resumoFuturo.total) + "/mês";
  }

  return texto;
}

function renderCardFutureDetails(linkedItems) {
  var resumoFuturo;
  var compromissoTexto;
  var itensTexto;
  var maiorTexto;
  var listaHtml = "";
  var maxExibir = 3;
  var i;

  if (linkedItems.length === 0) {
    return "";
  }

  resumoFuturo = summarizeLinkedFutureItems(linkedItems);
  compromissoTexto = resumoFuturo.total !== null ? formatCartoesCurrency(resumoFuturo.total) : "—";
  itensTexto = formatCount(resumoFuturo.count, "item vinculado", "itens vinculados");
  maiorTexto = formatLargestFutureItem(resumoFuturo.maior);

  listaHtml = "<ul class=\"cartoes-detalhe__lista\">";
  for (i = 0; i < linkedItems.length && i < maxExibir; i++) {
    listaHtml += renderLinkedFutureItemRow(linkedItems[i]);
  }
  if (linkedItems.length > maxExibir) {
    listaHtml +=
      "<li class=\"cartoes-detalhe__item cartoes-detalhe__item--mais\">+" +
      (linkedItems.length - maxExibir) +
      " itens vinculados</li>";
  }
  listaHtml += "</ul>";

  return (
    "<details class=\"cartoes-detalhe card-future-details\">" +
      "<summary class=\"cartoes-detalhe__summary card-future-summary\">Ver parcelas futuras</summary>" +
      "<div class=\"cartoes-detalhe__conteudo\">" +
        "<div class=\"cartoes-detalhe__metricas\">" +
          renderDetalheMetrica("Compromisso mensal futuro", compromissoTexto) +
          renderDetalheMetrica("Itens vinculados", itensTexto) +
          renderDetalheMetrica("Maior item futuro", maiorTexto) +
        "</div>" +
        "<h4 class=\"cartoes-detalhe__subtitulo\">Parcelas principais</h4>" +
        listaHtml +
      "</div>" +
    "</details>"
  );
}

function renderCardFutureBlock(card, futureCommitments) {
  var itensVinculados = getLinkedFutureItemsForCard(card, futureCommitments);

  return (
    "<div class=\"cartoes-parcelas\">" +
      "<p class=\"cartoes-parcelas__resumo\">" + escapeHtml(renderCardFutureSummary(itensVinculados)) + "</p>" +
      renderCardFutureDetails(itensVinculados) +
    "</div>"
  );
}

function renderCreditCardPanel(card, invoices, futureCommitments) {
  var nome = getCardDisplayName(card);
  var instituicao = getCardInstitution(card);
  var pressao = getCardPressure(card);
  var classePressao = getCardPressureClass(pressao);
  var percentual = getCardUsagePercent(card);
  var instituicaoHtml = "";

  if (instituicao) {
    instituicaoHtml = "<p class=\"cartoes-painel__instituicao\">" + escapeHtml(String(instituicao)) + "</p>";
  }

  var faturaExibicao = getCardInvoiceDisplay(card, invoices);
  var classeFatura = faturaExibicao.ehCredito ? "cartoes-painel__metrica--credito" : "";

  return (
    "<article class=\"cartoes-painel cartoes-painel--" + classePressao + "\">" +
      "<header class=\"cartoes-painel__cabecalho\">" +
        "<h3 class=\"cartoes-painel__nome\">" + escapeHtml(nome) + "</h3>" +
        instituicaoHtml +
      "</header>" +
      "<div class=\"cartoes-painel__metricas\">" +
        renderCartoesPainelMetrica("Limite", formatCartoesCurrency(getCardLimit(card))) +
        renderCartoesPainelMetrica("Usado", formatCartoesCurrency(getCardUsed(card))) +
        renderCartoesPainelMetrica("Disponível", formatCartoesCurrency(getCardAvailable(card))) +
        renderCartoesPainelMetrica("Uso", formatPercent(percentual)) +
        renderCartoesPainelMetrica(faturaExibicao.rotulo, faturaExibicao.valor, classeFatura) +
        renderCartoesPainelMetrica("Situação", getCardStatusLabel(card)) +
        renderCartoesPainelMetrica("Pressão", String(pressao)) +
      "</div>" +
      renderCartoesUsageBar(percentual, pressao) +
      "<p class=\"cartoes-painel__acao\">" +
        "<span class=\"cartoes-painel__acao-rotulo\">Ação sugerida:</span> " +
        escapeHtml(getCardRecommendedAction(pressao)) +
      "</p>" +
      renderCardFutureBlock(card, futureCommitments) +
    "</article>"
  );
}

function renderCardsExecutiveSummary(cartoes, invoices) {
  var resumoMensal = getMonthlySummary() || {};
  var resumo = summarizeCards(cartoes, invoices, resumoMensal);
  var textoPressao;

  if (resumo.emPressao === 0) {
    textoPressao = "Nenhum";
  } else if (resumo.emPressao === 1) {
    textoPressao = "1 cartão";
  } else {
    textoPressao = resumo.emPressao + " cartões";
  }

  return (
    "<section class=\"cartoes__resumo\" aria-label=\"Resumo dos cartões\">" +
      "<div class=\"cartoes__resumo-grid\">" +
        renderCartoesKpi("Limite total", formatCartoesCurrency(resumo.limiteTotal)) +
        renderCartoesKpi("Total usado", formatCartoesCurrency(resumo.totalUsado)) +
        renderCartoesKpi("Total disponível", formatCartoesCurrency(resumo.totalDisponivel)) +
        renderCartoesKpi("Faturas do mês", formatCartoesCurrency(resumo.faturasMes)) +
        renderCartoesKpi("Uso geral", formatPercent(resumo.usoGeral)) +
        renderCartoesKpi("Cartões em pressão", textoPressao) +
      "</div>" +
    "</section>"
  );
}

function renderCartoesPage() {
  if (!hasConfirmedImport()) {
    conteudoEl.innerHTML = renderCartoesEmptyState();
    return;
  }

  var cartoes = getCards();
  var invoices = getInvoices();
  var compromissosFuturos = getFutureCommitments();
  var html = renderCardsExecutiveSummary(cartoes, invoices);

  if (cartoes.length === 0) {
    html += "<p class=\"cartoes__vazio\" role=\"status\">Nenhum cartão para exibir.</p>";
  } else {
    html += "<div class=\"cartoes__paineis\">";
    for (var i = 0; i < cartoes.length; i++) {
      html += renderCreditCardPanel(cartoes[i], invoices, compromissosFuturos);
    }
    html += "</div>";
  }

  conteudoEl.innerHTML =
    "<section class=\"secao cartoes\">" +
      "<h2 class=\"secao__titulo\">" +
        "<i class=\"ph ph-credit-card secao__icone\" aria-hidden=\"true\"></i>" +
        "Cartões" +
      "</h2>" +
      html +
    "</section>";
}

/* --- Roteamento --- */

var mensagemConfiguracoes = "";
var tipoMensagemConfiguracoes = "sucesso";

function formatConfiguracoesDataSalva(isoString) {
  var data;
  var dia;
  var mes;
  var ano;
  var hora;
  var minuto;

  if (!isoString) {
    return null;
  }

  try {
    data = new Date(isoString);
    if (isNaN(data.getTime())) {
      return null;
    }

    dia = data.getDate();
    mes = data.getMonth() + 1;
    ano = data.getFullYear();
    hora = data.getHours();
    minuto = data.getMinutes();

    return (
      (dia < 10 ? "0" + dia : String(dia)) + "/" +
      (mes < 10 ? "0" + mes : String(mes)) + "/" +
      ano +
      " às " +
      (hora < 10 ? "0" + hora : String(hora)) + ":" +
      (minuto < 10 ? "0" + minuto : String(minuto))
    );
  } catch (e) {
    return null;
  }
}

function obterPeriodoConfiguracoesLabel() {
  var periodo;
  var meta;

  if (window.CFMarcData && window.CFMarcData.getActivePeriod) {
    periodo = window.CFMarcData.getActivePeriod();
    if (periodo) {
      if (periodo.label) {
        return periodo.label;
      }
      return formatPeriodLabel(periodo.year, periodo.month);
    }
  }

  if (window.CFMarcStorage && window.CFMarcStorage.getStorageMeta) {
    meta = window.CFMarcStorage.getStorageMeta();
    if (meta && meta.activePeriod) {
      return formatPeriodoTexto(meta.activePeriod);
    }
  }

  return null;
}

function renderConfiguracoesStatusHtml(temDadosLocais) {
  var html = "";
  var periodoLabel;
  var dataSalva;
  var meta;
  var htmlDetalhes = "";

  if (temDadosLocais) {
    periodoLabel = obterPeriodoConfiguracoesLabel();
    meta = window.CFMarcStorage.getStorageMeta();
    dataSalva = meta && meta.savedAt ? formatConfiguracoesDataSalva(meta.savedAt) : null;

    if (periodoLabel) {
      htmlDetalhes +=
        "<div class=\"configuracoes__status-item\">" +
          "<p class=\"configuracoes__status-rotulo\">Período ativo</p>" +
          "<p class=\"configuracoes__status-valor\">" + escapeHtml(periodoLabel) + "</p>" +
        "</div>";
    }

    if (dataSalva) {
      htmlDetalhes +=
        "<div class=\"configuracoes__status-item\">" +
          "<p class=\"configuracoes__status-rotulo\">Última atualização</p>" +
          "<p class=\"configuracoes__status-valor\">" + escapeHtml(dataSalva) + "</p>" +
        "</div>";
    }

    html =
      "<div class=\"configuracoes__status configuracoes__status--salvo\">" +
        "<h3 class=\"configuracoes__status-titulo\">Arquivo financeiro salvo</h3>" +
        (htmlDetalhes ? "<div class=\"configuracoes__status-detalhes\">" + htmlDetalhes + "</div>" : "") +
        "<p class=\"configuracoes__status-texto\">Este arquivo está salvo somente neste navegador.</p>" +
        "<a href=\"#/importar\" class=\"btn btn--secundario configuracoes__status-cta\">Atualizar arquivo</a>" +
      "</div>";
  } else {
    html =
      "<div class=\"configuracoes__status configuracoes__status--vazio\">" +
        "<h3 class=\"configuracoes__status-titulo\">Nenhum arquivo salvo</h3>" +
        "<p class=\"configuracoes__status-texto\">Importe um arquivo financeiro para manter os dados disponíveis após atualizar a página.</p>" +
        "<a href=\"#/importar\" class=\"btn btn--secundario configuracoes__status-cta\">Importar arquivo</a>" +
      "</div>";
  }

  return html;
}

function restaurarDadosLocais() {
  var payload;

  if (!window.CFMarcStorage) {
    return;
  }

  payload = window.CFMarcStorage.loadImportedData();
  if (!payload || !payload.importedData) {
    return;
  }

  window.appState.importedData = payload.importedData;
  window.appState.importConfirmed = true;
  window.appState.importedAt = payload.meta && payload.meta.savedAt
    ? payload.meta.savedAt
    : new Date().toISOString();
}

function obterNomeArquivoBackup() {
  var agora = new Date();
  var ano = agora.getFullYear();
  var mes = agora.getMonth() + 1;
  var dia = agora.getDate();

  return (
    "cfmarc-backup-" +
    ano + "-" +
    (mes < 10 ? "0" + mes : String(mes)) + "-" +
    (dia < 10 ? "0" + dia : String(dia)) +
    ".json"
  );
}

function exportarBackupLocal() {
  var payload;
  var jsonTexto;
  var blob;
  var url;
  var link;

  if (!window.CFMarcStorage || !window.CFMarcStorage.hasLocalData()) {
    tipoMensagemConfiguracoes = "erro";
    mensagemConfiguracoes = "Não foi possível exportar o backup.";
    renderConfiguracoesPage();
    return;
  }

  try {
    payload = window.CFMarcStorage.loadImportedData();
    if (!payload || !payload.importedData) {
      tipoMensagemConfiguracoes = "erro";
      mensagemConfiguracoes = "Não foi possível exportar o backup.";
      renderConfiguracoesPage();
      return;
    }

    jsonTexto = JSON.stringify(payload.importedData, null, 2);
    blob = new Blob([jsonTexto], { type: "application/json" });
    url = URL.createObjectURL(blob);
    link = document.createElement("a");
    link.href = url;
    link.download = obterNomeArquivoBackup();
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    tipoMensagemConfiguracoes = "sucesso";
    mensagemConfiguracoes = "Backup exportado.";
    renderConfiguracoesPage();
  } catch (e) {
    tipoMensagemConfiguracoes = "erro";
    mensagemConfiguracoes = "Não foi possível exportar o backup.";
    renderConfiguracoesPage();
  }
}

function renderConfiguracoesPage() {
  var secao = SECOES.configuracoes;
  var htmlFeedback = "";
  var htmlBackup = "";
  var temDadosLocais = window.CFMarcStorage && window.CFMarcStorage.hasLocalData();
  var htmlStatus = renderConfiguracoesStatusHtml(temDadosLocais);
  var textoLimpar = temDadosLocais
    ? "Remove o arquivo salvo neste navegador."
    : "Não há arquivo salvo neste navegador para remover.";
  var atributoBotaoLimpar = temDadosLocais ? "" : " disabled";
  var classeFeedback = tipoMensagemConfiguracoes === "erro"
    ? "configuracoes__erro"
    : "configuracoes__sucesso";
  var iconeFeedback = tipoMensagemConfiguracoes === "erro"
    ? "ph-warning-circle"
    : "ph-check-circle";

  if (mensagemConfiguracoes) {
    htmlFeedback =
      "<div class=\"" + classeFeedback + "\" role=\"status\">" +
        "<i class=\"ph " + iconeFeedback + "\" aria-hidden=\"true\"></i>" +
        "<span>" + escapeHtml(mensagemConfiguracoes) + "</span>" +
      "</div>";
  }

  if (temDadosLocais) {
    htmlBackup =
      "<div class=\"configuracoes__backup\">" +
        "<p class=\"configuracoes__dados-texto\">Baixe uma cópia do arquivo salvo neste navegador.</p>" +
        "<button type=\"button\" class=\"btn btn--secundario configuracoes__btn-exportar\" id=\"btn-exportar-backup\">Exportar backup</button>" +
      "</div>";
  }

  conteudoEl.innerHTML =
    "<section class=\"secao configuracoes\">" +
      "<h2 class=\"secao__titulo\">" +
        "<i class=\"ph " + secao.icone + " secao__icone\" aria-hidden=\"true\"></i>" +
        secao.titulo +
      "</h2>" +
      "<p class=\"secao__texto\">" + secao.texto + "</p>" +
      htmlFeedback +
      htmlStatus +
      htmlBackup +
      "<div class=\"configuracoes__dados-locais" + (temDadosLocais ? "" : " configuracoes__dados-locais--inativo") + "\">" +
        "<p class=\"configuracoes__dados-texto\">" + escapeHtml(textoLimpar) + "</p>" +
        "<button type=\"button\" class=\"btn btn--secundario configuracoes__btn-limpar\" id=\"btn-limpar-dados-locais\"" + atributoBotaoLimpar + ">Limpar dados locais</button>" +
      "</div>" +
    "</section>";

  vincularEventosConfiguracoes();
}

function limparDadosLocais() {
  if (window.CFMarcStorage) {
    window.CFMarcStorage.clearImportedData();
  }

  window.appState.importedData = null;
  window.appState.importConfirmed = false;
  window.appState.importedAt = null;
  tipoMensagemConfiguracoes = "sucesso";
  mensagemConfiguracoes = "Dados locais removidos.";

  atualizarNavImportar();
  renderConfiguracoesPage();
}

function vincularEventosConfiguracoes() {
  var btnLimpar = document.getElementById("btn-limpar-dados-locais");
  var btnExportar = document.getElementById("btn-exportar-backup");

  if (btnLimpar) {
    btnLimpar.addEventListener("click", limparDadosLocais);
  }

  if (btnExportar) {
    btnExportar.addEventListener("click", exportarBackupLocal);
  }
}

function renderizarSecao(rota) {
  var secao = SECOES[rota];
  conteudoEl.innerHTML =
    "<section class=\"secao\">" +
      "<h2 class=\"secao__titulo\">" +
        "<i class=\"ph " + secao.icone + " secao__icone\" aria-hidden=\"true\"></i>" +
        secao.titulo +
      "</h2>" +
      "<p class=\"secao__texto\">" + secao.texto + "</p>" +
    "</section>";
}

function atualizarNavImportar() {
  var linkImportar = document.querySelector('.nav__link[data-route="importar"]');
  if (!linkImportar) {
    return;
  }

  var icone = linkImportar.querySelector(".nav__icone");
  var rotulo = linkImportar.querySelector(".nav__rotulo");
  var confirmado = hasConfirmedImport();

  if (confirmado) {
    if (icone) {
      icone.className = "ph ph-arrows-clockwise nav__icone";
    }
    if (rotulo) {
      rotulo.textContent = "Atualizar";
    }
    linkImportar.setAttribute("aria-label", "Atualizar arquivo financeiro");
  } else {
    if (icone) {
      icone.className = "ph ph-plus-circle nav__icone";
    }
    if (rotulo) {
      rotulo.textContent = "Importar";
    }
    linkImportar.setAttribute("aria-label", "Importar arquivo financeiro");
  }
}

function atualizarMenuAtivo(rota) {
  for (var i = 0; i < linksNav.length; i++) {
    var link = linksNav[i];
    if (link.getAttribute("data-route") === rota) {
      link.classList.add("nav__link--ativo");
    } else {
      link.classList.remove("nav__link--ativo");
    }
  }

  atualizarNavImportar();
}

function navegar() {
  var rota = obterRotaAtual();

  if (rota === "inicio" || !rotaEhValida(rota)) {
    redirecionarParaPadrao();
    return;
  }

  if (rota === "importar") {
    renderImportarPage();
  } else if (rota === "dashboard") {
    renderDashboardPage();
  } else if (rota === "balanco") {
    renderBalancoPage();
  } else if (rota === "cartoes") {
    renderCartoesPage();
  } else if (rota === "configuracoes") {
    renderConfiguracoesPage();
  } else {
    renderizarSecao(rota);
  }

  if (rota !== "configuracoes") {
    mensagemConfiguracoes = "";
    tipoMensagemConfiguracoes = "sucesso";
  }

  atualizarMenuAtivo(rota);
}

/* --- Importação JSON --- */

function parseJsonContent(conteudo) {
  try {
    var dados = JSON.parse(conteudo);
    if (typeof dados !== "object" || dados === null) {
      return { ok: false, error: ERRO_JSON_INVALIDO };
    }
    return { ok: true, data: dados };
  } catch (e) {
    return { ok: false, error: ERRO_JSON_INVALIDO };
  }
}

function periodoEhImportavelAtivo(periodo) {
  var status = String(periodo.status || "").toLowerCase();
  return status === "active" || status === "current" || status === "importable";
}

function findActiveImportPeriod(periodos) {
  var encontrados = [];

  if (!Array.isArray(periodos)) {
    return encontrados;
  }

  for (var i = 0; i < periodos.length; i++) {
    if (periodoEhImportavelAtivo(periodos[i])) {
      encontrados.push(periodos[i]);
    }
  }

  return encontrados;
}

var CFMARC_STORAGE_KEY = "cfmarc:importedData:v1";

function obterPeriodoAtivoIdParaStorage(dados) {
  var ativos;
  var periodo;

  if (!dados || !Array.isArray(dados.periods)) {
    return null;
  }

  ativos = findActiveImportPeriod(dados.periods);
  if (ativos.length !== 1) {
    return null;
  }

  periodo = ativos[0];
  if (periodo.id) {
    return String(periodo.id);
  }

  if (periodo.year && periodo.month) {
    var mes = String(periodo.month);
    if (mes.length === 1) {
      mes = "0" + mes;
    }
    return String(periodo.year) + "-" + mes;
  }

  return null;
}

window.CFMarcStorage = {
  saveImportedData: function (data) {
    var payload;

    if (!data) {
      return false;
    }

    try {
      payload = {
        importedData: data,
        meta: {
          schema: data.schema || null,
          savedAt: new Date().toISOString(),
          source: "localStorage",
          activePeriod: obterPeriodoAtivoIdParaStorage(data)
        }
      };
      localStorage.setItem(CFMARC_STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      return false;
    }
  },

  loadImportedData: function () {
    var raw;
    var payload;

    try {
      raw = localStorage.getItem(CFMARC_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      payload = JSON.parse(raw);
      if (!payload || !payload.importedData) {
        localStorage.removeItem(CFMARC_STORAGE_KEY);
        return null;
      }

      return payload;
    } catch (e) {
      try {
        localStorage.removeItem(CFMARC_STORAGE_KEY);
      } catch (err) {
        /* ignora falha ao limpar chave corrompida */
      }
      return null;
    }
  },

  clearImportedData: function () {
    try {
      localStorage.removeItem(CFMARC_STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  },

  hasLocalData: function () {
    try {
      return window.CFMarcStorage.loadImportedData() !== null;
    } catch (e) {
      return false;
    }
  },

  getStorageMeta: function () {
    var payload;

    try {
      payload = window.CFMarcStorage.loadImportedData();
      if (!payload || !payload.meta) {
        return null;
      }
      return payload.meta;
    } catch (e) {
      return null;
    }
  }
};

function periodoEhJunho2026(periodo) {
  if (!periodo) {
    return false;
  }

  if (periodo.year !== 2026 || periodo.month !== 6) {
    return false;
  }

  if (periodo.id && periodo.id !== "2026-06") {
    return false;
  }

  return true;
}

function validateCfmarcMvpImport(dados) {
  if (!dados || typeof dados !== "object") {
    return { ok: false, error: ERRO_ARQUIVO_OFICIAL };
  }

  if (dados.app !== "CFMarc" || dados.schema !== "cfmarc-basic-import-v1" || dados.currency !== "BRL") {
    return { ok: false, error: ERRO_ARQUIVO_OFICIAL };
  }

  if (!dados.importPolicy || !dados.importPolicy.projectionStartPeriod) {
    return { ok: false, error: ERRO_ARQUIVO_OFICIAL };
  }

  if (!Array.isArray(dados.futureCommitments)) {
    return { ok: false, error: ERRO_ARQUIVO_OFICIAL };
  }

  if (!Array.isArray(dados.periods)) {
    return { ok: false, error: ERRO_PERIODO_JUNHO };
  }

  var periodosAtivos = findActiveImportPeriod(dados.periods);

  if (periodosAtivos.length !== 1 || !periodoEhJunho2026(periodosAtivos[0])) {
    return { ok: false, error: ERRO_PERIODO_JUNHO };
  }

  var periodoAtivo = periodosAtivos[0];

  if (!periodoAtivo.monthlySummary) {
    return { ok: false, error: ERRO_PERIODO_JUNHO };
  }

  return { ok: true, periodoAtivo: periodoAtivo };
}

function obterValorResumo(resumo, chaves) {
  for (var i = 0; i < chaves.length; i++) {
    if (resumo[chaves[i]] !== undefined && resumo[chaves[i]] !== null) {
      return resumo[chaves[i]];
    }
  }
  return null;
}

function somarMonthlyAmount(itens) {
  var total = 0;
  var temValor = false;

  for (var i = 0; i < itens.length; i++) {
    if (itens[i].monthlyAmount !== undefined && itens[i].monthlyAmount !== null) {
      total += Number(itens[i].monthlyAmount);
      temValor = true;
    }
  }

  return temValor ? total : null;
}

function obterRotuloTipoCompromisso(tipo) {
  var mapa = {
    creditCardInstallment: "Parcelas futuras",
    financing: "Compromissos fixos",
    recurringFixedExpense: "Compromissos fixos",
    expectedReceivable: "Recebíveis previstos"
  };
  return mapa[tipo] || "Outros compromissos";
}

function agruparCompromissosPreviaImportacao(compromissos) {
  var grupos = {};
  var lista = compromissos || [];

  for (var i = 0; i < lista.length; i++) {
    var item = lista[i];
    if (item.type === "expectedReceivable") {
      continue;
    }

    var tipoRotulo = obterRotuloTipoCompromisso(item.type);
    var cartaoRotulo = item.cardName ? "Cartão: " + item.cardName : "Sem cartão vinculado";
    var chave = tipoRotulo + "|" + cartaoRotulo;

    if (!grupos[chave]) {
      grupos[chave] = {
        tipoRotulo: tipoRotulo,
        cartaoRotulo: cartaoRotulo,
        itens: []
      };
    }

    grupos[chave].itens.push(item);
  }

  var resultado = [];
  for (var chaveGrupo in grupos) {
    if (Object.prototype.hasOwnProperty.call(grupos, chaveGrupo)) {
      var grupo = grupos[chaveGrupo];
      var primeiro = grupo.itens[0];
      var ultimo = grupo.itens[grupo.itens.length - 1];
      resultado.push({
        tipoRotulo: grupo.tipoRotulo,
        cartaoRotulo: grupo.cartaoRotulo,
        quantidade: grupo.itens.length,
        valorTotal: somarMonthlyAmount(grupo.itens),
        periodoInicio: primeiro.firstPeriod ? formatPeriodoTexto(primeiro.firstPeriod) : null,
        periodoFim: ultimo.lastPeriod ? formatPeriodoTexto(ultimo.lastPeriod) : "Em aberto"
      });
    }
  }

  return resultado;
}

function coletarRecebiveis(dados, periodoAtivo) {
  var lista = [];

  if (periodoAtivo && Array.isArray(periodoAtivo.receivables)) {
    for (var i = 0; i < periodoAtivo.receivables.length; i++) {
      var rec = periodoAtivo.receivables[i];
      lista.push({
        descricao: rec.description || "Recebível",
        origem: rec.from || rec.counterparty || null,
        valor: rec.amount,
        dataPrevista: rec.expectedDate || rec.dueDate || null,
        situacao: rec.status === "open" ? "Em aberto" : rec.status || "—"
      });
    }
  }

  if (Array.isArray(dados.futureCommitments)) {
    for (var j = 0; j < dados.futureCommitments.length; j++) {
      var comp = dados.futureCommitments[j];
      if (comp.type !== "expectedReceivable") {
        continue;
      }
      lista.push({
        descricao: comp.description || "Recebível previsto",
        origem: comp.counterparty || null,
        valor: comp.monthlyAmount,
        dataPrevista: comp.firstPeriod || null,
        situacao: comp.status === "open" ? "Em aberto" : comp.status || "—"
      });
    }
  }

  return lista;
}

function coletarAlertas(dados, periodoAtivo) {
  var alertas = [];

  if (periodoAtivo && Array.isArray(periodoAtivo.alerts)) {
    for (var i = 0; i < periodoAtivo.alerts.length; i++) {
      var alerta = periodoAtivo.alerts[i];
      alertas.push({
        nivel: traduzirNivelAlerta(alerta.level),
        texto: alerta.description || "Alerta identificado.",
        valor: alerta.amount
      });
    }
  }

  if (dados.validation && Array.isArray(dados.validation.warnings)) {
    for (var w = 0; w < dados.validation.warnings.length; w++) {
      alertas.push({
        nivel: "Aviso",
        texto: dados.validation.warnings[w],
        valor: null
      });
    }
  }

  return alertas;
}

function coletarChecklist(dados, periodoAtivo) {
  if (periodoAtivo && Array.isArray(periodoAtivo.checklist) && periodoAtivo.checklist.length > 0) {
    var itens = [];
    for (var i = 0; i < periodoAtivo.checklist.length; i++) {
      var item = periodoAtivo.checklist[i];
      itens.push({
        texto: item.description || "Item da conferência",
        status: traduzirStatusChecklist(item.status),
        valor: item.amount
      });
    }
    return itens;
  }

  return [
    { texto: "Arquivo CFMarc reconhecido", status: "Concluído", valor: null },
    { texto: "Período Junho/2026 identificado", status: "Concluído", valor: null },
    { texto: "Moeda BRL confirmada", status: "Concluído", valor: null },
    { texto: "Resumo mensal disponível", status: "Concluído", valor: null },
    { texto: "Compromissos futuros disponíveis", status: dados.futureCommitments.length > 0 ? "Concluído" : "Pendente", valor: null },
    { texto: "Pronto para confirmação", status: "Pendente", valor: null }
  ];
}

function buildImportPreview(dados, nomeArquivo, periodoAtivo) {
  var resumo = periodoAtivo.monthlySummary;
  var compromissosResumo = agruparCompromissosPreviaImportacao(dados.futureCommitments);

  return {
    nomeArquivo: nomeArquivo,
    periodoBase: formatPeriodLabel(periodoAtivo.year, periodoAtivo.month),
    moeda: "Real brasileiro (BRL)",
    statusGeral: "Pronto para conferência",
    resumoFinanceiro: {
      saldoAtual: obterValorResumo(resumo, ["currentCashConfirmed"]),
      saldoAposDebitos: obterValorResumo(resumo, ["projectedCashAfterScheduledDebits"]),
      saldoAposRecebiveis: obterValorResumo(resumo, ["projectedCashAfterLuiza", "projectedCashAfterReceivables"]),
      receitas: obterValorResumo(resumo, ["operationalIncomeTotal", "grossIncomeTotal"]),
      despesas: obterValorResumo(resumo, ["postedOperationalExpenseTotal", "postedGrossExpenseTotal"]),
      faturas: obterValorResumo(resumo, ["closedInvoicesTotal"]),
      cartoes: Array.isArray(periodoAtivo.cards) ? periodoAtivo.cards.length : null,
      compromissosFuturos: dados.futureCommitments.length,
      recebiveis: obterValorResumo(resumo, ["receivablesOpenTotal"])
    },
    receitasDespesas: {
      receitas: obterValorResumo(resumo, ["operationalIncomeTotal", "grossIncomeTotal"]),
      despesas: obterValorResumo(resumo, ["postedOperationalExpenseTotal", "postedGrossExpenseTotal"]),
      faturas: obterValorResumo(resumo, ["closedInvoicesTotal"]),
      recebiveis: obterValorResumo(resumo, ["receivablesOpenTotal"]),
      saldoAtual: obterValorResumo(resumo, ["currentCashConfirmed"]),
      saldoPrevisto: obterValorResumo(resumo, ["projectedCashAfterLuiza", "projectedCashAfterReceivables"])
    },
    cartoes: periodoAtivo.cards || [],
    compromissos: compromissosResumo,
    recebiveis: coletarRecebiveis(dados, periodoAtivo),
    alertas: coletarAlertas(dados, periodoAtivo),
    checklist: coletarChecklist(dados, periodoAtivo)
  };
}

/* --- Renderização da prévia --- */

function renderCardResumo(rotulo, valor, ehNumero) {
  var valorExibido = ehNumero ? String(valor) : formatCurrency(valor);
  if (valor === null || valor === undefined) {
    valorExibido = "Não informado";
  }
  return (
    "<div class=\"preview__card-resumo\">" +
      "<span class=\"preview__card-resumo-rotulo\">" + escapeHtml(rotulo) + "</span>" +
      "<span class=\"preview__card-resumo-valor\">" + escapeHtml(valorExibido) + "</span>" +
    "</div>"
  );
}

function renderCardsPreview(cartoes) {
  if (!cartoes || cartoes.length === 0) {
    return "<p class=\"preview__texto\">Nenhum cartão</p>";
  }

  var html = "<div class=\"preview__cartoes-grid\">";
  for (var i = 0; i < cartoes.length; i++) {
    var cartao = cartoes[i];
    html +=
      "<article class=\"cartao-item\">" +
        "<h4 class=\"cartao-item__nome\">" + escapeHtml(cartao.name || "Cartão") + "</h4>" +
        (cartao.institution ? "<p class=\"cartao-item__instituicao\">" + escapeHtml(cartao.institution) + "</p>" : "") +
        "<dl class=\"cartao-item__lista\">" +
          "<div><dt>Limite</dt><dd>" + escapeHtml(formatCurrency(cartao.limit)) + "</dd></div>" +
          "<div><dt>Usado</dt><dd>" + escapeHtml(formatCurrency(cartao.usedLimit)) + "</dd></div>" +
          "<div><dt>Disponível</dt><dd>" + escapeHtml(formatCurrency(cartao.availableLimit)) + "</dd></div>" +
          "<div><dt>Uso</dt><dd>" + escapeHtml(formatPercentualUso(cartao.usedLimit, cartao.limit)) + "</dd></div>" +
          "<div><dt>Fatura atual</dt><dd>" + escapeHtml(formatCurrency(cartao.closedInvoiceAmount)) + "</dd></div>" +
          "<div><dt>Situação</dt><dd>" + escapeHtml(traduzirSituacaoCartao(cartao.status)) + "</dd></div>" +
        "</dl>" +
      "</article>";
  }
  html += "</div>";
  return html;
}

function renderPreviewHtml(preview) {
  var rf = preview.resumoFinanceiro;
  var rd = preview.receitasDespesas;

  var html =
    "<div class=\"preview\" role=\"region\" aria-label=\"Conferência do arquivo\">" +

      "<div class=\"preview__secao\">" +
        "<h3 class=\"preview__secao-titulo\">Arquivo reconhecido</h3>" +
        "<dl class=\"preview__resumo-lista\">" +
          "<div><dt>Nome do arquivo</dt><dd>" + escapeHtml(preview.nomeArquivo) + "</dd></div>" +
          "<div><dt>Período base</dt><dd>" + escapeHtml(preview.periodoBase) + "</dd></div>" +
          "<div><dt>Moeda</dt><dd>" + escapeHtml(preview.moeda) + "</dd></div>" +
          "<div><dt>Status</dt><dd>" + escapeHtml(preview.statusGeral) + "</dd></div>" +
        "</dl>" +
      "</div>" +

      "<div class=\"preview__secao\">" +
        "<h3 class=\"preview__secao-titulo\">Resumo financeiro</h3>" +
        "<div class=\"preview__cards-resumo-grid\">" +
          renderCardResumo("Saldo atual", rf.saldoAtual, false) +
          renderCardResumo("Saldo após débitos", rf.saldoAposDebitos, false) +
          renderCardResumo("Saldo após recebíveis", rf.saldoAposRecebiveis, false) +
          renderCardResumo("Receitas", rf.receitas, false) +
          renderCardResumo("Despesas", rf.despesas, false) +
          renderCardResumo("Faturas", rf.faturas, false) +
          renderCardResumo("Cartões", rf.cartoes, true) +
          renderCardResumo("Compromissos futuros", rf.compromissosFuturos, true) +
          renderCardResumo("Recebíveis", rf.recebiveis, false) +
        "</div>" +
      "</div>" +

      "<div class=\"preview__secao preview__explicacao\">" +
        "<h3 class=\"preview__secao-titulo\">O que será aplicado</h3>" +
        "<ul class=\"preview__lista\">" +
          "<li>Junho/2026 entra como mês atual.</li>" +
          "<li>Itens atuais não substituem registros existentes sem conferência.</li>" +
          "<li>Projeções futuras podem substituir projeções equivalentes.</li>" +
          "<li>Meses anteriores não entram nesta importação.</li>" +
        "</ul>" +
      "</div>" +

      "<div class=\"preview__secao\">" +
        "<h3 class=\"preview__secao-titulo\">Receitas e despesas</h3>" +
        "<div class=\"preview__cards-resumo-grid\">" +
          renderCardResumo("Total de receitas", rd.receitas, false) +
          renderCardResumo("Total de despesas", rd.despesas, false) +
          renderCardResumo("Total de faturas", rd.faturas, false) +
          renderCardResumo("Total de recebíveis", rd.recebiveis, false) +
          renderCardResumo("Saldo atual", rd.saldoAtual, false) +
          renderCardResumo("Saldo previsto após recebíveis", rd.saldoPrevisto, false) +
        "</div>" +
      "</div>" +

      "<div class=\"preview__secao\">" +
        "<h3 class=\"preview__secao-titulo\">Cartões</h3>" +
        renderCardsPreview(preview.cartoes) +
      "</div>" +

      "<div class=\"preview__secao\">" +
        "<h3 class=\"preview__secao-titulo\">Compromissos futuros</h3>";

  if (preview.compromissos.length === 0) {
    html += "<p class=\"preview__texto\">Nenhum compromisso futuro</p>";
  } else {
    html += "<div class=\"preview__compromissos-grid\">";
    for (var c = 0; c < preview.compromissos.length; c++) {
      var comp = preview.compromissos[c];
      var periodoTexto = comp.periodoInicio || "—";
      if (comp.periodoFim) {
        periodoTexto += " até " + comp.periodoFim;
      }
      html +=
        "<article class=\"preview__compromisso-card\">" +
          "<h4 class=\"preview__compromisso-titulo\">" + escapeHtml(comp.tipoRotulo) + "</h4>" +
          "<p class=\"preview__compromisso-sub\">" + escapeHtml(comp.cartaoRotulo) + "</p>" +
          "<p class=\"preview__compromisso-info\">" + escapeHtml(formatCount(comp.quantidade, "compromisso", "compromissos")) + "</p>" +
          "<p class=\"preview__compromisso-info\">Valor mensal total: <strong>" + escapeHtml(formatCurrency(comp.valorTotal)) + "</strong></p>" +
          "<p class=\"preview__compromisso-info\">Período: " + escapeHtml(periodoTexto) + "</p>" +
        "</article>";
    }
    html += "</div>";
  }

  html +=
      "</div>" +

      "<div class=\"preview__secao\">" +
        "<h3 class=\"preview__secao-titulo\">Recebíveis</h3>";

  if (preview.recebiveis.length === 0) {
    html += "<p class=\"preview__texto\">Nenhum recebível</p>";
  } else {
    html += "<div class=\"preview__recebiveis-lista\">";
    for (var r = 0; r < preview.recebiveis.length; r++) {
      var rec = preview.recebiveis[r];
      html +=
        "<article class=\"preview__recebivel-card\">" +
          "<h4 class=\"preview__recebivel-titulo\">" + escapeHtml(rec.descricao) + "</h4>" +
          (rec.origem ? "<p class=\"preview__recebivel-info\">Origem: " + escapeHtml(rec.origem) + "</p>" : "") +
          "<p class=\"preview__recebivel-info\">Valor: <strong>" + escapeHtml(formatCurrency(rec.valor)) + "</strong></p>" +
          "<p class=\"preview__recebivel-info\">Data prevista: " + escapeHtml(formatDataOuPeriodo(rec.dataPrevista)) + "</p>" +
          "<p class=\"preview__recebivel-info\">Situação: " + escapeHtml(rec.situacao) + "</p>" +
        "</article>";
    }
    html += "</div>";
  }

  html +=
      "</div>" +

      "<div class=\"preview__secao\">" +
        "<h3 class=\"preview__secao-titulo\">Alertas</h3>";

  if (preview.alertas.length === 0) {
    html += "<p class=\"preview__texto\">Nenhum alerta</p>";
  } else {
    html += "<div class=\"preview__alertas-grid\">";
    for (var a = 0; a < preview.alertas.length; a++) {
      var al = preview.alertas[a];
      html +=
        "<article class=\"preview__alerta-card preview__alerta-card--" + escapeHtml(String(al.nivel).toLowerCase().replace(/\s/g, "")) + "\">" +
          "<span class=\"preview__alerta-nivel\">" + escapeHtml(al.nivel) + "</span>" +
          "<p class=\"preview__alerta-texto\">" + escapeHtml(al.texto) + "</p>" +
          (al.valor !== null && al.valor !== undefined ? "<p class=\"preview__alerta-valor\">" + escapeHtml(formatCurrency(al.valor)) + "</p>" : "") +
        "</article>";
    }
    html += "</div>";
  }

  html +=
      "</div>" +

      "<div class=\"preview__secao\">" +
        "<h3 class=\"preview__secao-titulo\">Checklist</h3>" +
        "<ul class=\"preview__checklist\">";

  for (var k = 0; k < preview.checklist.length; k++) {
    var chk = preview.checklist[k];
    html +=
      "<li class=\"preview__checklist-item preview__checklist-item--" + (chk.status === "Concluído" ? "ok" : "pendente") + "\">" +
        "<span class=\"preview__checklist-status\">" + escapeHtml(chk.status) + "</span>" +
        "<span class=\"preview__checklist-texto\">" + escapeHtml(chk.texto) + "</span>" +
        (chk.valor !== null && chk.valor !== undefined ? "<span class=\"preview__checklist-valor\">" + escapeHtml(formatCurrency(chk.valor)) + "</span>" : "") +
      "</li>";
  }

  html +=
        "</ul>" +
      "</div>" +

      "<div class=\"importar__acoes\">" +
        "<button type=\"button\" class=\"btn btn--secundario\" id=\"btn-cancelar-import\">Cancelar</button>" +
        "<button type=\"button\" class=\"btn btn--primario\" id=\"btn-confirmar-import\">Confirmar importação</button>" +
      "</div>" +
    "</div>";

  return html;
}

/* --- Fluxo de importação --- */

function readSelectedJsonFile(arquivo, aoConcluir) {
  var leitor = new FileReader();

  leitor.onload = function (e) {
    aoConcluir(null, e.target.result);
  };

  leitor.onerror = function () {
    aoConcluir(ERRO_JSON_INVALIDO, null);
  };

  leitor.readAsText(arquivo);
}

function handleJsonFileSelection(evento) {
  var arquivo = evento.target.files[0];
  var sessao = obterSessaoImportacao();

  sessao.error = null;
  sessao.success = null;

  if (!arquivo) {
    renderImportarPage();
    return;
  }

  sessao.fileName = arquivo.name;

  readSelectedJsonFile(arquivo, function (erroLeitura, conteudo) {
    if (erroLeitura) {
      sessao.error = erroLeitura;
      sessao.parsedData = null;
      sessao.preview = null;
      renderImportarPage();
      return;
    }

    var resultadoParse = parseJsonContent(conteudo);
    if (!resultadoParse.ok) {
      sessao.error = resultadoParse.error;
      sessao.parsedData = null;
      sessao.preview = null;
      renderImportarPage();
      return;
    }

    var resultadoValidacao = validateCfmarcMvpImport(resultadoParse.data);
    if (!resultadoValidacao.ok) {
      sessao.error = resultadoValidacao.error;
      sessao.parsedData = null;
      sessao.preview = null;
      renderImportarPage();
      return;
    }

    sessao.parsedData = resultadoParse.data;
    sessao.preview = buildImportPreview(
      resultadoParse.data,
      arquivo.name,
      resultadoValidacao.periodoAtivo
    );
    renderImportarPage();
  });
}

function cancelImport() {
  window.appState.importSession = criarSessaoImportacao();
  renderImportarPage();
}

function confirmImport() {
  var sessao = obterSessaoImportacao();

  if (!sessao.parsedData) {
    return;
  }

  window.appState.importedData = sessao.parsedData;
  window.appState.importConfirmed = true;
  window.appState.importedAt = new Date().toISOString();
  sessao.success = "Arquivo pronto para uso.";
  sessao.preview = null;
  sessao.parsedData = null;
  sessao.error = null;

  if (window.CFMarcStorage) {
    window.CFMarcStorage.saveImportedData(window.appState.importedData);
  }

  renderImportarPage();
  atualizarNavImportar();
}

function vincularEventosImportar() {
  var inputArquivo = document.getElementById("input-json");
  var btnCancelar = document.getElementById("btn-cancelar-import");
  var btnConfirmar = document.getElementById("btn-confirmar-import");

  if (inputArquivo) {
    inputArquivo.addEventListener("change", handleJsonFileSelection);
  }

  if (btnCancelar) {
    btnCancelar.addEventListener("click", cancelImport);
  }

  if (btnConfirmar) {
    btnConfirmar.addEventListener("click", confirmImport);
  }
}

function renderImportarPage() {
  var sessao = obterSessaoImportacao();
  var htmlConfirmado = "";

  if (window.appState.importConfirmed && sessao.success) {
    htmlConfirmado =
      "<div class=\"importar__sucesso\" role=\"status\">" +
        "<i class=\"ph ph-check-circle\" aria-hidden=\"true\"></i>" +
        "<span>" + escapeHtml(sessao.success) + "</span>" +
      "</div>";
  }

  var htmlErro = "";
  if (sessao.error) {
    htmlErro =
      "<div class=\"importar__erro\" role=\"alert\">" +
        "<i class=\"ph ph-warning-circle\" aria-hidden=\"true\"></i>" +
        "<span>" + escapeHtml(sessao.error) + "</span>" +
      "</div>";
  }

  var htmlPreview = "";
  if (sessao.preview && sessao.parsedData) {
    htmlPreview = renderPreviewHtml(sessao.preview);
  }

  var confirmado = hasConfirmedImport();
  var tituloPagina = confirmado ? "Atualizar" : "Importar";
  var iconeTitulo = confirmado ? "ph-arrows-clockwise" : "ph-plus-circle";
  var ariaLabelPagina = confirmado ? "Atualizar arquivo financeiro" : "Importar arquivo financeiro";

  conteudoEl.innerHTML =
    "<section class=\"importar\" aria-label=\"" + escapeHtml(ariaLabelPagina) + "\">" +
      "<h2 class=\"secao__titulo\">" +
        "<i class=\"ph " + iconeTitulo + " secao__icone\" aria-hidden=\"true\"></i>" +
        escapeHtml(tituloPagina) +
      "</h2>" +
      "<p class=\"importar__instrucoes\">" +
        "Selecione o arquivo financeiro do CFMarc. " +
        "O arquivo é lido somente no seu navegador." +
      "</p>" +
      htmlConfirmado +
      "<div class=\"importar__campo\">" +
        "<label class=\"importar__label\" for=\"input-json\">Arquivo financeiro</label>" +
        "<input type=\"file\" id=\"input-json\" class=\"importar__input\" accept=\".json,application/json\">" +
      "</div>" +
      htmlErro +
      htmlPreview +
    "</section>";

  vincularEventosImportar();
  atualizarNavImportar();
}

function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register("./sw.js").then(function (registro) {
    console.log("CFMarc: Service Worker registrado.");
    if (registro && registro.update) {
      registro.update().catch(function () {
        /* atualização opcional falhou — app continua */
      });
    }
  }).catch(function () {
    console.log("CFMarc: Service Worker não registrado.");
  });
}

function iniciarApp() {
  restaurarDadosLocais();
  navegar();
  registrarServiceWorker();
}

window.addEventListener("hashchange", navegar);
window.addEventListener("DOMContentLoaded", iniciarApp);

/* --- QA interno (console) — Service Worker --- */

var CFMARC_SHELL_CACHE_QA = "cfmarc-app-shell-v3";

function cfmarcQaEsperar(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function cfmarcQaAdicionarCheck(lista, id, nome, status, detalhe) {
  lista.push({
    id: id,
    name: nome,
    status: status,
    detail: detalhe
  });
}

function cfmarcQaResumirChecks(checks) {
  var resumo = { pass: 0, fail: 0, warning: 0, notExecuted: 0 };
  var i;

  for (i = 0; i < checks.length; i++) {
    if (checks[i].status === "PASS") {
      resumo.pass += 1;
    } else if (checks[i].status === "FAIL") {
      resumo.fail += 1;
    } else if (checks[i].status === "WARNING") {
      resumo.warning += 1;
    } else {
      resumo.notExecuted += 1;
    }
  }

  return resumo;
}

function cfmarcQaCalcularRecomendacao(checks, modo) {
  var idsCriticos = [
    "sw-supported",
    "sw-registration",
    "sw-scope",
    "sw-script",
    "caches-supported",
    "cache-exists",
    "cache-shell-files",
    "cache-no-json",
    "hash-routes"
  ];
  var i;
  var check;
  var temFalha = false;
  var criticoNaoExecutado = false;

  for (i = 0; i < checks.length; i++) {
    check = checks[i];
    if (check.status === "FAIL") {
      temFalha = true;
    }
    if (idsCriticos.indexOf(check.id) !== -1 && check.status === "NOT_EXECUTED") {
      criticoNaoExecutado = true;
    }
  }

  if (modo === "online") {
    for (i = 0; i < checks.length; i++) {
      if (checks[i].id === "online-fetch-shell" && checks[i].status === "NOT_EXECUTED") {
        criticoNaoExecutado = true;
      }
    }
  }

  if (modo === "offline") {
    for (i = 0; i < checks.length; i++) {
      if (
        (checks[i].id === "offline-context" || checks[i].id === "offline-fetch-shell") &&
        checks[i].status === "NOT_EXECUTED"
      ) {
        criticoNaoExecutado = true;
      }
    }
  }

  for (i = 0; i < checks.length; i++) {
    if (checks[i].id === "sw-controller" && checks[i].status === "WARNING") {
      criticoNaoExecutado = true;
    }
  }

  if (temFalha) {
    return "FIX_NEEDED";
  }
  if (criticoNaoExecutado) {
    return "NOT_EXECUTED";
  }
  return "KEEP_ALL";
}

function cfmarcQaClassificarUrlAtual() {
  var url = window.location;
  var host = url.hostname;
  var path = url.pathname;

  if (url.protocol === "file:") {
    return {
      status: "WARNING",
      detail: "Origem file:// — QA limitada; prefira https://hbtmarc.github.io/cf_marc/"
    };
  }

  if (host === "localhost" || host === "127.0.0.1") {
    return {
      status: "WARNING",
      detail: "Origem localhost — QA local; produção em /cf_marc/ no GitHub Pages"
    };
  }

  if (host.indexOf("github.io") !== -1 && path.indexOf("/cf_marc") !== -1) {
    return {
      status: "PASS",
      detail: "Origem GitHub Pages com caminho /cf_marc/"
    };
  }

  return {
    status: "WARNING",
    detail: "URL fora do padrão esperado do GitHub Pages (/cf_marc/)"
  };
}

function cfmarcQaObterTextoTituloPagina() {
  var titulo = document.querySelector("#conteudo .secao__titulo, #conteudo .importar .secao__titulo");

  if (!titulo) {
    return "";
  }

  return titulo.textContent.replace(/\s+/g, " ").trim();
}

function cfmarcQaTituloCorresponde(texto, esperados) {
  var i;

  for (i = 0; i < esperados.length; i++) {
    if (texto.indexOf(esperados[i]) !== -1) {
      return true;
    }
  }

  return false;
}

function cfmarcQaClassificarEntradaCache(urlString) {
  var pathname;

  try {
    pathname = new URL(urlString).pathname;
  } catch (e) {
    return null;
  }

  if (pathname.endsWith("/index.html")) {
    return "index.html";
  }
  if (pathname.endsWith("/styles.css")) {
    return "styles.css";
  }
  if (pathname.endsWith("/app.js")) {
    return "app.js";
  }
  if (pathname.endsWith("/cf_marc") || pathname.endsWith("/cf_marc/") || pathname.endsWith("/")) {
    return "root";
  }

  return null;
}

function cfmarcQaCacheContemJsonOuBackup(urlString) {
  var texto = String(urlString).toLowerCase();

  if (texto.indexOf(".json") !== -1) {
    return true;
  }
  if (texto.indexOf("cfmarc-backup") !== -1) {
    return true;
  }
  if (texto.indexOf("cfmarc-mvp-import") !== -1) {
    return true;
  }

  return false;
}

function cfmarcQaBuscarRegistroServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }

  if (navigator.serviceWorker.getRegistration) {
    return navigator.serviceWorker.getRegistration("./");
  }

  return Promise.resolve(null);
}

function cfmarcQaLerEntradasCache(nomeCache) {
  if (!("caches" in window)) {
    return Promise.resolve([]);
  }

  return caches.open(nomeCache).then(function (cache) {
    return cache.keys();
  });
}

function cfmarcQaTestarFetchShell(arquivos) {
  var resultados = [];

  function testarProximo(indice) {
    if (indice >= arquivos.length) {
      return Promise.resolve(resultados);
    }

    return fetch(arquivos[indice]).then(function (resposta) {
      resultados.push({
        arquivo: arquivos[indice],
        ok: resposta && resposta.ok,
        status: resposta ? resposta.status : 0
      });
      return testarProximo(indice + 1);
    }).catch(function () {
      resultados.push({
        arquivo: arquivos[indice],
        ok: false,
        status: 0
      });
      return testarProximo(indice + 1);
    });
  }

  return testarProximo(0);
}

function cfmarcQaFormatarResultadosFetch(resultados) {
  var fetchFalhou = [];
  var k;

  for (k = 0; k < resultados.length; k++) {
    if (!resultados[k].ok) {
      fetchFalhou.push(resultados[k].arquivo + " (" + resultados[k].status + ")");
    }
  }

  return fetchFalhou;
}

function cfmarcQaVerificarRotasHash() {
  var hashOriginal = window.location.hash || "#/" + ROTA_PADRAO;
  var rotas = [
    { hash: "#/dashboard", titulos: ["Dashboard"] },
    { hash: "#/balanco", titulos: ["Balanço"] },
    { hash: "#/cartoes", titulos: ["Cartões"] },
    { hash: "#/importar", titulos: ["Importar", "Atualizar"] },
    { hash: "#/configuracoes", titulos: ["Configurações"] }
  ];
  var falhas = [];
  var indice = 0;

  function verificarProxima() {
    var rota;
    var titulo;

    if (indice >= rotas.length) {
      window.location.hash = hashOriginal;
      return cfmarcQaEsperar(200).then(function () {
        if (falhas.length === 0) {
          return {
            status: "PASS",
            detail: "Rotas hash renderizaram os títulos esperados; hash original restaurado"
          };
        }
        return {
          status: "FAIL",
          detail: "Falhas de rota: " + falhas.join("; ")
        };
      });
    }

    rota = rotas[indice];
    window.location.hash = rota.hash;

    return cfmarcQaEsperar(200).then(function () {
      titulo = cfmarcQaObterTextoTituloPagina();
      if (!cfmarcQaTituloCorresponde(titulo, rota.titulos)) {
        falhas.push(rota.hash + " (título: \"" + titulo + "\")");
      }
      indice += 1;
      return verificarProxima();
    });
  }

  return verificarProxima();
}

window.CFMarcQA = {
  runServiceWorkerQA: function (modo) {
    var checks = [];
    var modoNormalizado = String(modo || "").toLowerCase();
    var relatorio;

    function finalizar() {
      relatorio = {
        mode: modoNormalizado,
        url: window.location.href,
        generatedAt: new Date().toISOString(),
        summary: cfmarcQaResumirChecks(checks),
        checks: checks,
        recommendation: cfmarcQaCalcularRecomendacao(checks, modoNormalizado)
      };

      console.table(checks);
      console.log("CFMarc QA — recomendação:", relatorio.recommendation);
      return relatorio;
    }

    try {
      if (modoNormalizado !== "online" && modoNormalizado !== "offline") {
        cfmarcQaAdicionarCheck(checks, "mode", "Modo de QA", "FAIL", "Use \"online\" ou \"offline\"");
        return Promise.resolve(finalizar());
      }

      var urlInfo = cfmarcQaClassificarUrlAtual();
      cfmarcQaAdicionarCheck(checks, "url-origin", "URL de publicação", urlInfo.status, urlInfo.detail);

      if (window.isSecureContext) {
        cfmarcQaAdicionarCheck(checks, "secure-context", "Contexto seguro", "PASS", "HTTPS ou localhost");
      } else {
        cfmarcQaAdicionarCheck(checks, "secure-context", "Contexto seguro", "FAIL", "Service Worker exige contexto seguro");
      }

      if ("serviceWorker" in navigator) {
        cfmarcQaAdicionarCheck(checks, "sw-supported", "Service Worker suportado", "PASS", "navigator.serviceWorker disponível");
      } else {
        cfmarcQaAdicionarCheck(checks, "sw-supported", "Service Worker suportado", "FAIL", "API indisponível neste navegador");
        cfmarcQaAdicionarCheck(checks, "sw-registration", "Registro do Service Worker", "NOT_EXECUTED", "API indisponível");
        cfmarcQaAdicionarCheck(checks, "sw-scope", "Escopo /cf_marc/", "NOT_EXECUTED", "API indisponível");
        cfmarcQaAdicionarCheck(checks, "sw-script", "Script sw.js", "NOT_EXECUTED", "API indisponível");
        cfmarcQaAdicionarCheck(checks, "sw-controller", "Página controlada pelo SW", "NOT_EXECUTED", "API indisponível");
        return Promise.resolve(finalizar());
      }

      return cfmarcQaBuscarRegistroServiceWorker().then(function (registro) {
        var scriptUrl = "";
        var worker = null;

        if (registro) {
          worker = registro.active || registro.waiting || registro.installing;
          if (worker && worker.scriptURL) {
            scriptUrl = worker.scriptURL;
          }

          cfmarcQaAdicionarCheck(checks, "sw-registration", "Registro do Service Worker", "PASS", "Registro encontrado");

          if (registro.scope && registro.scope.indexOf("/cf_marc") !== -1) {
            cfmarcQaAdicionarCheck(checks, "sw-scope", "Escopo /cf_marc/", "PASS", registro.scope);
          } else {
            cfmarcQaAdicionarCheck(checks, "sw-scope", "Escopo /cf_marc/", "FAIL", "Escopo atual: " + (registro.scope || "—"));
          }

          if (scriptUrl.indexOf("sw.js") !== -1) {
            cfmarcQaAdicionarCheck(checks, "sw-script", "Script sw.js", "PASS", scriptUrl);
          } else {
            cfmarcQaAdicionarCheck(checks, "sw-script", "Script sw.js", "FAIL", "Script: " + (scriptUrl || "—"));
          }
        } else {
          cfmarcQaAdicionarCheck(checks, "sw-registration", "Registro do Service Worker", "FAIL", "Nenhum registro em ./");
          cfmarcQaAdicionarCheck(checks, "sw-scope", "Escopo /cf_marc/", "NOT_EXECUTED", "Sem registro");
          cfmarcQaAdicionarCheck(checks, "sw-script", "Script sw.js", "NOT_EXECUTED", "Sem registro");
        }

        if (navigator.serviceWorker.controller) {
          cfmarcQaAdicionarCheck(
            checks,
            "sw-controller",
            "Página controlada pelo SW",
            "PASS",
            navigator.serviceWorker.controller.scriptURL
          );
        } else {
          cfmarcQaAdicionarCheck(
            checks,
            "sw-controller",
            "Página controlada pelo SW",
            "WARNING",
            "Reload once online after SW registration, then run QA again."
          );
        }

        if ("caches" in window) {
          cfmarcQaAdicionarCheck(checks, "caches-supported", "Cache Storage suportado", "PASS", "window.caches disponível");
        } else {
          cfmarcQaAdicionarCheck(checks, "caches-supported", "Cache Storage suportado", "FAIL", "API indisponível");
          cfmarcQaAdicionarCheck(checks, "cache-exists", "Cache " + CFMARC_SHELL_CACHE_QA, "NOT_EXECUTED", "API indisponível");
          cfmarcQaAdicionarCheck(checks, "cache-shell-files", "Arquivos do app shell em cache", "NOT_EXECUTED", "API indisponível");
          cfmarcQaAdicionarCheck(checks, "cache-no-json", "Cache sem JSON financeiro", "NOT_EXECUTED", "API indisponível");
          return Promise.resolve(finalizar());
        }

        return caches.keys().then(function (nomes) {
          var temCache = nomes.indexOf(CFMARC_SHELL_CACHE_QA) !== -1;

          if (temCache) {
            cfmarcQaAdicionarCheck(checks, "cache-exists", "Cache " + CFMARC_SHELL_CACHE_QA, "PASS", "Cache encontrado");
          } else {
            cfmarcQaAdicionarCheck(checks, "cache-exists", "Cache " + CFMARC_SHELL_CACHE_QA, "FAIL", "Caches: " + nomes.join(", "));
          }

          if (!temCache) {
            cfmarcQaAdicionarCheck(checks, "cache-shell-files", "Arquivos do app shell em cache", "NOT_EXECUTED", "Cache ausente");
            cfmarcQaAdicionarCheck(checks, "cache-no-json", "Cache sem JSON financeiro", "NOT_EXECUTED", "Cache ausente");
            return continuarAposCache();
          }

          return cfmarcQaLerEntradasCache(CFMARC_SHELL_CACHE_QA).then(function (entradas) {
            var temIndexOuRaiz = false;
            var temStyles = false;
            var temAppJs = false;
            var jsonSuspeito = [];
            var urlsCache = [];
            var j;
            var tipo;
            var urlEntrada;
            var detalheUrlsCache;

            for (j = 0; j < entradas.length; j++) {
              urlEntrada = entradas[j].url;
              urlsCache.push(urlEntrada);
              tipo = cfmarcQaClassificarEntradaCache(urlEntrada);

              if (tipo === "index.html" || tipo === "root") {
                temIndexOuRaiz = true;
              }
              if (tipo === "styles.css") {
                temStyles = true;
              }
              if (tipo === "app.js") {
                temAppJs = true;
              }
              if (cfmarcQaCacheContemJsonOuBackup(urlEntrada)) {
                jsonSuspeito.push(urlEntrada);
              }
            }

            detalheUrlsCache = urlsCache.length > 0 ? urlsCache.join(" | ") : "nenhuma URL";

            if (temIndexOuRaiz && temStyles && temAppJs) {
              cfmarcQaAdicionarCheck(
                checks,
                "cache-shell-files",
                "Arquivos do app shell em cache",
                "PASS",
                "index.html ou raiz, styles.css e app.js presentes. URLs: " + detalheUrlsCache
              );
            } else {
              cfmarcQaAdicionarCheck(
                checks,
                "cache-shell-files",
                "Arquivos do app shell em cache",
                "FAIL",
                "index/raiz=" + temIndexOuRaiz + ", styles.css=" + temStyles + ", app.js=" + temAppJs + ". URLs: " + detalheUrlsCache
              );
            }

            if (jsonSuspeito.length === 0) {
              cfmarcQaAdicionarCheck(checks, "cache-no-json", "Cache sem JSON financeiro", "PASS", "Nenhum .json ou backup no cache");
            } else {
              cfmarcQaAdicionarCheck(
                checks,
                "cache-no-json",
                "Cache sem JSON financeiro",
                "FAIL",
                jsonSuspeito.join(" | ")
              );
            }

            return continuarAposCache();
          });
        });

        function continuarAposCache() {
          if (modoNormalizado === "online") {
            if (navigator.onLine === false) {
              cfmarcQaAdicionarCheck(
                checks,
                "online-fetch-shell",
                "Fetch online do app shell",
                "NOT_EXECUTED",
                "Navegador está offline — execute em modo online"
              );
            } else {
              return cfmarcQaTestarFetchShell(["./index.html", "./styles.css", "./app.js"]).then(function (resultados) {
                var fetchFalhou = cfmarcQaFormatarResultadosFetch(resultados);

                if (fetchFalhou.length === 0) {
                  cfmarcQaAdicionarCheck(checks, "online-fetch-shell", "Fetch online do app shell", "PASS", "index.html, styles.css e app.js OK");
                } else {
                  cfmarcQaAdicionarCheck(checks, "online-fetch-shell", "Fetch online do app shell", "FAIL", fetchFalhou.join("; "));
                }

                return continuarAposFetch();
              });
            }
          } else {
            cfmarcQaAdicionarCheck(
              checks,
              "online-fetch-shell",
              "Fetch online do app shell",
              "NOT_EXECUTED",
              "Modo offline selecionado"
            );
          }

          if (modoNormalizado === "offline") {
            if (navigator.onLine === false) {
              cfmarcQaAdicionarCheck(checks, "offline-context", "Contexto offline do navegador", "PASS", "navigator.onLine === false");
            } else {
              cfmarcQaAdicionarCheck(
                checks,
                "offline-context",
                "Contexto offline do navegador",
                "WARNING",
                "navigator.onLine may be unreliable; fetch checks will validate offline behavior."
              );
            }

            return cfmarcQaTestarFetchShell(["./", "./index.html", "./styles.css", "./app.js"]).then(function (resultados) {
              var fetchFalhou = cfmarcQaFormatarResultadosFetch(resultados);

              if (fetchFalhou.length === 0) {
                cfmarcQaAdicionarCheck(
                  checks,
                  "offline-fetch-shell",
                  "Fetch offline do app shell",
                  "PASS",
                  "./, index.html, styles.css e app.js OK via SW/cache"
                );
              } else {
                cfmarcQaAdicionarCheck(checks, "offline-fetch-shell", "Fetch offline do app shell", "FAIL", fetchFalhou.join("; "));
              }

              return continuarAposFetch();
            });
          } else {
            cfmarcQaAdicionarCheck(
              checks,
              "offline-context",
              "Contexto offline do navegador",
              "NOT_EXECUTED",
              "Modo online selecionado"
            );
            cfmarcQaAdicionarCheck(
              checks,
              "offline-fetch-shell",
              "Fetch offline do app shell",
              "NOT_EXECUTED",
              "Execute runServiceWorkerQA(\"offline\") com Network > Offline"
            );
          }

          return continuarAposFetch();
        }

        function continuarAposFetch() {
          if (window.CFMarcStorage && window.CFMarcStorage.hasLocalData) {
            cfmarcQaAdicionarCheck(
              checks,
              "local-data",
              "Dados locais (CFMarcStorage)",
              "PASS",
              "hasLocalData() = " + String(window.CFMarcStorage.hasLocalData())
            );
          } else {
            cfmarcQaAdicionarCheck(checks, "local-data", "Dados locais (CFMarcStorage)", "NOT_EXECUTED", "CFMarcStorage indisponível");
          }

          if (window.CFMarcData && window.CFMarcData.hasConfirmedImport) {
            cfmarcQaAdicionarCheck(
              checks,
              "nav-data-state",
              "Estado de importação (CFMarcData)",
              "PASS",
              "hasConfirmedImport() = " + String(window.CFMarcData.hasConfirmedImport())
            );
          } else {
            cfmarcQaAdicionarCheck(checks, "nav-data-state", "Estado de importação (CFMarcData)", "NOT_EXECUTED", "CFMarcData indisponível");
          }

          return cfmarcQaVerificarRotasHash().then(function (resultadoRotas) {
            cfmarcQaAdicionarCheck(checks, "hash-routes", "Rotas hash renderizam títulos", resultadoRotas.status, resultadoRotas.detail);
            cfmarcQaAdicionarCheck(checks, "qa-helper", "Helper QA sem erros", "PASS", "Execução concluída");
            return finalizar();
          });
        }
      });
    } catch (erro) {
      cfmarcQaAdicionarCheck(checks, "qa-helper", "Helper QA sem erros", "FAIL", String(erro && erro.message ? erro.message : erro));
      return Promise.resolve(finalizar());
    }
  }
};
