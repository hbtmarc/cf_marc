import type { RecurringRule } from "./types";

export function compareCompetenceMonths(left: string, right: string): number {
  return left.localeCompare(right);
}

export function shiftCompetenceMonth(competenceMonth: string, deltaMonths: number): string {
  const [yearStr, monthStr] = competenceMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const date = new Date(year, month - 1 + deltaMonths, 1);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

export function annualCycleStartContaining(
  firstChargeMonth: string,
  referenceMonth: string,
): string {
  const startMonthPart = firstChargeMonth.split("-")[1]!;
  const [refYearStr, refMonthStr] = referenceMonth.split("-");
  let year = Number(refYearStr);
  if (Number(refMonthStr) < Number(startMonthPart)) {
    year -= 1;
  }
  return `${year}-${startMonthPart}`;
}

export function annualCycleEndMonth(
  firstChargeMonth: string,
  referenceMonth: string,
): string {
  const cycleStart = annualCycleStartContaining(firstChargeMonth, referenceMonth);
  return shiftCompetenceMonth(cycleStart, 11);
}

export function isRenewalExpired(rule: RecurringRule, competenceMonth: string): boolean {
  if (rule.renewalPolicy !== "manual_annual") {
    return false;
  }
  if (!rule.renewedThroughMonth) {
    return true;
  }
  return compareCompetenceMonths(competenceMonth, rule.renewedThroughMonth) > 0;
}

export function isOccurrenceWithinRenewal(
  rule: RecurringRule,
  competenceMonth: string,
): boolean {
  if (rule.renewalPolicy !== "manual_annual") {
    return true;
  }
  if (!rule.renewedThroughMonth) {
    return false;
  }
  return compareCompetenceMonths(competenceMonth, rule.renewedThroughMonth) <= 0;
}

export function renewRuleForTwelveMonths(rule: RecurringRule, referenceMonth: string): void {
  if (rule.renewalPolicy !== "manual_annual") {
    return;
  }
  const baseMonth = rule.renewedThroughMonth ?? referenceMonth;
  rule.renewedThroughMonth = shiftCompetenceMonth(baseMonth, 12);
}
