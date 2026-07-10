/** Helpers de texto e pluralização em português. */

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatItemCount(count: number): string {
  return pluralize(count, "item", "itens");
}

export function formatInvoiceCount(count: number): string {
  return pluralize(count, "fatura", "faturas");
}

export function formatTransactionCount(count: number): string {
  return pluralize(count, "lançamento", "lançamentos");
}

export function formatCardCount(count: number): string {
  return pluralize(count, "cartão", "cartões");
}

export function formatPendingCount(count: number): string {
  return pluralize(count, "pendência", "pendências");
}

export function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  return `${trimmed.charAt(0).toLocaleLowerCase("pt-BR")}${trimmed.slice(1)}`;
}
