import { annualCycleEndMonth } from "./recurrence-renewal";
import type {
  AppData,
  RecurrenceClass,
  RecurringBillingMode,
  RecurringRule,
  RecurringRuleKind,
  RenewalPolicy,
} from "./types";
import type { RecurringSuggestion } from "./recurring-suggestions";

export function defaultRecurrenceClassForSuggestion(suggestion: RecurringSuggestion): RecurrenceClass {
  if (suggestion.kind === "income") {
    return "income";
  }
  if (suggestion.billingMode === "card") {
    return "card_subscription";
  }
  return "fixed_bill";
}

export function defaultRenewalPolicyForClass(recurrenceClass: RecurrenceClass): RenewalPolicy {
  return recurrenceClass === "card_subscription" ? "manual_annual" : "none";
}

export function inferRecurrenceClassFromRule(rule: RecurringRule): RecurrenceClass {
  if (rule.recurrenceClass) {
    return rule.recurrenceClass;
  }
  if (rule.kind === "income") {
    return "income";
  }
  if (rule.billingMode === "card") {
    return "card_subscription";
  }
  return "fixed_bill";
}

export function recurrenceClassLabel(recurrenceClass: RecurrenceClass): string {
  switch (recurrenceClass) {
    case "income":
      return "Receita prevista";
    case "fixed_bill":
      return "Fixa";
    case "card_subscription":
      return "Assinatura";
    default:
      return "Outra previsão";
  }
}

export function suggestionGroupLabel(recurrenceClass: RecurrenceClass): string {
  switch (recurrenceClass) {
    case "income":
      return "Receitas previstas";
    case "fixed_bill":
      return "Fixas";
    case "card_subscription":
      return "Assinaturas";
    default:
      return "Outras";
  }
}

export function rulesGroupHeading(recurrenceClass: RecurrenceClass): string {
  return suggestionGroupLabel(recurrenceClass);
}

export function rulesGroupEmptyTitle(recurrenceClass: RecurrenceClass): string {
  switch (recurrenceClass) {
    case "income":
      return "Nenhuma receita prevista";
    case "fixed_bill":
      return "Nenhuma fixa cadastrada";
    case "card_subscription":
      return "Nenhuma assinatura cadastrada";
    default:
      return "Nenhuma outra previsão cadastrada";
  }
}

export function rulesGroupEmptyDescription(recurrenceClass: RecurrenceClass): string {
  switch (recurrenceClass) {
    case "income":
      return "Cadastre uma receita prevista para projetar entradas mensais.";
    case "fixed_bill":
      return "Cadastre uma fixa para projetar saídas mensais diretas.";
    case "card_subscription":
      return "Cadastre uma assinatura para projetar cobranças no cartão.";
    default:
      return "Cadastre outra previsão quando nenhuma classificação padrão se aplicar.";
  }
}

export function ruleEditModalTitle(rule: RecurringRule): string {
  const recurrenceClass = inferRecurrenceClassFromRule(rule);
  if (recurrenceClass === "income") {
    return "Editar receita prevista";
  }
  if (recurrenceClass === "card_subscription") {
    return "Editar assinatura";
  }
  if (recurrenceClass === "fixed_bill") {
    return "Editar fixa";
  }
  return "Editar previsão";
}

export function ruleEditActionLabel(rule: RecurringRule): string {
  const recurrenceClass = inferRecurrenceClassFromRule(rule);
  if (recurrenceClass === "income") {
    return "Editar receita";
  }
  if (recurrenceClass === "card_subscription") {
    return "Editar assinatura";
  }
  if (recurrenceClass === "fixed_bill") {
    return "Editar fixa";
  }
  return "Editar";
}

export function suggestionConfirmActionLabel(recurrenceClass: RecurrenceClass): string {
  switch (recurrenceClass) {
    case "income":
      return "Criar receita prevista";
    case "fixed_bill":
      return "Criar fixa";
    case "card_subscription":
      return "Criar assinatura";
    default:
      return "Criar previsão";
  }
}

export function recurringTransactionAccessibleLabel(recurrenceClass: RecurrenceClass): string {
  switch (recurrenceClass) {
    case "income":
      return "Lançamento de receita prevista";
    case "fixed_bill":
      return "Lançamento de fixa";
    case "card_subscription":
      return "Lançamento de assinatura";
    default:
      return "Lançamento recorrente";
  }
}

export function recurrenceClassForTransaction(
  data: AppData,
  transactionId: string,
): RecurrenceClass | null {
  const match = (data.recurringMatches ?? []).find(
    (item) => item.transactionId === transactionId,
  );
  if (!match) {
    return null;
  }
  const rule = (data.recurringRules ?? []).find((item) => item.id === match.ruleId);
  if (!rule) {
    return null;
  }
  return inferRecurrenceClassFromRule(rule);
}

export function suggestionGroupOrder(recurrenceClass: RecurrenceClass): number {
  switch (recurrenceClass) {
    case "card_subscription":
      return 0;
    case "fixed_bill":
      return 1;
    case "income":
      return 2;
    default:
      return 3;
  }
}

export function allowedRecurrenceClassesForSuggestion(
  suggestion: RecurringSuggestion,
): RecurrenceClass[] {
  if (suggestion.kind === "income") {
    return ["income"];
  }
  if (suggestion.billingMode === "card") {
    return ["card_subscription", "other"];
  }
  return ["fixed_bill", "other"];
}

export function normalizeLegacyRecurringRule(rule: RecurringRule): RecurringRule {
  if (!rule.seriesId) {
    rule.seriesId = rule.id;
  }
  if (!rule.recurrenceClass) {
    rule.recurrenceClass = inferRecurrenceClassFromRule(rule);
  }
  if (!rule.renewalPolicy) {
    rule.renewalPolicy = "none";
  }
  return rule;
}

export function applyRecurrenceClassToRule(
  rule: RecurringRule,
  recurrenceClass: RecurrenceClass,
  selectedCompetenceMonth: string,
): void {
  rule.recurrenceClass = recurrenceClass;
  rule.renewalPolicy = defaultRenewalPolicyForClass(recurrenceClass);
  if (rule.renewalPolicy === "manual_annual") {
    rule.renewedThroughMonth = annualCycleEndMonth(rule.startMonth, selectedCompetenceMonth);
  } else {
    delete rule.renewedThroughMonth;
  }
}

export function billingModeForRecurrenceClass(
  kind: RecurringRuleKind,
  recurrenceClass: RecurrenceClass,
  cardId?: string,
): RecurringBillingMode {
  if (kind === "income") {
    return "direct";
  }
  if (recurrenceClass === "card_subscription") {
    return "card";
  }
  return recurrenceClass === "other" && cardId ? "card" : "direct";
}
