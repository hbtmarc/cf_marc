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
  inferRecurrenceClassFromRule,
  ruleEditActionLabel,
  rulesGroupEmptyDescription,
  rulesGroupEmptyTitle,
  rulesGroupHeading,
  suggestionConfirmActionLabel,
  suggestionGroupLabel,
  suggestionGroupOrder,
} from "../recurrence-class";
import {
  createRecurringMatch,
  endRecurringRule,
  pauseRecurringRule,
  removeRecurringMatch,
  removeRecurringMatchById,
  renewRecurringRule,
  resumeRecurringRule,
} from "../recurring-operations";
import {
  openCreateRuleModal,
  openEditRuleModal,
  openUpdateRuleValueModal,
  resetPlanejamentoModalsForTests,
} from "../planejamento-modals";
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
  restoreIgnoredRecurringSuggestion,
} from "../recurring-suggestions";
import { renderEmptyState } from "../presentation";
import { formatItemCount } from "../text";
import { formatCentsToBRL, formatCompetenceLabel, formatDateLabel, nowIso } from "../finance";
import {
  recurringRuleDisplayDescription,
  transactionDisplayDescription,
  transactionDisplayDescriptionForSource,
} from "../transaction-aliases";
import { openTransactionDisplayAliasModal } from "../transaction-alias-modal";
import type { AppData, IgnoredRecurringSuggestion, RecurrenceClass, RecurringRule } from "../types";
import {
  announce,
  el,
  escapeHtml,
  openConfirmModal,
  renderStatusChip,
} from "../ui";

let ruleFilter: RuleFilter = "all";
let linkPanelOccurrenceId: string | null = null;
let lastRenderedCompetenceMonth: string | null = null;
let pageAbort: AbortController | null = null;
let lastIgnoredSuggestionSnapshot: IgnoredRecurringSuggestion | null = null;
const expandedSuggestionGroups = new Set<RecurrenceClass>();
const SUGGESTION_PREVIEW_COUNT = 5;
const HIGH_IMPACT_AMOUNT_CENTS = 50_000;
const PLANEJAMENTO_NEW_RULE_EVENT = "cfm:planejamento-new-rule";

export function renderPlanejamentoHeaderActions(host: HTMLElement): void {
  host.innerHTML = "";
  const actions = el("div", "page-header__actions");
  const newRuleButton = el("button", "btn btn--secondary", "Nova regra");
  newRuleButton.type = "button";
  newRuleButton.dataset.action = "new-rule";
  newRuleButton.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent(PLANEJAMENTO_NEW_RULE_EVENT));
  });
  actions.appendChild(newRuleButton);
  host.appendChild(actions);
}

export function resetPlanejamentoUiStateForTests(): void {
  ruleFilter = "all";
  linkPanelOccurrenceId = null;
  lastRenderedCompetenceMonth = null;
  lastIgnoredSuggestionSnapshot = null;
  expandedSuggestionGroups.clear();
  pageAbort?.abort();
  pageAbort = null;
  resetPlanejamentoModalsForTests();
}

function openNewRuleModal(
  data: AppData,
  month: string,
  mutations: AppMutations,
  rerender: () => void,
): void {
  openCreateRuleModal({ data, month, mutations, onSaved: rerender });
}

