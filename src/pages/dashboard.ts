import type { AppData } from "../types";
import type { AppMutations } from "../forms";
import {
  renderDashboardFixedBillsPanel,
  renderDashboardInvoicesPanel,
  renderDashboardSituationPanel,
} from "../presentation";
import { calculateCompetenceSummary } from "../finance";
import {
  buildDashboardCardSummary,
  buildDashboardFixedBills,
} from "../dashboard-executive";
import { navigate } from "../router";
import { openInvoiceDetailView } from "./faturas";

export function renderDashboard(
  host: HTMLElement,
  data: AppData,
  _mutations: AppMutations,
  _rerender: () => void,
): void {
  const month = data.selectedCompetenceMonth;
  const summary = calculateCompetenceSummary(data, month);
  const fixedBills = buildDashboardFixedBills(data, month);
  const invoices = buildDashboardCardSummary(data, month);

  host.innerHTML = `
    <div class="dashboard-page">
      ${renderDashboardSituationPanel(summary)}
      ${renderDashboardFixedBillsPanel(fixedBills)}
      ${renderDashboardInvoicesPanel(invoices)}
    </div>
  `;

  bindDashboardInvoiceActions(host);
}

function bindDashboardInvoiceActions(host: HTMLElement): void {
  host.querySelectorAll<HTMLButtonElement>('[data-action="view-invoice"]').forEach((button) => {
    button.addEventListener("click", () => {
      const invoiceId = button.dataset.invoiceId;
      if (invoiceId) {
        openInvoiceDetailView(invoiceId);
      }
      navigate("/faturas");
    });
  });
}
