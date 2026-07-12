import { annualCycleEndMonth } from "./recurrence-renewal";
import type {
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
      return "Receita recorrente";
    case "fixed_bill":
      return "Conta fixa";
    case "card_subscription":
      return "Assinatura no cartão";
    default:
      return "Outra recorrência";
  }
}

export function suggestionGroupLabel(recurrenceClass: RecurrenceClass): string {
  return recurrenceClassLabel(recurrenceClass);
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