function candidatesPanelId(occurrenceId: string): string {
  return `planejamento-candidates-${occurrenceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function renderFactGrid(facts: Array<{ label: string; value: string }>): string {
  return `<dl class="fact-grid">${facts
    .map(
      (fact) => `
    <div class="fact-grid__item">
      <dt class="fact-grid__label">${escapeHtml(fact.label)}</dt>
      <dd class="fact-grid__value">${escapeHtml(fact.value)}</dd>
    </div>`,
    )
    .join("")}</dl>`;
}

function renderPlanejamentoAmount(cents: number, moneyClass: string): string {
  const highImpact = cents >= HIGH_IMPACT_AMOUNT_CENTS;
  return `<span class="planejamento-amount money ${moneyClass}${highImpact ? " planejamento-amount--high-impact" : ""}">${escapeHtml(formatCentsToBRL(cents))}</span>`;
}

function shouldShowWorkflowGuide(summary: ReturnType<typeof buildPlanejamentoSummary>): boolean {
  return (
    summary.pendingSuggestionCount > 0 &&
    summary.projectedCount === 0 &&
    summary.matchedCount === 0
  );
}

function renderWorkflowGuide(): string {
  return `
    <aside class="planejamento-workflow" aria-label="Fluxo do planejamento">
      <ol class="planejamento-workflow__steps">
        <li class="planejamento-workflow__step is-current">
          <span class="planejamento-workflow__index" aria-hidden="true">1</span>
          <span class="planejamento-workflow__label">Confirme as sugestões encontradas</span>
        </li>
        <li class="planejamento-workflow__step">
          <span class="planejamento-workflow__index" aria-hidden="true">2</span>
          <span class="planejamento-workflow__label">Revise as regras mensais</span>
        </li>
        <li class="planejamento-workflow__step">
          <span class="planejamento-workflow__index" aria-hidden="true">3</span>
          <span class="planejamento-workflow__label">Concilie as ocorrências do mês</span>
        </li>
      </ol>
    </aside>`;
}

function renderPendingSuggestionsBanner(summary: ReturnType<typeof buildPlanejamentoSummary>): string {
  if (summary.pendingSuggestionCount === 0) {
    return "";
  }

  const parts = [
    `<strong>${summary.pendingSuggestionCount}</strong> ${summary.pendingSuggestionCount === 1 ? "sugestão aguardando" : "sugestões aguardando"} confirmação`,
  ];
  if (summary.pendingSuggestionExpenseCents > 0) {
    parts.push(
      `<span class="money money--negative">+ ${escapeHtml(formatCentsToBRL(summary.pendingSuggestionExpenseCents))}/mês em despesas</span>`,
    );
  }
  if (summary.pendingSuggestionIncomeCents > 0) {
    parts.push(
      `<span class="money money--positive">+ ${escapeHtml(formatCentsToBRL(summary.pendingSuggestionIncomeCents))}/mês em receitas</span>`,
    );
  }

  const projectedExpenseTotal =
    summary.expenseProjectedCents + summary.pendingSuggestionExpenseCents;
  const totalHint =
    summary.pendingSuggestionExpenseCents > 0
      ? `<p class="planejamento-summary__pending-hint">Se confirmar tudo: despesas previstas chegam a <span class="money money--negative">${escapeHtml(formatCentsToBRL(projectedExpenseTotal))}</span>.</p>`
      : "";

  return `
    <div class="planejamento-summary__pending" role="status">
      <p class="planejamento-summary__pending-main">${parts.join(" · ")}</p>
      ${totalHint}
    </div>`;
}

function renderPlanejamentoStatus(): string {
  if (!lastIgnoredSuggestionSnapshot) {
    return "";
  }
  return `
    <div class="planejamento-undo-banner" role="status">
      <span>Sugestão ignorada.</span>
      <button type="button" class="btn btn--ghost btn--small" data-action="undo-ignore-suggestion">Desfazer</button>
    </div>`;
}

function renderPlanejamentoPanelSection(input: {
  id: string;
  title: string;
  count?: number;
  controls?: string;
  body: string;
}): string {
  const meta =
    input.count !== undefined
      ? `<p class="panel__meta">${escapeHtml(formatItemCount(input.count))}</p>`
      : "";
  return `
    <section class="panel planejamento-section" aria-labelledby="${escapeHtml(input.id)}">
      <header class="panel__header panel__header--split">
        <div class="panel__header-main">
          <h2 class="panel__title" id="${escapeHtml(input.id)}">${escapeHtml(input.title)}</h2>
          ${meta}
        </div>
        ${input.controls ?? ""}
      </header>
      <div class="panel__body panel__body--section">${input.body}</div>
    </section>`;
}

function renderSummaryPanel(data: AppData, month: string): string {
  const summary = buildPlanejamentoSummary(data, month);
  return `
    ${shouldShowWorkflowGuide(summary) ? renderWorkflowGuide() : ""}
    <section class="panel planejamento-summary" aria-labelledby="planejamento-summary-title">
      <div class="panel__header panel__header--compact">
        <h2 class="panel__title" id="planejamento-summary-title">Resumo da competência</h2>
      </div>
      <div class="panel__body panel__body--flush-top">
        ${renderPendingSuggestionsBanner(summary)}
        <div class="dashboard-kpi-grid planejamento-summary__grid">
          <div class="dashboard-kpi">
            <span class="dashboard-kpi__label">Receitas previstas</span>
            <span class="dashboard-kpi__value money money--positive">${escapeHtml(formatCentsToBRL(summary.incomeProjectedCents))}</span>
          </div>
          <div class="dashboard-kpi">
            <span class="dashboard-kpi__label">Despesas previstas</span>
            <span class="dashboard-kpi__value money money--negative">${escapeHtml(formatCentsToBRL(summary.expenseProjectedCents))}</span>
          </div>
          <div class="dashboard-kpi">
            <span class="dashboard-kpi__label">Quantidade prevista</span>
            <span class="dashboard-kpi__value">${summary.projectedCount}</span>
          </div>
          <div class="dashboard-kpi">
            <span class="dashboard-kpi__label">Quantidade conciliada</span>
            <span class="dashboard-kpi__value">${summary.matchedCount}</span>
          </div>
          <div class="dashboard-kpi dashboard-kpi--span-mobile">
            <span class="dashboard-kpi__label">Cobertas por fatura</span>
            <span class="dashboard-kpi__value">${summary.coveredCount}</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderSegmentedControl(input: {
  items: Array<{ value: string; label: string; active: boolean }>;
  action: string;
  dataAttr: string;
  ariaLabel: string;
  className?: string;
}): string {
  const buttons = input.items
    .map((item) => {
      const active = item.active ? " is-active" : "";
      return `<button type="button" class="segmented-control__option${active}" data-action="${escapeHtml(input.action)}" ${input.dataAttr}="${escapeHtml(item.value)}" aria-pressed="${item.active ? "true" : "false"}">${escapeHtml(item.label)}</button>`;
    })
    .join("");
  const className = input.className ? ` ${input.className}` : "";
  return `<div class="segmented-control${className}" role="group" aria-label="${escapeHtml(input.ariaLabel)}">${buttons}</div>`;
}

function formatObservedCompetences(months: readonly string[]): string {
  return months.map((month) => formatCompetenceLabel(month)).join(", ");
}

function renderSuggestionClassControl(
  suggestion: ReturnType<typeof buildRecurringSuggestions>[number],
  groupClass: RecurrenceClass,
): string {
  return `<input type="hidden" data-suggestion-class-value="${escapeHtml(suggestion.id)}" value="${escapeHtml(groupClass)}">`;
}

function renderSuggestionRow(
  data: AppData,
  suggestion: ReturnType<typeof buildRecurringSuggestions>[number],
  groupClass: RecurrenceClass,
  options?: { hidden?: boolean },
): string {
  const displayName = transactionDisplayDescriptionForSource(data, suggestion.description);
  const cardLabel =
    suggestion.billingMode === "card" ? cardNameById(data, suggestion.cardId) : "Cobrança direta";
  const moneyClass = suggestion.kind === "income" ? "money--positive" : "money--negative";
  const billingLabel =
    suggestion.billingMode === "card" ? `Cartão · ${cardLabel}` : cardLabel;
  const confirmLabel = suggestionConfirmActionLabel(groupClass);
  const classControl = renderSuggestionClassControl(suggestion, groupClass);
  return `
    <div class="planejamento-suggestion-row${options?.hidden ? " planejamento-suggestion-row--hidden" : ""}" data-suggestion-id="${escapeHtml(suggestion.id)}">
      <div class="planejamento-suggestion-row__header">
        <div class="planejamento-suggestion-row__identity">
          <strong class="planejamento-suggestion-row__title">${escapeHtml(displayName)}</strong>
          ${renderFactGrid([
            { label: "Categoria", value: suggestion.category },
            { label: "Cobrança", value: billingLabel },
            { label: "Meses", value: formatObservedCompetences(suggestion.competenceMonths) },
            { label: "Dia", value: String(suggestion.dayOfMonth) },
          ])}
        </div>
        <div class="planejamento-suggestion-row__amount">
          ${renderPlanejamentoAmount(suggestion.amountCents, moneyClass)}
        </div>
      </div>
      <div class="planejamento-suggestion-row__footer planejamento-suggestion-row__footer--actions-only">
        ${classControl}
        <div class="planejamento-suggestion-row__actions">
          <button type="button" class="btn btn--primary btn--small" data-action="confirm-suggestion" data-suggestion-id="${escapeHtml(suggestion.id)}">${escapeHtml(confirmLabel)}</button>
          <button type="button" class="btn btn--ghost btn--small" data-action="ignore-suggestion" data-suggestion-id="${escapeHtml(suggestion.id)}">Ignorar</button>
        </div>
      </div>
    </div>
  `;
}

function renderSuggestionGroup(
  data: AppData,
  recurrenceClass: RecurrenceClass,
  items: ReturnType<typeof buildRecurringSuggestions>,
): string {
  const sorted = [...items].sort((left, right) => right.amountCents - left.amountCents);
  const expanded = expandedSuggestionGroups.has(recurrenceClass);
  const hiddenCount = Math.max(0, sorted.length - SUGGESTION_PREVIEW_COUNT);
  const rows = sorted
    .map((item, index) =>
      renderSuggestionRow(data, item, recurrenceClass, {
        hidden: !expanded && index >= SUGGESTION_PREVIEW_COUNT,
      }),
    )
    .join("");

  const expandControl =
    hiddenCount > 0 && !expanded
      ? `<button type="button" class="btn btn--ghost btn--small planejamento-suggestion-group__more" data-action="expand-suggestion-group" data-group-class="${escapeHtml(recurrenceClass)}">Ver mais ${hiddenCount} ${hiddenCount === 1 ? "item" : "itens"}</button>`
      : hiddenCount > 0 && expanded
        ? `<button type="button" class="btn btn--ghost btn--small planejamento-suggestion-group__more" data-action="collapse-suggestion-group" data-group-class="${escapeHtml(recurrenceClass)}">Mostrar menos</button>`
        : "";

  return `
    <div class="planejamento-suggestion-group">
      <div class="planejamento-suggestion-group__head">
        <h3 class="planejamento-suggestion-group__title">${escapeHtml(suggestionGroupLabel(recurrenceClass))}</h3>
        <span class="planejamento-suggestion-group__meta">${sorted.length} ${sorted.length === 1 ? "item" : "itens"} · ${escapeHtml(formatCentsToBRL(sorted.reduce((total, item) => total + item.amountCents, 0)))}/mês</span>
      </div>
      <div class="planejamento-suggestion-group__list">${rows}</div>
      ${expandControl}
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
    .map(([recurrenceClass, items]) => renderSuggestionGroup(data, recurrenceClass, items))
    .join("");

  return renderPlanejamentoPanelSection({
    id: "planejamento-suggestions-title",
    title: "Sugestões encontradas",
    count: suggestions.length,
    body:
      groupBlocks.length > 0
        ? groupBlocks
        : renderEmptyState({
            title: "Nenhuma sugestão no momento",
            description:
              "Lançamentos repetidos em competências distintas aparecerão aqui para você confirmar ou ignorar.",
          }),
  });
}

function renderOccurrenceActionButton(
  resolution: ReturnType<typeof recurringResolutionsForMonth>[number],
  occurrence: ReturnType<typeof recurringResolutionsForMonth>[number]["occurrence"],
  panelId: string,
  isLinkOpen: boolean,
  canLink: boolean,
): string {
  if (canLink) {
    return `<button type="button" class="btn btn--ghost btn--compact" data-action="toggle-link-panel" data-occurrence-id="${escapeHtml(occurrence.id)}" aria-expanded="${isLinkOpen ? "true" : "false"}" aria-controls="${escapeHtml(panelId)}">Vincular</button>`;
  }
  if (resolution.state === "matched") {
    return `<button type="button" class="btn btn--ghost btn--compact" data-action="unlink-match" data-rule-id="${escapeHtml(occurrence.ruleId)}" data-competence-month="${escapeHtml(occurrence.competenceMonth)}">Desvincular</button>`;
  }
  return "";
}

function renderOccurrenceCard(
  data: AppData,
  resolution: ReturnType<typeof recurringResolutionsForMonth>[number],
): string {
  const occurrence = resolution.occurrence;
  const rule = (data.recurringRules ?? []).find((item) => item.id === occurrence.ruleId);
  const panelId = candidatesPanelId(occurrence.id);
  const isLinkOpen = linkPanelOccurrenceId === occurrence.id;
  const canLink = resolution.state === "projected" || resolution.state === "covered_by_invoice";
  const classLabel = rule ? ruleRecurrenceClassLabel(rule) : formatOccurrenceType(occurrence.kind);
  const moneyClass = occurrence.kind === "income" ? "money--positive" : "money--negative";
  const actualValue =
    resolution.state === "matched"
      ? formatCentsToBRL(resolution.actualAmountCents ?? 0)
      : "—";
  const diffValue =
    resolution.state === "matched"
      ? formatRecurringDifferenceLabel(resolution.differenceCents ?? 0)
      : "—";
  const actionButton = renderOccurrenceActionButton(
    resolution,
    occurrence,
    panelId,
    isLinkOpen,
    canLink,
  );
  const candidatesPanel =
    isLinkOpen && canLink ? renderCandidatesPanel(data, occurrence, panelId) : "";

  return `
    <article class="planejamento-occurrence-card" data-occurrence-id="${escapeHtml(occurrence.id)}">
      <div class="planejamento-occurrence-card__header">
        <div class="planejamento-occurrence-card__identity">
          <strong class="planejamento-occurrence-card__title">${escapeHtml(transactionDisplayDescriptionForSource(data, occurrence.description))}</strong>
          ${renderFactGrid([
            { label: "Data esperada", value: formatDateLabel(occurrence.expectedDate) },
            { label: "Classificação", value: classLabel },
            { label: "Realizado", value: actualValue },
            { label: "Diferença", value: diffValue },
          ])}
        </div>
        <div class="planejamento-occurrence-card__amount">
          ${renderPlanejamentoAmount(occurrence.amountCents, moneyClass)}
        </div>
      </div>
      <div class="planejamento-occurrence-card__footer">
        ${renderStatusChip(resolutionStateLabel(resolution.state), resolutionStateVariant(resolution.state))}
        <div class="planejamento-occurrence-card__actions">${actionButton}</div>
      </div>
      ${candidatesPanel}
    </article>
  `;
}

function renderOccurrenceTableRow(
  data: AppData,
  resolution: ReturnType<typeof recurringResolutionsForMonth>[number],
): string {
  const occurrence = resolution.occurrence;
  const rule = (data.recurringRules ?? []).find((item) => item.id === occurrence.ruleId);
  const panelId = candidatesPanelId(occurrence.id);
  const isLinkOpen = linkPanelOccurrenceId === occurrence.id;
  const canLink = resolution.state === "projected" || resolution.state === "covered_by_invoice";
  const classLabel = rule ? ruleRecurrenceClassLabel(rule) : formatOccurrenceType(occurrence.kind);
  const actualCell =
    resolution.state === "matched"
      ? `<span class="money">${escapeHtml(formatCentsToBRL(resolution.actualAmountCents ?? 0))}</span>`
      : "—";
  const diffCell =
    resolution.state === "matched"
      ? escapeHtml(formatRecurringDifferenceLabel(resolution.differenceCents ?? 0))
      : "—";
  const actionCell = renderOccurrenceActionButton(
    resolution,
    occurrence,
    panelId,
    isLinkOpen,
    canLink,
  );
  const candidatesRow =
    isLinkOpen && canLink
      ? `<tr class="planejamento-occurrence-candidates-row"><td colspan="8">${renderCandidatesPanel(data, occurrence, panelId)}</td></tr>`
      : "";

  return `
    <tr class="planejamento-occurrence-row" data-occurrence-id="${escapeHtml(occurrence.id)}">
      <td class="cfm-table__cell--date" data-label="Data esperada">${escapeHtml(formatDateLabel(occurrence.expectedDate))}</td>
      <td class="cfm-table__cell--desc" data-label="Descrição">
        <span class="data-table__primary">${escapeHtml(transactionDisplayDescriptionForSource(data, occurrence.description))}</span>
      </td>
      <td class="cfm-table__cell--class" data-label="Classificação">${escapeHtml(classLabel)}</td>
      <td class="cfm-table__cell--amount" data-label="Previsto">
        <span class="money">${escapeHtml(formatCentsToBRL(occurrence.amountCents))}</span>
      </td>
      <td class="cfm-table__cell--amount" data-label="Realizado">${actualCell}</td>
      <td class="cfm-table__cell--diff" data-label="Diferença">${diffCell}</td>
      <td class="cfm-table__cell--status" data-label="Estado">${renderStatusChip(resolutionStateLabel(resolution.state), resolutionStateVariant(resolution.state))}</td>
      <td class="cfm-table__cell--actions" data-label="Ação">${actionCell}</td>
    </tr>
    ${candidatesRow}
  `;
}

function renderOccurrencesSection(data: AppData, month: string): string {
  const resolutions = recurringResolutionsForMonth(data, month);
  const amountReviews = findAmountMismatchReviews(data, month);

  const reviewRows = amountReviews
    .map(
      (review) => `
        <article class="planejamento-amount-review">
          <p><strong>${escapeHtml(transactionDisplayDescriptionForSource(data, review.occurrence.description))}</strong> — revisão necessária</p>
          <p class="planejamento-amount-review__meta">Previsto: ${escapeHtml(formatCentsToBRL(review.expectedAmountCents))} · Realizado: ${escapeHtml(formatCentsToBRL(review.actualAmountCents))} · ${escapeHtml(formatRecurringDifferenceLabel(review.differenceCents))}</p>
          <div class="planejamento-occurrence__actions">
            <button type="button" class="btn btn--secondary btn--small" data-action="link-amount-review" data-rule-id="${escapeHtml(review.occurrence.ruleId)}" data-transaction-id="${escapeHtml(review.transaction.id)}" data-competence-month="${escapeHtml(review.occurrence.competenceMonth)}">Vincular</button>
            <button type="button" class="btn btn--ghost btn--small" data-action="update-rule-value" data-rule-id="${escapeHtml(review.occurrence.ruleId)}">Atualizar valor</button>
          </div>
        </article>
      `,
    )
    .join("");

  const tableBody = resolutions.map((resolution) => renderOccurrenceTableRow(data, resolution)).join("");
  const cardList =
    resolutions.length > 0
      ? `<div class="planejamento-occurrences-cards" aria-label="Ocorrências do mês">${resolutions.map((resolution) => renderOccurrenceCard(data, resolution)).join("")}</div>`
      : "";

  const tableMarkup =
    resolutions.length > 0
      ? `
        <div class="cfm-table-wrap planejamento-occurrences-wrap planejamento-occurrences-wrap--desktop">
          <table class="cfm-table cfm-table--planejamento-occurrences" aria-label="Ocorrências do mês">
            <thead>
              <tr>
                <th scope="col">Data esperada</th>
                <th scope="col">Descrição</th>
                <th scope="col">Classificação</th>
                <th scope="col">Previsto</th>
                <th scope="col">Realizado</th>
                <th scope="col">Diferença</th>
                <th scope="col">Estado</th>
                <th scope="col"><span class="sr-only">Ação</span></th>
              </tr>
            </thead>
            <tbody>${tableBody}</tbody>
          </table>
        </div>`
      : renderEmptyState({
          title: "Nenhuma ocorrência nesta competência",
          description: "Crie ou reative previsões mensais para gerar ocorrências neste mês.",
        });

  return renderPlanejamentoPanelSection({
    id: "planejamento-occurrences-title",
    title: "Ocorrências do mês",
    count: resolutions.length,
    body: `${reviewRows ? `<div class="planejamento-amount-review-list">${reviewRows}</div>` : ""}${cardList}${tableMarkup}`,
  });
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
          <div class="planejamento-candidate__main">
            <strong class="planejamento-candidate__title">${escapeHtml(transactionDisplayDescription(data, transaction))}</strong>
            ${renderFactGrid([
              { label: "Data", value: formatTransactionDate(transaction) },
              { label: "Categoria", value: transaction.category },
              { label: "Status", value: transactionPlanningStatusLabel(transaction) },
              {
                label: "Origem",
                value: transaction.cardId ? cardNameById(data, transaction.cardId) : "Direta",
              },
            ])}
          </div>
          <div class="planejamento-candidate__aside">
            ${renderPlanejamentoAmount(
              transaction.amountCents,
              transaction.kind === "income" ? "money--positive" : "money--negative",
            )}
            <button type="button" class="btn btn--primary btn--small" data-action="link-match" data-rule-id="${escapeHtml(occurrence.ruleId)}" data-competence-month="${escapeHtml(occurrence.competenceMonth)}" data-transaction-id="${escapeHtml(transaction.id)}">Vincular</button>
          </div>
        </div>
      `,
    )
    .join("");

  return `<div class="planejamento-candidates" id="${escapeHtml(panelId)}" role="region" aria-label="Candidatos compatíveis">${rows}</div>`;
}

