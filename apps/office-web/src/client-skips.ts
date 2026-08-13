import type { MasterDataApiClient } from "@megabin/api-client";
const esc = (value: unknown) =>
  String(value ?? "—").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c
  );
interface SkipRequest {
  requestId: string;
  clientName: string;
  serviceAddress: string;
  collectionDate: string;
  receivedAt: string;
  channel: string;
  matchState: string;
  status: string;
  cutoffStatus: string;
  reviewVersion: number;
  acknowledgementIntentId?: string;
  routeImpact?: {
    routeVersions?: { routeVersionId: string; status: string; isStale: boolean }[];
    routeOperations?: { routeOperationId: string; status: string }[];
  };
}

export async function renderClientSkipWorkspace(
  root: HTMLElement,
  api: MasterDataApiClient,
  permissions: readonly string[],
  logout: () => Promise<void>
) {
  let items: readonly SkipRequest[] = [],
    message = "",
    selected: SkipRequest | undefined;
  const load = async () => {
    items = (await api.clientSkipRequests<{ items: SkipRequest[] }>()).items;
    render();
  };
  const render = () => {
    root.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav><button id="back">Master Data</button><button aria-current="page">Client SKIP</button></nav></aside><main><header><div><h1>Client SKIP requests</h1><p>One-occurrence review · controlled replanning · client-safe acknowledgement</p></div><button id="logout">Sign out</button></header>${message ? `<div class="notice">${esc(message)}</div>` : ""}<section class="panel"><div class="toolbar"><select id="filter"><option value="">All requests</option><option value="needs_review">Needs review</option><option value="qualified">Qualified</option><option value="applied">Applied</option></select></div><table><thead><tr><th>Received</th><th>Client / service</th><th>Collection</th><th>Qualification</th><th>Cutoff</th><th>Route impact</th><th>Decision</th></tr></thead><tbody>${items.map((i) => `<tr><td>${esc(i.receivedAt)}<br><small>${esc(i.channel)}</small></td><td>${esc(i.clientName)}<br><small>${esc(i.serviceAddress)}</small></td><td>${esc(i.collectionDate)}</td><td>${esc(i.matchState)}</td><td><span class="status">${esc(i.cutoffStatus)}</span></td><td>${esc([...(i.routeImpact?.routeVersions ?? []).map((v) => v.status), ...(i.routeImpact?.routeOperations ?? []).map((o) => o.status)].join(", ") || "No existing route")}</td><td><button data-open="${i.requestId}">${esc(i.status)}</button></td></tr>`).join("") || '<tr><td colspan="7">No SKIP requests.</td></tr>'}</tbody></table></section><dialog id="review"><form id="review-form"><h2>Review client SKIP</h2><p id="summary"></p><label>Reason / context<textarea name="reason" required minlength="3"></textarea></label><div class="actions"><button type="button" id="close">Close</button>${permissions.includes("client_skip.reject") ? '<button type="button" id="reject">Reject</button>' : ""}${permissions.includes("client_skip.approve") ? '<button class="button" type="submit">Approve one-day SKIP</button>' : ""}${permissions.includes("client_skip.replan") ? '<button type="button" id="replan">Create Draft replan</button>' : ""}</div></form></dialog></main></div>`;
    root.querySelector("#logout")?.addEventListener("click", () => void logout());
    root.querySelector("#back")?.addEventListener("click", () => location.reload());
    const dialog = root.querySelector<HTMLDialogElement>("#review"),
      form = root.querySelector<HTMLFormElement>("#review-form");
    root.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((b) =>
      b.addEventListener("click", () => {
        selected = items.find((i) => i.requestId === b.dataset.open);
        const s = root.querySelector("#summary");
        if (s && selected)
          s.textContent = `${selected.clientName} · ${selected.collectionDate} · ${selected.cutoffStatus} · ${selected.status}`;
        dialog?.showModal();
      })
    );
    root.querySelector("#close")?.addEventListener("click", () => dialog?.close());
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!selected) return;
      const reason = String(new FormData(form).get("reason"));
      await api.approveClientSkip(selected.requestId, {
        expectedVersion: selected.reviewVersion,
        reason
      });
      message = "One-occurrence exclusion applied; acknowledgement queued.";
      dialog?.close();
      await load();
    });
    root.querySelector("#reject")?.addEventListener("click", async () => {
      if (!selected || !form) return;
      await api.rejectClientSkip(selected.requestId, {
        expectedVersion: selected.reviewVersion,
        reason: String(new FormData(form).get("reason"))
      });
      message = "SKIP request rejected; client-safe acknowledgement queued.";
      dialog?.close();
      await load();
    });
    root.querySelector("#replan")?.addEventListener("click", async () => {
      if (!selected || !form) return;
      await api.replanClientSkip(selected.requestId, {
        reason: String(new FormData(form).get("reason"))
      });
      message = "A new Draft route candidate was created; the prior version is preserved.";
      dialog?.close();
      await load();
    });
  };
  await load();
}
