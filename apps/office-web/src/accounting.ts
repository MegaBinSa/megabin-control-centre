import type { MasterDataApiClient } from "@megabin/api-client";
const esc = (v: unknown) =>
  String(v ?? "—").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c
  );
interface Health {
  provider?: string;
  status: string;
  lastSuccessfulSync?: string;
  summary?: string;
}
interface Status {
  clientId: string;
  clientName: string;
  accountStatus: string;
  derivedStatus: string;
  isStale: boolean;
  lastSync: string;
  exception?: { status: string; reason: string } | null;
}
interface Queue {
  provider: string;
  providerCustomerId: string;
  classification: string;
  candidateClientIds: string[];
  customer?: Record<string, unknown>;
}
interface Detail {
  clientId: string;
  provider: string;
  providerCustomerId: string;
  accountStatus: string;
  derivedStatus: string;
  freshness: string;
  lastSync: string;
  financial?: {
    currency: string;
    totalOutstandingMinor: number;
    overdueOutstandingMinor: number;
    daysOverdue: number;
    agingBucket: string;
    invoices: unknown[];
    payments: unknown[];
  };
  eligibility: Record<string, unknown>;
  exception?: Record<string, unknown>;
}
export async function renderAccountingWorkspace(
  root: HTMLElement,
  api: MasterDataApiClient,
  permissions: readonly string[],
  logout: () => Promise<void>
) {
  let message = "";
  const load = async () => {
    const [health, statuses, queue, runs] = await Promise.all([
      api.accountingHealth<Health>(),
      api.accountStatuses<{ items: Status[] }>(),
      permissions.includes("accounting.reconcile")
        ? api.accountingReconciliation<{ items: Queue[] }>()
        : Promise.resolve({ items: [] }),
      permissions.includes("accounting.sync")
        ? api.accountingSyncRuns<{ items: Record<string, unknown>[] }>()
        : Promise.resolve({ items: [] })
    ]);
    root.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav><button id="back">Master Data</button><button aria-current="page">Accounting</button></nav></aside><main><header><div><h1>Accounting & Account Status</h1><p>Operational projections from provider-owned financial facts.</p></div><button id="logout">Sign out</button></header>${message ? `<div class="notice">${esc(message)}</div>` : ""}<section class="panel"><h2>Provider connection</h2><p><span class="status">${esc(health.status)}</span> ${esc(health.provider)} · Last success ${esc(health.lastSuccessfulSync)} · ${esc(health.summary)}</p>${permissions.includes("accounting.sync") ? '<button class="button" id="sync">Start manual incremental sync</button>' : ""}</section><section class="panel"><h2>Client account status</h2><table><thead><tr><th>Client</th><th>Status</th><th>Freshness</th><th>Last sync</th><th></th></tr></thead><tbody>${statuses.items.map((s) => `<tr><td>${esc(s.clientName)}</td><td>${esc(s.accountStatus)}</td><td>${s.isStale ? "Stale" : "Current"}</td><td>${esc(s.lastSync)}</td><td><button data-client="${s.clientId}">Open</button></td></tr>`).join("")}</tbody></table></section>${permissions.includes("accounting.reconcile") ? `<section class="panel"><h2>Reconciliation queue</h2><table><tbody>${queue.items.map((q) => `<tr><td>${esc(q.providerCustomerId)}</td><td>${esc(q.classification)}</td><td>${esc(JSON.stringify(q.customer ?? {}))}</td><td>${q.candidateClientIds[0] ? `<button data-map="${esc(q.provider)}|${esc(q.providerCustomerId)}|${q.candidateClientIds[0]}">Link candidate</button>` : "Follow up required"}</td></tr>`).join("")}</tbody></table></section>` : ""}<section class="panel"><h2>Sync runs</h2><pre>${esc(JSON.stringify(runs.items, null, 2))}</pre></section><dialog id="account-detail"><div id="account-content"></div></dialog></main></div>`;
    root.querySelector("#logout")?.addEventListener("click", () => void logout());
    root.querySelector("#back")?.addEventListener("click", () => location.reload());
    root.querySelector("#sync")?.addEventListener("click", async () => {
      await api.startAccountingSync("incremental");
      message = "Accounting sync queued; the browser is not waiting for provider completion.";
      await load();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-map]").forEach((b) =>
      b.addEventListener("click", async () => {
        const [p, c, id] = (b.dataset.map ?? "").split("|");
        await api.reconcileAccountingCustomer(p ?? "", c ?? "", {
          action: "link",
          clientId: id,
          reason: "Confirmed Office reconciliation"
        });
        message = "Accounting customer mapped.";
        await load();
      })
    );
    root
      .querySelectorAll<HTMLButtonElement>("[data-client]")
      .forEach((b) =>
        b.addEventListener("click", async () =>
          show(await api.clientAccounting<Detail>(b.dataset.client ?? ""))
        )
      );
  };
  const show = (d: Detail) => {
    const dialog = root.querySelector<HTMLDialogElement>("#account-detail"),
      content = root.querySelector<HTMLElement>("#account-content");
    if (!dialog || !content) return;
    const money = (n?: number) =>
      n === undefined ? "Restricted" : `${d.financial?.currency ?? ""} ${(n / 100).toFixed(2)}`;
    content.innerHTML = `<h2>Account detail</h2><p>Provider reference ${esc(d.providerCustomerId)}</p><div class="detail-grid"><section><h3>Operational status</h3><p class="status">${esc(d.accountStatus)}</p><p>Derived: ${esc(d.derivedStatus)} · ${esc(d.freshness)}</p><pre>${esc(JSON.stringify(d.eligibility, null, 2))}</pre></section><section><h3>Outstanding & aging</h3><p>Total ${money(d.financial?.totalOutstandingMinor)}</p><p>Overdue ${money(d.financial?.overdueOutstandingMinor)}</p><p>${esc(d.financial?.daysOverdue)} days · ${esc(d.financial?.agingBucket)}</p></section></div>${d.financial ? `<h3>Invoices</h3><pre>${esc(JSON.stringify(d.financial.invoices, null, 2))}</pre><h3>Payments</h3><pre>${esc(JSON.stringify(d.financial.payments, null, 2))}</pre>` : ""}${permissions.includes("accounting.exception.manage") ? '<form id="exception"><label>Status<select name="status"><option value="manual_review">Manual Review</option><option value="current">Temporarily Current</option><option value="unknown">Unknown</option></select></label><label>Reason<input name="reason" required minlength="3"></label><button class="button">Apply exception</button><button type="button" id="remove-exception">Remove exception</button></form>' : ""}<button id="close">Close</button>`;
    content.querySelector("#close")?.addEventListener("click", () => dialog.close());
    content.querySelector<HTMLFormElement>("#exception")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget as HTMLFormElement);
      await api.setAccountException(d.clientId, {
        status: f.get("status"),
        reason: f.get("reason")
      });
      message = "Manual account exception applied without changing provider facts.";
      dialog.close();
      await load();
    });
    content.querySelector("#remove-exception")?.addEventListener("click", async () => {
      await api.removeAccountException(d.clientId, "Office exception removed");
      message = "Manual exception removed; derived status restored.";
      dialog.close();
      await load();
    });
    dialog.showModal();
  };
  await load();
}