function matchedTransactionForRule(
  data: AppData,
  rule: RecurringRule,
  month: string,
) {
  const resolution = recurringResolutionsForMonth(data, month).find(
    (item) => item.occurrence.ruleId === rule.id && item.transactionId,
  );
  if (!resolution?.transactionId) {
    return undefined;
  }
  return data.transactions.find((item) => item.id === resolution.transactionId);
}

function renderRuleRow(data: AppData, rule: RecurringRule, month: string): string {
  const status = ruleDisplayStatus(rule, month);
  const matchedTransaction = matchedTransactionForRule(data, rule, month);
  const displayName = recurringRuleDisplayDescription(data, rule, matchedTransaction);
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
      <div class="planejamento-rule__header">
        <div class="planejamento-rule__main">
          <h3 class="planejamento-rule__title">${escapeHtml(displayName)}</h3>
          ${renderFactGrid([
            { label: "Tipo", value: ruleRecurrenceClassLabel(rule) },
            { label: "Categoria", value: rule.category },
            { label: "Cobrança", value: rule.billingMode === "card" ? `Cartão · ${card}` : billing },
            { label: "Próxima", value: nextMonth ? formatCompetenceLabel(nextMonth) : "—" },
          ])}
          <p class="planejamento-rule__meta planejamento-rule__meta--secondary">Série ${escapeHtml(rule.seriesId ?? rule.id)} · ${escapeHtml(formatRulePeriod(rule))}${renewal ? ` · ${escapeHtml(renewal)}` : ""} · Dia ${rule.dayOfMonth}</p>
        </div>
        <div class="planejamento-rule__amount">
          ${renderPlanejamentoAmount(rule.amountCents, rule.kind === "income" ? "money--positive" : "money--negative")}
          ${renderStatusChip(ruleDisplayStatusLabel(status), statusVariant)}
        </div>
      </div>
      <div class="planejamento-rule__actions">
        <button type="button" class="btn btn--ghost btn--small" data-action="edit-rule" data-rule-id="${escapeHtml(rule.id)}">${escapeHtml(ruleEditActionLabel(rule))}</button>
        ${rule.kind === "expense" ? `<button type="button" class="btn btn--ghost btn--small" data-action="rename-rule-display" data-rule-id="${escapeHtml(rule.id)}">Renomear exibição</button>` : ""}
        ${status === "renewal_pending" ? `<button type="button" class="btn btn--primary btn--small" data-action="renew-rule" data-rule-id="${escapeHtml(rule.id)}">Renovar por 12 meses</button>` : ""}
        ${rule.recurrenceClass === "fixed_bill" || rule.recurrenceClass === "other" ? `<button type="button" class="btn btn--ghost btn--small" data-action="update-rule-value" data-rule-id="${escapeHtml(rule.id)}">Atualizar valor</button>` : ""}
        ${status === "active" || status === "renewal_pending" ? `<button type="button" class="btn btn--ghost btn--small" data-action="pause-rule" data-rule-id="${escapeHtml(rule.id)}">Pausar</button>` : ""}
        ${status === "paused" ? `<button type="button" class="btn btn--ghost btn--small" data-action="resume-rule" data-rule-id="${escapeHtml(rule.id)}">Reativar</button>` : ""}
        ${status !== "ended" ? `<button type="button" class="btn btn--ghost btn--small" data-action="end-rule" data-rule-id="${escapeHtml(rule.id)}">Encerrar</button>` : ""}
      </div>
    </article>
  `;
}

function renderRulesGroup(
  data: AppData,
  month: string,
  recurrenceClass: RecurrenceClass,
  rules: RecurringRule[],
): string {
  const items = rules.filter(
    (rule) => inferRecurrenceClassFromRule(rule) === recurrenceClass,
  );
  const rows =
    items.length > 0
      ? items.map((rule) => renderRuleRow(data, rule, month)).join("")
      : renderEmptyState({
          title: rulesGroupEmptyTitle(recurrenceClass),
          description: rulesGroupEmptyDescription(recurrenceClass),
        });
  return `
    <div class="planejamento-rules-group">
      <h3 class="planejamento-rules-group__title">${escapeHtml(rulesGroupHeading(recurrenceClass))}</h3>
      ${rows}
    </div>`;
}

function renderRulesSection(data: AppData, month: string): string {
  const rules = (data.recurringRules ?? []).filter((rule) =>
    ruleMatchesFilter(rule, ruleFilter, month),
  );
  const groups: RecurrenceClass[] = ["income", "fixed_bill", "card_subscription"];
  const hasOther = rules.some((rule) => inferRecurrenceClassFromRule(rule) === "other");
  if (hasOther) {
    groups.push("other");
  }

  const filterControl = renderSegmentedControl({
    items: (["all", "active", "paused", "ended"] as RuleFilter[]).map((filter) => {
      const label =
        filter === "all"
          ? "Todas"
          : filter === "active"
            ? "Ativas"
            : filter === "paused"
              ? "Pausadas"
              : "Encerradas";
      return { value: filter, label, active: ruleFilter === filter };
    }),
    action: "filter-rules",
    dataAttr: "data-filter",
    ariaLabel: "Filtrar regras",
    className: "segmented-control--rules",
  });

  return renderPlanejamentoPanelSection({
    id: "planejamento-rules-title",
    title: "Regras mensais",
    controls: filterControl,
    body: groups.map((recurrenceClass) => renderRulesGroup(data, month, recurrenceClass, rules)).join(""),
  });
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

function refreshPlanejamentoSections(host: HTMLElement, data: AppData, month: string): void {
  const statusHost = host.querySelector<HTMLElement>("#planejamento-status");
  const summaryHost = host.querySelector<HTMLElement>("#planejamento-summary-host");
  const suggestionsHost = host.querySelector<HTMLElement>("#planejamento-suggestions-host");
  const invalidHost = host.querySelector<HTMLElement>("#planejamento-invalid-host");
  const occurrencesHost = host.querySelector<HTMLElement>("#planejamento-occurrences-host");
  const rulesHost = host.querySelector<HTMLElement>("#planejamento-rules-host");

  if (statusHost) {
    statusHost.innerHTML = renderPlanejamentoStatus();
  }
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

  document.addEventListener(
    PLANEJAMENTO_NEW_RULE_EVENT,
    () => {
      openNewRuleModal(data, month, mutations, rerender);
    },
    { signal },
  );

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
        openNewRuleModal(data, month, mutations, rerender);
        return;
      }

      if (action === "expand-suggestion-group") {
        const groupClass = actionNode.dataset.groupClass as RecurrenceClass | undefined;
        if (!groupClass) {
          return;
        }
        expandedSuggestionGroups.add(groupClass);
        rerender();
        return;
      }

      if (action === "collapse-suggestion-group") {
        const groupClass = actionNode.dataset.groupClass as RecurrenceClass | undefined;
        if (!groupClass) {
          return;
        }
        expandedSuggestionGroups.delete(groupClass);
        rerender();
        return;
      }

      if (action === "undo-ignore-suggestion") {
        if (!lastIgnoredSuggestionSnapshot) {
          return;
        }
        mutations.update((appData) => {
          restoreIgnoredRecurringSuggestion(appData, lastIgnoredSuggestionSnapshot!);
          lastIgnoredSuggestionSnapshot = null;
        });
        announce("Sugestão restaurada.");
        rerender();
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
          const hidden = suggestionRow?.querySelector<HTMLInputElement>(
            "[data-suggestion-class-value]",
          );
          const selectedClass = (hidden?.value ?? suggestion.proposedRecurrenceClass) as RecurrenceClass;
          const result = confirmRecurringSuggestion(appData, suggestionId, {
            recurrenceClass: selectedClass,
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
          const suggestions = buildRecurringSuggestions(appData);
          const suggestion = suggestions.find((item) => item.id === suggestionId);
          if (!suggestion) {
            return;
          }
          if (!ignoreRecurringSuggestion(appData, suggestionId)) {
            return;
          }
          lastIgnoredSuggestionSnapshot = {
            signature: suggestion.signature,
            evidenceFingerprint: suggestion.evidenceFingerprint,
            ignoredAt: nowIso(),
          };
        });
        announce("Sugestão ignorada.");
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
        openUpdateRuleValueModal({ data, month, mutations, onSaved: rerender, rule });
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

      if (action === "rename-rule-display") {
        const ruleId = actionNode.dataset.ruleId;
        const rule = (data.recurringRules ?? []).find((item) => item.id === ruleId);
        if (!rule) {
          return;
        }
        const matchedTransaction = matchedTransactionForRule(data, rule, month);
        openTransactionDisplayAliasModal({
          data,
          sourceDescription: matchedTransaction?.description ?? rule.description,
          mutations,
          onSaved: rerender,
        });
        return;
      }

      if (action === "edit-rule") {
        const ruleId = actionNode.dataset.ruleId;
        const rule = (data.recurringRules ?? []).find((item) => item.id === ruleId);
        if (!rule) {
          return;
        }
        openEditRuleModal({ data, month, mutations, onSaved: rerender, rule });
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

    page.append(
      status,
      summaryHost,
      suggestionsHost,
      invalidHost,
      occurrencesHost,
      rulesHost,
    );
    host.appendChild(page);
    bindPlanejamentoActions(page, data, mutations, rerender);
  }

  refreshPlanejamentoSections(page, data, month);
}
