import {
  createProgressiveForm,
  createValidatedField,
  type ProgressiveFormHandle,
} from "../form-validation";
import type { AppMutations } from "../forms";
import {
  compatibleTransactionsForRecurringOccurrence,
  findInvalidRecurringMatches,
  invalidRecurringMatchReason,
  recurringResolutionsForMonth,
} from "../recurrence-reconciliation";
import {
  findAmountMismatchReviews,
  runAutoReconciliation,
} from "../recurrence-auto-match";
import {
  allowedRecurrenceClassesForSuggestion,
  recurrenceClassLabel,
  suggestionGroupLabel,
  suggestionGroupOrder,
} from "../recurrence-class";
import {
  createRecurringMatch,
  createRecurringRule,
  endRecurringRule,
  pauseRecurringRule,
  removeRecurringMatch,
  removeRecurringMatchById,
  renewRecurringRule,
  resumeRecurringRule,
  updateRecurringRule,
  validateRecurringRuleDraft,
  type RecurringRuleDraft,
} from "../recurring-operations";
import { updateRecurringRuleAmountFromMonth } from "../recurrence-versioning";
import {
  billingModeLabel,
  buildPlanejamentoSummary,
  cardNameById,
  formatOccurrenceType,
  formatRecurringDifferenceLabel,
  formatRulePeriod,
  formatTransactionDate,
  nextValidOccurrenceMonth,
  resolutionStateLabel,
  resolutionStateVariant,
  ruleDisplayStatus,
  ruleDisplayStatusLabel,
  ruleMatchesFilter,
  ruleRecurrenceClassLabel,
  ruleRenewalSummary,
  transactionPlanningStatusLabel,
  type RuleFilter,
} from "../planejamento-presentation";
import {
  buildRecurringSuggestions,
  confirmRecurringSuggestion,
  ignoreRecurringSuggestion,
} from "../recurring-suggestions";
import { renderEmptyState, renderSectionHeader } from "../presentation";
import { formatCentsToBRL, formatCompetenceLabel, formatDateLabel, parseMoneyToCents } from "../finance";
import type { AppData, RecurrenceClass, RecurringRule } from "../types";
import {
  announce,
  centsToInputValue,
  el,
  escapeHtml,
  openConfirmModal,
  renderMoney,
  renderStatusChip,
} from "../ui";

let ruleFilter: RuleFilter = "all";
let formMode: "hidden" | "create" | "edit" = "hidden";
let editingRuleId: string | null = null;
let linkPanelOccurrenceId: string | null = null;
let lastRenderedCompetenceMonth: string | null = null;
let formController: ProgressiveFormHandle | null = null;
let pageAbort: AbortController | null = null;

export function resetPlanejamentoUiStateForTests(): void {
  ruleFilter = "all";
  formMode = "hidden";
  editingRuleId = null;
  linkPanelOccurrenceId = null;
  lastRenderedCompetenceMonth = null;
  formController?.destroy();
  formController = null;
  pageAbort?.abort();
  pageAbort = null;
}

function closeRuleForm(): void {
  formController?.destroy();
  formController = null;
  formMode = "hidden";
  editingRuleId = null;
}

