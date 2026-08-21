import type { MasterDataApiClient } from "@megabin/api-client";
const esc = (value: unknown) =>
  String(value ?? "—").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c
  );
interface Item {
  clientServiceId: string;
  clientName: string;
  serviceAddress: string;
  accountStatus: string;
  freshness: string;
  decisionStatus: string;
  reasonCode: string;
  decisionVersion: number;
  activeHold: boolean;
  override?: { version: number };
}
export async function renderFinancialEligibilityWorkspace(
  root: HTMLElement,
  api: MasterDataApiClient,
  permissions: readonly string[],
  logout: () => Promise<void>
) {
  let items: readonly Item[] = [],
    message = "";
  const load = async () => {
    const response = await api.financialEligibilityDecisions<{ items: Item[] }>();
    items = response.items;
    render();
  };
  const render = () => {
    root.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav><button id="back">Master Data</button><button aria-current="page">Financial Eligibility</button></nav></aside><main><header><div><h1>Financial Eligibility</h1><p>Explicit service decisions · accounting facts remain unchanged</p></div><button id="logout">Sign out</button></header>${message ? `<div class="notice">${esc(message)}</div>` : ""}<section class="panel"><div class="toolbar"><button id="batch">Reevaluate stale/review cases</button><span class="status">Auto-hold disabled by default</span></div></section><section class="panel"><table><thead><tr><th>Client / service</th><th>Accounting</th><th>Decision</th><th>Reason</th><th>Actions</th></tr></thead><tbody>${items.map((i) => `<tr><td><strong>${esc(i.clientName)}</strong><small>${esc(i.serviceAddress)}</small></td><td>${esc(i.accountStatus)} · <span class="${i.freshness === "current" ? "status" : "warning"}">${esc(i.freshness)}</span></td><td>${esc(i.decisionStatus)} v${i.decisionVersion}${i.activeHold ? " · active hold" : ""}</td><td>${esc(i.reasonCode)}</td><td><button data-preview="${i.clientServiceId}">Preview</button>${permissions.includes("financial_eligibility.hold") && !i.activeHold ? `<button data-hold="${i.clientServiceId}" data-version="${i.decisionVersion}">Hold</button>` : ""}${permissions.includes("financial_eligibility.release") && i.activeHold ? `<button data-release="${i.clientServiceId}" data-version="${i.decisionVersion}">Release</button>` : ""}<button data-reevaluate="${i.clientServiceId}">Reevaluate</button></td></tr>`).join("") || '<tr><td colspan="5">No evaluated services yet.</td></tr>'}</tbody></table></section><dialog id="detail"><div id="detail-body"></div><button id="close">Close</button></dialog></main></div>`;
    root.querySelector("#logout")?.addEventListener("click", () => void logout());
    root
      .querySelector("#close")
      ?.addEventListener("click", () => root.querySelector<HTMLDialogElement>("#detail")?.close());
    root.querySelector("#batch")?.addEventListener("click", async () => {
      await api.startFinancialEligibilityBatch({ scopeType: "stale_review" });
      message = "Bounded reevaluation queued.";
      render();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-preview]").forEach((b) =>
      b.addEventListener("click", async () => {
        const serviceId = b.dataset.preview;
        if (!serviceId) return;
        const p = await api.simulateFinancialEligibility<Record<string, unknown>>(serviceId);
        const body = root.querySelector<HTMLElement>("#detail-body");
        if (body)
          body.innerHTML = `<h2>Policy preview</h2><pre>${esc(JSON.stringify(p, null, 2))}</pre><p>No decision was committed.</p>`;
        root.querySelector<HTMLDialogElement>("#detail")?.showModal();
      })
    );
    root.querySelectorAll<HTMLButtonElement>("[data-hold]").forEach((b) =>
      b.addEventListener("click", async () => {
        const reason = prompt("Reason for financial hold");
        if (!reason) return;
        const serviceId = b.dataset.hold;
        if (!serviceId) return;
        await api.holdFinancialService(serviceId, {
          reason,
          expectedVersion: Number(b.dataset.version)
        });
        message = "Financial hold activated; route impacts are reviewable.";
        await load();
      })
    );
    root.querySelectorAll<HTMLButtonElement>("[data-release]").forEach((b) =>
      b.addEventListener("click", async () => {
        const reason = prompt("Reason for release");
        if (!reason) return;
        const serviceId = b.dataset.release;
        if (!serviceId) return;
        await api.releaseFinancialService(serviceId, {
          reason,
          expectedVersion: Number(b.dataset.version)
        });
        message = "Hold released with history preserved.";
        await load();
      })
    );
    root.querySelectorAll<HTMLButtonElement>("[data-reevaluate]").forEach((b) =>
      b.addEventListener("click", async () => {
        const serviceId = b.dataset.reevaluate;
        if (!serviceId) return;
        await api.reevaluateFinancialEligibility(serviceId);
        message = "Service reevaluated.";
        await load();
      })
    );
  };
  await load();
}