function candidatesPanelId(occurrenceId: string): string {
  return `planejamento-candidates-${occurrenceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function renderSummaryPanel(data: AppData, month: string): string {
  const summary = buildPlanejamentoSummary(data, month);
  return `
    <section class="panel planejamento-summary" aria-labelledby="planejamento-summary-title">
      <div class="panel__header">
        <h2 class="panel__title" id="planejamento-summary-title">Resumo da competência</h2>
        <p class="panel__meta">${escapeHtml(formatCompetenceLabel(month))}</p>
      </div>
      <div class="panel__body planejamento-summary__grid">
        <div class="planejamento-metric">
          <span class="planejamento-metric__label">Receitas previstas</span>
          <span class="money money--positive">${escapeHtml(formatCentsToBRL(summary.incomeProjectedCents))}</span>
        </div>
        <div class="planejamento-metric">
          <span class="planejamento-metric__label">Despesas previstas</span>
          <span class="money money--negative">${escapeHtml(formatCentsToBRL(summary.expenseProjectedCents))}</span>
        </div>
        <div class="planejamento-metric">
          <span class="planejamento-metric__label">Quantidade prevista</span>
          <strong>${summary.projectedCount}</strong>
        </div>
        <div class="planejamento-metric">
          <span class="planejamento-metric__label">Quantidade conciliada</span>
          <strong>${summary.matchedCount}</strong>
        </div>
        <div class="planejamento-metric">
          <span class="planejamento-metric__label">Cobertas por fatura</span>
          <strong>${summary.coveredCount}</strong>
        </div>
      </div>
    </section>
  `;
}

function formatObservedCompetences(months: readonly string[]): string {
  return months.map((month) => formatCompetenceLabel(month)).join(", ");
}

function renderSuggestionClassPicker(suggestionId: string, recurrenceClass: RecurrenceClass, allowed: RecurrenceClass[]): string {
  const chips = allowed
    .map((item) => {
      const checked = item === recurrenceClass ? " checked" : "";
      const inputId = `suggestion-class-${suggestionId.replace(/[^a-zA-Z0-9_-]/g, "-")}-${item}`;
      return `<label class="choice-chip" for="${escapeHtml(inputId)}"><input type="radio" name="suggestion-class-${escapeHtml(suggestionId)}" id="${escapeHtml(inputId)}" value="${escapeHtml(item)}"${checked}> ${escapeHtml(recurrenceClassLabel(item))}</label>`;
    })
    .join("");
  return `<fieldset class="field field--inline-options planejamento-suggestion__class"><legend class="field__label">Classificação</legend>${chips}</fieldset>`;
}

function renderSuggestionRow(data: AppData, suggestion: ReturnType<typeof buildRecurringSuggestions>[number]): string {
  const cardLabel =
    suggestion.billingMode === "card" ? cardNameById(data, suggestion.cardId) : "Direta";
  const moneyClass = suggestion.kind === "income" ? "money--positive" : "money--negative";
  const allowed = allowedRecurrenceClassesForSuggestion(suggestion);
  return `
    <div class="planejamento-suggestion-row" data-suggestion-id="${escapeHtml(suggestion.id)}">
      <div class="planejamento-suggestion-row__main">
        <strong class="planejamento-suggestion-row__title">${escapeHtml(suggestion.description)}</strong>
        <span class="planejamento-suggestion-row__meta">${escapeHtml(suggestion.category)} · ${escapeHtml(cardLabel)} · ${escapeHtml(formatObservedCompetences(suggestion.competenceMonths))} · dia ${suggestion.dayOfMonth}</span>
        ${renderSuggestionClassPicker(suggestion.id, suggestion.proposedRecurrenceClass, allowed)}
      </div>
      <div class="planejamento-suggestion-row__aside">
        <span class="money ${moneyClass}">${escapeHtml(formatCentsToBRL(suggestion.amountCents))}</span>
        <div class="planejamento-suggestion-row__actions">
          <button type="button" class="btn btn--primary btn--small" data-action="confirm-suggestion" data-suggestion-id="${escapeHtml(suggestion.id)}">Criar recorrência</button>
          <button type="button" class="btn btn--secondary btn--small" data-action="ignore-suggestion" data-suggestion-id="${escapeHtml(suggestion.id)}">Ignorar</button>
        </div>
      </div>
    </div>
  `;
}

function renderSuggestionsSection(data: AppData): string {
  const suggestions = buildRecurringSuggestions(data);
  const groups = new Map<RecurrenceClass, ReturnType<typeof buildRecurringSuggestions>>();
  for (const suggestion of suggestions) {
    const bucket = groups.get(suggestion.proposedRecurrenceClass) ?? [];
    bucket.push(suggestion);
    groups.set(suggestion.proposedRecurrenceClass, bucket);
  }

  const groupBlocks = [...groups.entries()]
    .sort(([left], [right]) => suggestionGroupOrder(left) - suggestionGroupOrder(right))
    .map(([recurrenceClass, items]) => {
      const rows = items.map((item) => renderSuggestionRow(data, item)).join("");
      return `
        <div class="planejamento-suggestion-group">
          <h3 class="planejamento-suggestion-group__title">${escapeHtml(suggestionGroupLabel(recurrenceClass))}</h3>
          <div class="planejamento-suggestion-group__list">${rows}</div>
        </div>
      `;
    })
    .join("");

  return `
    <section class="planejamento-section" aria-labelledby="planejamento-suggestions-title">
      ${renderSectionHeader("Sugestões encontradas", { count: suggestions.length })}
      ${
        groupBlocks.length > 0
          ? groupBlocks
          : renderEmptyState({
              title: "Nenhuma sugestão no momento",
              description:
                "Lançamentos repetidos em competências distintas aparecerão aqui para você confirmar ou ignorar.",
            })
      }
    </section>
  `;
}

function renderOccurrencesSection(data: AppData, month: string): string {
  const resolutions = recurringResolutionsForMonth(data, month);
  const amountReviews = findAmountMismatchReviews(data, month);
  const rows = resolutions
    .map((resolution) => {
      const occurrence = resolution.occurrence;
      const panelId = candidatesPanelId(occurrence.id);
      const isLinkOpen = linkPanelOccurrenceId === occurrence.id;
      const canLink =
        resolution.state === "projected" || resolution.state === "covered_by_invoice";
      const cardLabel =
        occurrence.billingMode === "card"
          ? cardNameById(data, occurrence.cardId)
          : "—";

      const matchedDetails =
        resolution.state === "matched"
          ? `
            <div class="planejamento-occurrence__details">
              <p>Realizado: <span class="money">${escapeHtml(formatCentsToBRL(resolution.actualAmountCents ?? 0))}</span></p>
              <p>${escapeHtml(formatRecurringDifferenceLabel(resolution.differenceCents ?? 0))}</p>
              <p>Transação: ${escapeHtml(resolution.transactionId ?? "—")}</p>
              <button type="button" class="btn btn--secondary btn--small" data-action="unlink-match" data-rule-id="${escapeHtml(occurrence.ruleId)}" data-competence-month="${escapeHtml(occurrence.competenceMonth)}">Desvincular</button>
            </div>
          `
          : "";

      const linkButton = canLink
        ? `<button type="button" class="btn btn--secondary btn--small" data-action="toggle-link-panel" data-occurrence-id="${escapeHtml(occurrence.id)}" aria-expanded="${isLinkOpen ? "true" : "false"}" aria-controls="${escapeHtml(panelId)}">Vincular lançamento</button>`
        : "";

      const candidates =
        isLinkOpen && canLink
          ? renderCandidatesPanel(data, occurrence, panelId)
          : "";

      return `
        <article class="planejamento-occurrence" data-occurrence-id="${escapeHtml(occurrence.id)}">
          <div class="planejamento-occurrence__head">
            <div>
              <h3 class="planejamento-occurrence__title">${escapeHtml(occurrence.description)}</h3>
              <p class="planejamento-occurrence__meta">${escapeHtml(formatOccurrenceType(occurrence.kind))} · ${escapeHtml(formatDateLabel(occurrence.expectedDate))} · ${escapeHtml(billingModeLabel(occurrence.billingMode))}${occurrence.billingMode === "card" ? ` · ${escapeHtml(cardLabel)}` : ""}</p>
            </div>
            <div class="planejamento-occurrence__aside">
              <span class="money">${escapeHtml(formatCentsToBRL(occurrence.amountCents))}</span>
              ${renderStatusChip(resolutionStateLabel(resolution.state), resolutionStateVariant(resolution.state))}
            </div>
          </div>
          ${matchedDetails}
          <div class="planejamento-occurrence__actions">${linkButton}</div>
          ${candidates}
        </article>
      `;
    })
    .join("");

  const reviewRows = amountReviews
    .map(
      (review) => `
        <article class="planejamento-amount-review">
          <p><strong>${escapeHtml(review.occurrence.description)}</strong> — possível valor alterado</p>
          <p class="planejamento-amount-review__meta">Previsto: ${escapeHtml(formatCentsToBRL(review.expectedAmountCents))} · Observado: ${escapeHtml(formatCentsToBRL(review.actualAmountCents))} · ${escapeHtml(formatRecurringDifferenceLabel(review.differenceCents))}</p>
          <div class="planejamento-occurrence__actions">
            <button type="button" class="btn btn--secondary btn--small" data-action="link-amount-review" data-rule-id="${escapeHtml(review.occurrence.ruleId)}" data-transaction-id="${escapeHtml(review.transaction.id)}" data-competence-month="${escapeHtml(review.occurrence.competenceMonth)}">Vincular</button>
            <button type="button" class="btn btn--ghost btn--small" data-action="update-rule-value" data-rule-id="${escapeHtml(review.occurrence.ruleId)}">Atualizar valor a partir desta competência</button>
          </div>
        </article>
      `,
    )
    .join("");

  return `
    <section class="planejamento-section" aria-labelledby="planejamento-occurrences-title">
      ${renderSectionHeader("Ocorrências do mês", { count: resolutions.length })}
      ${reviewRows ? `<div class="planejamento-amount-review-list">${reviewRows}</div>` : ""}
      ${rows.length > 0 ? `<div class="planejamento-occurrence-list">${rows}</div>` : renderEmptyState({ title: "Nenhuma ocorrência nesta competência", description: "Crie ou reative regras recorrentes para gerar previsões neste mês." })}
    </section>
  `;
}

function renderCandidatesPanel(
  data: AppData,
  occurrence: ReturnType<typeof recurringResolutionsForMonth>[number]["occurrence"],
  panelId: string,
): string {
  const candidates = compatibleTransactionsForRecurringOccurrence(data, occurrence);
  if (candidates.length === 0) {
    return `<div class="planejamento-candidates" id="${escapeHtml(panelId)}" role="region" aria-label="Candidatos compatíveis"><p class="planejamento-candidates__empty">Nenhum lançamento compatível disponível.</p></div>`;
  }

  const rows = candidates
    .map(
      (transaction) => `
        <div class="planejamento-candidate">
          <div>
            <strong>${escapeHtml(transaction.description)}</strong>
            <p class="planejamento-candidate__meta">${escapeHtml(formatTransactionDate(transaction))} · ${escapeHtml(transaction.category)} · ${escapeHtml(transactionPlanningStatusLabel(transaction))}${transaction.cardId ? ` · ${escapeHtml(cardNameById(data, transaction.cardId))}` : ""}</p>
          </div>
          <div class="planejamento-candidate__aside">
            ${renderMoney(transaction.kind === "expense" ? -transaction.amountCents : transaction.amountCents)}
            <button type="button" class="btn btn--primary btn--small" data-action="link-match" data-rule-id="${escapeHtml(occurrence.ruleId)}" data-competence-month="${escapeHtml(occurrence.competenceMonth)}" data-transaction-id="${escapeHtml(transaction.id)}">Vincular</button>
          </div>
        </div>
      `,
    )
    .join("");

  return `<div class="planejamento-candidates" id="${escapeHtml(panelId)}" role="region" aria-label="Candidatos compatíveis">${rows}</div>`;
}

function renderRuleRow(data: AppData, rule: RecurringRule, month: string): string {
  const status = ruleDisplayStatus(rule, month);
  const nextMonth = nextValidOccurrenceMonth(rule, month);
  const billing = rule.kind === "income" ? "Direta" : billingModeLabel(rule.billingMode);
  const card =
    rule.billingMode === "card" ? cardNameById(data, rule.cardId) : "—";
  const renewal = ruleRenewalSummary(rule);
  const statusVariant =
    status === "active"
      ? "success"
      : status === "paused"
        ? "warning"
        : status === "renewal_pending"
          ? "warning"
          : "neutral";

  return `
    <article class="planejamento-rule" data-rule-id="${escapeHtml(rule.id)}">
      <div class="planejamento-rule__main">
        <h3 class="planejamento-rule__title">${escapeHtml(rule.description)}</h3>
        <p class="planejamento-rule__meta">${escapeHtml(ruleRecurrenceClassLabel(rule))} · série ${escapeHtml(rule.seriesId ?? rule.id)} · ${escapeHtml(formatRulePeriod(rule))}</p>
        <p class="planejamento-rule__meta">${escapeHtml(rule.category)} · dia ${rule.dayOfMonth} · ${escapeHtml(billing)}${rule.billingMode === "card" ? ` · ${escapeHtml(card)}` : ""}${renewal ? ` · ${escapeHtml(renewal)}` : ""}</p>
        <p class="planejamento-rule__meta">Próxima: ${nextMonth ? escapeHtml(formatCompetenceLabel(nextMonth)) : "—"}</p>
      </div>
      <div class="planejamento-rule__aside">
        <span class="money">${escapeHtml(formatCentsToBRL(rule.amountCents))}</span>
        ${renderStatusChip(ruleDisplayStatusLabel(status), statusVariant)}
      </div>
      <div class="planejamento-rule__actions">
        <button type="button" class="btn btn--ghost btn--small" data-action="edit-rule" data-rule-id="${escapeHtml(rule.id)}">Editar</button>
        ${status === "renewal_pending" ? `<button type="button" class="btn btn--primary btn--small" data-action="renew-rule" data-rule-id="${escapeHtml(rule.id)}">Renovar por 12 meses</button>` : ""}
        ${rule.recurrenceClass === "fixed_bill" || rule.recurrenceClass === "other" ? `<button type="button" class="btn btn--ghost btn--small" data-action="update-rule-value" data-rule-id="${escapeHtml(rule.id)}">Atualizar valor</button>` : ""}
        ${status === "active" || status === "renewal_pending" ? `<button type="button" class="btn btn--ghost btn--small" data-action="pause-rule" data-rule-id="${escapeHtml(rule.id)}">Pausar</button>` : ""}
        ${status === "paused" ? `<button type="button" class="btn btn--ghost btn--small" data-action="resume-rule" data-rule-id="${escapeHtml(rule.id)}">Reativar</button>` : ""}
        ${status !== "ended" ? `<button type="button" class="btn btn--ghost btn--small" data-action="end-rule" data-rule-id="${escapeHtml(rule.id)}">Encerrar</button>` : ""}
      </div>
    </article>
  `;
}

function renderRulesSection(data: AppData, month: string): string {
  const rules = (data.recurringRules ?? []).filter((rule) =>
    ruleMatchesFilter(rule, ruleFilter, month),
  );
  const incomeRules = rules.filter((rule) => rule.kind === "income");
  const expenseRules = rules.filter((rule) => rule.kind === "expense");

  const filterChips = (["all", "active", "paused", "ended"] as RuleFilter[])
    .map((filter) => {
      const label =
        filter === "all"
          ? "Todas"
          : filter === "active"
            ? "Ativas"
            : filter === "paused"
              ? "Pausadas"
              : "Encerradas";
      const active = ruleFilter === filter ? " is-active" : "";
      return `<button type="button" class="filter-chip${active}" data-action="filter-rules" data-filter="${filter}">${label}</button>`;
    })
    .join("");

  return `
    <section class="planejamento-section" aria-labelledby="planejamento-rules-title">
      <div class="section-header">
        <h2 class="section-header__title" id="planejamento-rules-title">Regras mensais</h2>
        <div class="toolbar-panel__filters">${filterChips}</div>
      </div>
      <div class="planejamento-rules-group">
        <h3 class="planejamento-rules-group__title">Receitas previstas</h3>
        ${incomeRules.length > 0 ? incomeRules.map((rule) => renderRuleRow(data, rule, month)).join("") : renderEmptyState({ title: "Nenhuma receita recorrente", description: "Cadastre uma regra de receita para prever entradas mensais." })}
      </div>
      <div class="planejamento-rules-group">
        <h3 class="planejamento-rules-group__title">Despesas recorrentes</h3>
        ${expenseRules.length > 0 ? expenseRules.map((rule) => renderRuleRow(data, rule, month)).join("") : renderEmptyState({ title: "Nenhuma despesa recorrente", description: "Cadastre uma regra de despesa para prever saídas mensais." })}
      </div>
    </section>
  `;
}

function renderInvalidMatchesSection(data: AppData): string {
  const invalid = findInvalidRecurringMatches(data);
  if (invalid.length === 0) {
    return "";
  }

  const rows = invalid
    .map(({ match, errors }) => {
      const rule = (data.recurringRules ?? []).find((item) => item.id === match.ruleId);
      return `
        <article class="planejamento-invalid-match">
          <p><strong>${escapeHtml(rule?.description ?? match.ruleId)}</strong> · ${escapeHtml(formatCompetenceLabel(match.competenceMonth))}</p>
          <p class="planejamento-invalid-match__reason">${escapeHtml(invalidRecurringMatchReason(errors))}</p>
          <button type="button" class="btn btn--danger btn--small" data-action="remove-invalid-match" data-match-id="${escapeHtml(match.id)}">Remover vínculo inválido</button>
        </article>
      `;
    })
    .join("");

  return `
    <section class="panel planejamento-invalid" aria-labelledby="planejamento-invalid-title">
      <div class="panel__header">
        <h2 class="panel__title" id="planejamento-invalid-title">Vínculos que precisam de revisão</h2>
      </div>
      <div class="panel__body">${rows}</div>
    </section>
  `;
}

function buildRuleDraftFromControls(host: HTMLElement): RecurringRuleDraft {
  const kind = host.querySelector<HTMLInputElement>('input[name="rule-kind"]:checked')?.value ?? "expense";
  return {
    kind: kind === "income" ? "income" : "expense",
    description: host.querySelector<HTMLInputElement>("#rule-description")?.value ?? "",
    amountInput: host.querySelector<HTMLInputElement>("#rule-amount")?.value ?? "",
    category: host.querySelector<HTMLInputElement>("#rule-category")?.value ?? "",
    dayOfMonth: host.querySelector<HTMLInputElement>("#rule-day")?.value ?? "",
    startMonth: host.querySelector<HTMLInputElement>("#rule-start-month")?.value ?? "",
    endMonth: host.querySelector<HTMLInputElement>("#rule-end-month")?.value ?? "",
    billingMode:
      host.querySelector<HTMLInputElement>('input[name="rule-billing"]:checked')?.value === "card"
        ? "card"
        : "direct",
    cardId: host.querySelector<HTMLSelectElement>("#rule-card")?.value ?? "",
  };
}

function syncBillingVisibility(formHost: HTMLElement): void {
  const kind = formHost.querySelector<HTMLInputElement>('input[name="rule-kind"]:checked')?.value;
  const billing = formHost.querySelector<HTMLInputElement>('input[name="rule-billing"]:checked')?.value;
  const billingGroup = formHost.querySelector<HTMLElement>('[data-field-group="billing"]');
  const cardGroup = formHost.querySelector<HTMLElement>('[data-field-group="card"]');
  if (billingGroup) {
    billingGroup.hidden = kind === "income";
  }
  if (cardGroup) {
    cardGroup.hidden = kind === "income" || billing !== "card";
  }
}

function mountRuleForm(
  formHost: HTMLElement,
  data: AppData,
  month: string,
  mutations: AppMutations,
  rerender: () => void,
  rule?: RecurringRule,
): void {
  formController?.destroy();
  formHost.replaceChildren();

  const panelHeader = el("div", "panel__header");
  panelHeader.append(
    el("h2", "panel__title", "Cadastro manual"),
    el(
      "p",
      "panel__meta",
      "Use quando nenhuma sugestão automática se aplicar.",
    ),
  );

  const isEdit = rule !== undefined;
  const form = el("form", "form planejamento-form");
  form.noValidate = true;
  form.id = "planejamento-rule-form";

  const kindIncome = el("input") as HTMLInputElement;
  kindIncome.type = "radio";
  kindIncome.name = "rule-kind";
  kindIncome.value = "income";
  kindIncome.id = "rule-kind-income";
  kindIncome.checked = rule?.kind === "income";

  const kindExpense = el("input") as HTMLInputElement;
  kindExpense.type = "radio";
  kindExpense.name = "rule-kind";
  kindExpense.value = "expense";
  kindExpense.id = "rule-kind-expense";
  kindExpense.checked = rule?.kind !== "income";

  const description = el("input") as HTMLInputElement;
  description.type = "text";
  description.id = "rule-description";
  description.value = rule?.description ?? "";
  description.autocomplete = "off";

  const amount = el("input") as HTMLInputElement;
  amount.type = "text";
  amount.id = "rule-amount";
  amount.inputMode = "decimal";
  amount.placeholder = "0,00";
  amount.value = rule ? centsToInputValue(rule.amountCents) : "";
  amount.classList.add("field__control--money");

  const category = el("input") as HTMLInputElement;
  category.type = "text";
  category.id = "rule-category";
  category.value = rule?.category ?? "";

  const day = el("input") as HTMLInputElement;
  day.type = "number";
  day.id = "rule-day";
  day.min = "1";
  day.max = "31";
  day.value = rule ? String(rule.dayOfMonth) : "1";

  const startMonth = el("input") as HTMLInputElement;
  startMonth.type = "month";
  startMonth.id = "rule-start-month";
  startMonth.value = rule?.startMonth ?? month;

  const endMonth = el("input") as HTMLInputElement;
  endMonth.type = "month";
  endMonth.id = "rule-end-month";
  endMonth.value = rule?.endMonth ?? "";

  const billingDirect = el("input") as HTMLInputElement;
  billingDirect.type = "radio";
  billingDirect.name = "rule-billing";
  billingDirect.value = "direct";
  billingDirect.id = "rule-billing-direct";
  billingDirect.checked = rule?.billingMode !== "card";

  const billingCard = el("input") as HTMLInputElement;
  billingCard.type = "radio";
  billingCard.name = "rule-billing";
  billingCard.value = "card";
  billingCard.id = "rule-billing-card";
  billingCard.checked = rule?.billingMode === "card";

  const card = el("select") as HTMLSelectElement;
  card.id = "rule-card";
  const emptyOption = el("option") as HTMLOptionElement;
  emptyOption.value = "";
  emptyOption.textContent = "Selecione um cartão";
  card.appendChild(emptyOption);
  for (const cardItem of data.cards) {
    const option = el("option") as HTMLOptionElement;
    option.value = cardItem.id;
    option.textContent = cardItem.name;
    if (rule?.cardId === cardItem.id) {
      option.selected = true;
    }
    card.appendChild(option);
  }

  const getDraft = (): RecurringRuleDraft => buildRuleDraftFromControls(formHost);
  const cardIds = data.cards.map((item) => item.id);

  const fields = [
    createValidatedField({
      name: "rule-description",
      label: "Descrição",
      control: description,
      required: true,
      getError: () => {
        const errors = validateRecurringRuleDraft(getDraft(), cardIds, rule);
        return errors.description ?? null;
      },
    }),
    createValidatedField({
      name: "rule-amount",
      label: "Valor",
      control: amount,
      required: true,
      getError: () => {
        const errors = validateRecurringRuleDraft(getDraft(), cardIds, rule);
        return errors.amount ?? errors.amountCents ?? null;
      },
    }),
    createValidatedField({
      name: "rule-category",
      label: "Categoria",
      control: category,
      required: true,
      getError: () => {
        const errors = validateRecurringRuleDraft(getDraft(), cardIds, rule);
        return errors.category ?? null;
      },
    }),
    createValidatedField({
      name: "rule-day",
      label: "Dia esperado",
      control: day,
      required: true,
      getError: () => {
        const errors = validateRecurringRuleDraft(getDraft(), cardIds, rule);
        return errors.dayOfMonth ?? null;
      },
    }),
    createValidatedField({
      name: "rule-start-month",
      label: "Competência inicial",
      control: startMonth,
      required: true,
      getError: () => {
        const errors = validateRecurringRuleDraft(getDraft(), cardIds, rule);
        return errors.startMonth ?? null;
      },
    }),
    createValidatedField({
      name: "rule-end-month",
      label: "Competência final",
      control: endMonth,
      getError: () => {
        const errors = validateRecurringRuleDraft(getDraft(), cardIds, rule);
        return errors.endMonth ?? null;
      },
    }),
    createValidatedField({
      name: "rule-card",
      label: "Cartão",
      control: card,
      getError: () => {
        const errors = validateRecurringRuleDraft(getDraft(), cardIds, rule);
        return errors.cardId ?? null;
      },
    }),
  ];

  const kindGroup = el("fieldset", "field field--inline-options");
  kindGroup.setAttribute("data-field-group", "kind");
  const kindLegend = el("legend", "field__label", "Tipo");
  const kindIncomeLabel = el("label", "choice-chip");
  kindIncomeLabel.htmlFor = "rule-kind-income";
  kindIncomeLabel.append(kindIncome, document.createTextNode(" Receita"));
  const kindExpenseLabel = el("label", "choice-chip");
  kindExpenseLabel.htmlFor = "rule-kind-expense";
  kindExpenseLabel.append(kindExpense, document.createTextNode(" Despesa"));
  kindGroup.append(kindLegend, kindIncomeLabel, kindExpenseLabel);

  const billingGroup = el("fieldset", "field field--inline-options");
  billingGroup.setAttribute("data-field-group", "billing");
  const billingLegend = el("legend", "field__label", "Forma de cobrança");
  const billingDirectLabel = el("label", "choice-chip");
  billingDirectLabel.htmlFor = "rule-billing-direct";
  billingDirectLabel.append(billingDirect, document.createTextNode(" Direta"));
  const billingCardLabel = el("label", "choice-chip");
  billingCardLabel.htmlFor = "rule-billing-card";
  billingCardLabel.append(billingCard, document.createTextNode(" Cartão"));
  billingGroup.append(billingLegend, billingDirectLabel, billingCardLabel);

  const actions = el("div", "form-actions");
  const cancelButton = el("button", "btn btn--secondary", "Cancelar");
  cancelButton.type = "button";
  const submitButton = el("button", "btn btn--primary", isEdit ? "Salvar" : "Criar regra");
  submitButton.type = "submit";
  actions.append(cancelButton, submitButton);

  form.append(
    kindGroup,
    fields[0]!.group,
    fields[1]!.group,
    fields[2]!.group,
    fields[3]!.group,
    fields[4]!.group,
    fields[5]!.group,
    billingGroup,
    fields[6]!.group,
    actions,
  );

  formHost.append(panelHeader, form);
  syncBillingVisibility(formHost);

  cancelButton.addEventListener("click", () => {
    closeRuleForm();
    refreshPlanejamentoSections(formHost.closest(".planejamento-page") as HTMLElement, data, month);
  });

  formController = createProgressiveForm({
    form,
    submitButton,
    fields,
    onSubmit: () => {
      const draft = getDraft();
      mutations.update((appData) => {
        const errors = isEdit && rule
          ? updateRecurringRule(appData, rule.id, draft)
          : createRecurringRule(appData, draft);
        if (Object.keys(errors).length > 0) {
          announce("Corrija os campos do formulário antes de salvar.");
          return;
        }
        closeRuleForm();
        announce(isEdit ? "Regra recorrente atualizada." : "Regra recorrente criada.");
      });
      rerender();
    },
  });
  formController.bind();

  for (const control of [kindIncome, kindExpense, billingDirect, billingCard]) {
    control.addEventListener("change", () => {
      syncBillingVisibility(formHost);
      formController?.updateSubmitState();
      formController?.renderErrors();
    });
  }
}

function refreshPlanejamentoSections(host: HTMLElement, data: AppData, month: string): void {
  const summaryHost = host.querySelector<HTMLElement>("#planejamento-summary-host");
  const suggestionsHost = host.querySelector<HTMLElement>("#planejamento-suggestions-host");
  const invalidHost = host.querySelector<HTMLElement>("#planejamento-invalid-host");
  const occurrencesHost = host.querySelector<HTMLElement>("#planejamento-occurrences-host");
  const rulesHost = host.querySelector<HTMLElement>("#planejamento-rules-host");
  const formHost = host.querySelector<HTMLElement>("#planejamento-form-host");

  if (summaryHost) {
    summaryHost.innerHTML = renderSummaryPanel(data, month);
  }
  if (suggestionsHost) {
    suggestionsHost.innerHTML = renderSuggestionsSection(data);
  }
  if (invalidHost) {
    invalidHost.innerHTML = renderInvalidMatchesSection(data);
  }
  if (occurrencesHost) {
    occurrencesHost.innerHTML = renderOccurrencesSection(data, month);
  }
  if (rulesHost) {
    rulesHost.innerHTML = renderRulesSection(data, month);
  }
  if (formHost) {
    formHost.hidden = formMode === "hidden";
    if (formMode === "hidden") {
      formHost.replaceChildren();
    }
  }
}

function bindPlanejamentoActions(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  pageAbort?.abort();
  pageAbort = new AbortController();
  const { signal } = pageAbort;
  const month = data.selectedCompetenceMonth;

  host.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement;
      const actionNode = target.closest<HTMLElement>("[data-action]");
      if (!actionNode) {
        return;
      }

      const action = actionNode.dataset.action;
      if (action === "new-rule") {
        formMode = "create";
        editingRuleId = null;
        const formHost = host.querySelector<HTMLElement>("#planejamento-form-host");
        if (formHost) {
          formHost.hidden = false;
          mountRuleForm(formHost, data, month, mutations, rerender);
          formHost.scrollIntoView?.({ block: "nearest", behavior: "auto" });
        }
        return;
      }

      if (action === "confirm-suggestion") {
        const suggestionId = actionNode.dataset.suggestionId;
        if (!suggestionId) {
          return;
        }
        mutations.update((appData) => {
          const suggestions = buildRecurringSuggestions(appData);
          const suggestion = suggestions.find((item) => item.id === suggestionId);
          if (!suggestion) {
            announce("Sugestão indisponível.");
            return;
          }
          const suggestionRow = actionNode.closest("[data-suggestion-id]");
          const selectedClass = suggestionRow?.querySelector<HTMLInputElement>(
            `input[name="suggestion-class-${CSS.escape(suggestionId)}"]:checked`,
          )?.value as RecurrenceClass | undefined;
          const result = confirmRecurringSuggestion(appData, suggestionId, {
            recurrenceClass: selectedClass ?? suggestion.proposedRecurrenceClass,
            selectedCompetenceMonth: month,
          });
          if (Object.keys(result.errors).length > 0) {
            announce("Não foi possível criar a regra a partir da sugestão.");
            return;
          }
          runAutoReconciliation(appData, month);
          if (result.reviewItems.length > 0) {
            announce("Recorrência criada. Alguns vínculos precisam de revisão.");
            return;
          }
          announce("Recorrência criada a partir da sugestão.");
        });
        rerender();
        return;
      }

      if (action === "ignore-suggestion") {
        const suggestionId = actionNode.dataset.suggestionId;
        if (!suggestionId) {
          return;
        }
        mutations.update((appData) => {
          if (!ignoreRecurringSuggestion(appData, suggestionId)) {
            return;
          }
          announce("Sugestão ignorada.");
        });
        rerender();
        return;
      }

      if (action === "renew-rule") {
        const ruleId = actionNode.dataset.ruleId;
        if (!ruleId) {
          return;
        }
        mutations.update((appData) => {
          const errors = renewRecurringRule(appData, ruleId, month);
          if (Object.keys(errors).length > 0) {
            announce("Não foi possível renovar a assinatura.");
            return;
          }
          announce("Assinatura renovada por 12 meses.");
        });
        rerender();
        return;
      }

      if (action === "update-rule-value") {
        const ruleId = actionNode.dataset.ruleId;
        if (!ruleId) {
          return;
        }
        const rule = (data.recurringRules ?? []).find((item) => item.id === ruleId);
        if (!rule) {
          return;
        }
        const input = window.prompt(
          `Novo valor a partir de ${formatCompetenceLabel(month)} (use vírgula para centavos):`,
          centsToInputValue(rule.amountCents),
        );
        if (!input) {
          return;
        }
        const cents = parseMoneyToCents(input);
        if (cents === null) {
          announce("Valor inválido.");
          return;
        }
        mutations.update((appData) => {
          const errors = updateRecurringRuleAmountFromMonth(appData, ruleId, month, cents);
          if (Object.keys(errors).length > 0) {
            announce("Não foi possível atualizar o valor.");
            return;
          }
          announce("Valor atualizado a partir da competência selecionada.");
        });
        rerender();
        return;
      }

      if (action === "link-amount-review") {
        const ruleId = actionNode.dataset.ruleId;
        const transactionId = actionNode.dataset.transactionId;
        const competenceMonth = actionNode.dataset.competenceMonth;
        if (!ruleId || !transactionId || !competenceMonth) {
          return;
        }
        mutations.update((appData) => {
          const errors = createRecurringMatch(appData, ruleId, competenceMonth, transactionId);
          if (Object.keys(errors).length > 0) {
            announce("Não foi possível vincular o lançamento.");
            return;
          }
          announce("Lançamento vinculado com valor diferente do previsto.");
        });
        rerender();
        return;
      }

      if (action === "edit-rule") {
        const ruleId = actionNode.dataset.ruleId;
        const rule = (data.recurringRules ?? []).find((item) => item.id === ruleId);
        if (!rule) {
          return;
        }
        formMode = "edit";
        editingRuleId = rule.id;
        const formHost = host.querySelector<HTMLElement>("#planejamento-form-host");
        if (formHost) {
          formHost.hidden = false;
          mountRuleForm(formHost, data, month, mutations, rerender, rule);
        }
        return;
      }

      if (action === "pause-rule") {
        const ruleId = actionNode.dataset.ruleId;
        if (!ruleId) {
          return;
        }
        mutations.update((appData) => pauseRecurringRule(appData, ruleId, month));
        announce("Regra pausada.");
        rerender();
        return;
      }

      if (action === "resume-rule") {
        const ruleId = actionNode.dataset.ruleId;
        if (!ruleId) {
          return;
        }
        mutations.update((appData) => resumeRecurringRule(appData, ruleId, month));
        announce("Regra reativada.");
        rerender();
        return;
      }

      if (action === "end-rule") {
        const ruleId = actionNode.dataset.ruleId;
        if (!ruleId) {
          return;
        }
        openConfirmModal({
          title: "Encerrar regra",
          message: `Encerrar a regra nesta competência (${formatCompetenceLabel(month)})? O histórico e os vínculos anteriores serão preservados.`,
          confirmLabel: "Encerrar",
          onConfirm: () => {
            mutations.update((appData) => endRecurringRule(appData, ruleId, month));
            announce("Regra encerrada.");
            rerender();
          },
        });
        return;
      }

      if (action === "filter-rules") {
        const filter = actionNode.dataset.filter as RuleFilter | undefined;
        if (!filter) {
          return;
        }
        ruleFilter = filter;
        refreshPlanejamentoSections(host, data, month);
        return;
      }

      if (action === "toggle-link-panel") {
        const occurrenceId = actionNode.dataset.occurrenceId;
        linkPanelOccurrenceId = linkPanelOccurrenceId === occurrenceId ? null : occurrenceId ?? null;
        refreshPlanejamentoSections(host, data, month);
        if (linkPanelOccurrenceId) {
          const panel = host.querySelector<HTMLElement>(
            `#${candidatesPanelId(linkPanelOccurrenceId)}`,
          );
          panel?.querySelector<HTMLButtonElement>("button[data-action='link-match']")?.focus();
        }
        return;
      }

      if (action === "link-match") {
        const ruleId = actionNode.dataset.ruleId;
        const competenceMonth = actionNode.dataset.competenceMonth;
        const transactionId = actionNode.dataset.transactionId;
        if (!ruleId || !competenceMonth || !transactionId) {
          return;
        }
        mutations.update((appData) => {
          const errors = createRecurringMatch(
            appData,
            ruleId,
            competenceMonth,
            transactionId,
          );
          if (Object.keys(errors).length > 0) {
            announce("Não foi possível vincular o lançamento.");
            return;
          }
          linkPanelOccurrenceId = null;
          announce("Lançamento vinculado com sucesso.");
        });
        rerender();
        return;
      }

      if (action === "unlink-match") {
        const ruleId = actionNode.dataset.ruleId;
        const competenceMonth = actionNode.dataset.competenceMonth;
        if (!ruleId || !competenceMonth) {
          return;
        }
        openConfirmModal({
          title: "Desvincular lançamento",
          message: "Remover o vínculo entre a ocorrência prevista e o lançamento real?",
          confirmLabel: "Desvincular",
          danger: true,
          onConfirm: () => {
            mutations.update((appData) => {
              removeRecurringMatch(appData, ruleId, competenceMonth);
              announce("Vínculo removido.");
            });
            rerender();
          },
        });
        return;
      }

      if (action === "remove-invalid-match") {
        const matchId = actionNode.dataset.matchId;
        if (!matchId) {
          return;
        }
        mutations.update((appData) => {
          removeRecurringMatchById(appData, matchId);
          announce("Vínculo inválido removido.");
        });
        rerender();
      }
    },
    { signal },
  );

  host.addEventListener(
    "keydown",
    (event) => {
      const target = event.target as HTMLElement;
      if (
        (event.key === "Enter" || event.key === " ") &&
        target.dataset.action === "toggle-link-panel"
      ) {
        event.preventDefault();
        target.click();
      }
    },
    { signal },
  );
}

export function renderPlanejamento(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const month = data.selectedCompetenceMonth;
  runAutoReconciliation(data, month);
  if (lastRenderedCompetenceMonth !== null && lastRenderedCompetenceMonth !== month) {
    linkPanelOccurrenceId = null;
  }
  lastRenderedCompetenceMonth = month;

  let page = host.querySelector<HTMLElement>(".planejamento-page");

  if (!page) {
    host.replaceChildren();
    page = el("div", "planejamento-page");
    page.setAttribute("data-planejamento-shell", "true");

    const status = el("div", "planejamento-status");
    status.id = "planejamento-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const toolbar = el("section", "toolbar-panel planejamento-toolbar");
    const toolbarRow = el("div", "toolbar-panel__row planejamento-toolbar__row");
    const toolbarIntro = el(
      "p",
      "planejamento-toolbar__intro",
      "Sugestões derivadas dos lançamentos existentes. Confirme para criar uma regra ou ignore para ocultar.",
    );
    const toolbarActions = el("div", "toolbar-panel__actions");
    const newRuleButton = el("button", "btn btn--secondary", "Nova regra");
    newRuleButton.type = "button";
    newRuleButton.dataset.action = "new-rule";
    toolbarActions.appendChild(newRuleButton);
    toolbarRow.append(toolbarIntro, toolbarActions);
    toolbar.appendChild(toolbarRow);

    const summaryHost = el("div");
    summaryHost.id = "planejamento-summary-host";
    const suggestionsHost = el("div");
    suggestionsHost.id = "planejamento-suggestions-host";
    const invalidHost = el("div");
    invalidHost.id = "planejamento-invalid-host";
    const occurrencesHost = el("div");
    occurrencesHost.id = "planejamento-occurrences-host";
    const rulesHost = el("div");
    rulesHost.id = "planejamento-rules-host";

    const formHost = el("section", "panel planejamento-form-panel");
    formHost.id = "planejamento-form-host";
    formHost.hidden = true;

    page.append(
      status,
      toolbar,
      summaryHost,
      suggestionsHost,
      invalidHost,
      occurrencesHost,
      rulesHost,
      formHost,
    );
    host.appendChild(page);
    bindPlanejamentoActions(page, data, mutations, rerender);
  }

  if (formMode !== "hidden") {
    const formHost = page.querySelector<HTMLElement>("#planejamento-form-host");
    if (formHost) {
      formHost.hidden = false;
      if (formHost.childElementCount === 0) {
        if (formMode === "edit" && editingRuleId) {
          const rule = (data.recurringRules ?? []).find((item) => item.id === editingRuleId);
          if (rule) {
            mountRuleForm(formHost, data, month, mutations, rerender, rule);
          }
        } else if (formMode === "create") {
          mountRuleForm(formHost, data, month, mutations, rerender);
        }
      }
    }
  }

  refreshPlanejamentoSections(page, data, month);
}
