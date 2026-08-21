import type { MasterDataApiClient } from "@megabin/api-client";

interface IntakeSummary {
  submissionId: string;
  sourceSubmissionId: string;
  status: string;
  matchStatus: string;
  duplicateClassification: string;
  displayName?: string;
  receivedAt: string;
  version: number;
}
interface IntakeDetail extends IntakeSummary {
  sourcePayload: Record<string, unknown>;
  normalizedData?: Record<string, unknown>;
  decision?: Record<string, unknown>;
  approvedDecision?: Record<string, unknown>;
  validationErrors: readonly unknown[];
  activationResult?: Record<string, unknown>;
  history: readonly Record<string, unknown>[];
  serviceRegionId?: string;
}

const escape = (value: unknown) =>
  String(value ?? "—").replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character
  );

export async function renderWebsiteIntakeWorkspace(
  root: HTMLElement,
  api: MasterDataApiClient,
  permissions: readonly string[],
  logout: () => Promise<void>
): Promise<void> {
  let status = "";
  let source = "";
  let duplicateClassification = "";
  let matchStatus = "";
  let serviceRegionId = "";
  let receivedFrom = "";
  let receivedTo = "";
  let selected: IntakeDetail | null = null;
  let message = "";
  const load = async () => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({
      status,
      source,
      duplicateClassification,
      matchStatus,
      serviceRegionId,
      receivedFrom,
      receivedTo
    }))
      if (value) query.set(key, value);
    const result = await api.websiteIntake<{ items: readonly IntakeSummary[] }>(query.toString());
    root.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav><button id="back">Master Data</button><button aria-current="page">Website Intake</button></nav></aside><main><header><div><h1>Website Intake</h1><p>Review website submissions before operational activation.</p></div><button id="logout">Sign out</button></header>
      ${message ? `<div class="notice">${escape(message)}</div>` : ""}
      <div class="toolbar"><select id="intake-status" aria-label="Intake status"><option value="">All statuses</option>${["received", "needs_review", "approved", "rejected", "activated", "invalid", "failed"].map((value) => `<option value="${value}" ${status === value ? "selected" : ""}>${value.replace("_", " ")}</option>`).join("")}</select><select id="intake-source" aria-label="Intake source"><option value="">All sources</option><option value="megabin_website" ${source === "megabin_website" ? "selected" : ""}>MegaBin website</option></select><select id="intake-duplicate" aria-label="Duplicate classification"><option value="">All duplicate classes</option>${["none", "possible", "active_service_duplicate"].map((value) => `<option value="${value}" ${duplicateClassification === value ? "selected" : ""}>${value.replaceAll("_", " ")}</option>`).join("")}</select><select id="intake-match" aria-label="Match status"><option value="">All match states</option>${["no_match", "strong_match", "ambiguous_match"].map((value) => `<option value="${value}" ${matchStatus === value ? "selected" : ""}>${value.replaceAll("_", " ")}</option>`).join("")}</select><input id="intake-region" aria-label="Service region ID" placeholder="Service region ID" value="${escape(serviceRegionId)}"><input id="intake-from" aria-label="Received from" type="date" value="${escape(receivedFrom)}"><input id="intake-to" aria-label="Received to" type="date" value="${escape(receivedTo)}"><button id="intake-apply-filters">Apply filters</button></div>
      <section class="panel"><table><thead><tr><th>Submission</th><th>Client</th><th>Status</th><th>Match / duplicate</th><th></th></tr></thead><tbody>${result.items.map((item) => `<tr><td>${escape(item.sourceSubmissionId)}</td><td>${escape(item.displayName)}</td><td><span class="status">${escape(item.status)}</span></td><td>${escape(item.matchStatus)} · ${escape(item.duplicateClassification)}</td><td><button data-intake="${item.submissionId}">Review</button></td></tr>`).join("")}</tbody></table></section>
      <dialog id="intake-detail"><div id="intake-detail-content"></div></dialog></main></div>`;
    root.querySelector("#logout")?.addEventListener("click", () => void logout());
    root.querySelector<HTMLSelectElement>("#intake-status")?.addEventListener("change", (event) => {
      status = (event.currentTarget as HTMLSelectElement).value;
      void load();
    });
    root.querySelector("#intake-apply-filters")?.addEventListener("click", () => {
      source = root.querySelector<HTMLSelectElement>("#intake-source")?.value ?? "";
      duplicateClassification =
        root.querySelector<HTMLSelectElement>("#intake-duplicate")?.value ?? "";
      matchStatus = root.querySelector<HTMLSelectElement>("#intake-match")?.value ?? "";
      serviceRegionId = root.querySelector<HTMLInputElement>("#intake-region")?.value.trim() ?? "";
      receivedFrom = root.querySelector<HTMLInputElement>("#intake-from")?.value ?? "";
      receivedTo = root.querySelector<HTMLInputElement>("#intake-to")?.value ?? "";
      void load();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-intake]").forEach((button) =>
      button.addEventListener("click", async () => {
        selected = await api.websiteIntakeDetail<IntakeDetail>(button.dataset.intake ?? "");
        showDetail();
      })
    );
  };
  const showDetail = () => {
    if (!selected) return;
    const dialog = root.querySelector<HTMLDialogElement>("#intake-detail");
    const content = root.querySelector<HTMLElement>("#intake-detail-content");
    if (!content) return;
    const submitted = selected.sourcePayload;
    const normalized = selected.normalizedData ?? {};
    const suggestion = selected.decision ?? {};
    const canApprove = permissions.includes("website_intake.approve");
    const canReject = permissions.includes("website_intake.reject");
    const canActivate = permissions.includes("website_intake.activate");
    content.innerHTML = `<h2>Website submission ${escape(selected.sourceSubmissionId)}</h2><div class="status">${escape(selected.status)}</div>
      <div class="detail-grid"><section><h3>Submitted values</h3><pre>${escape(JSON.stringify(submitted, null, 2))}</pre></section><section><h3>Normalized candidates</h3><pre>${escape(JSON.stringify(normalized, null, 2))}</pre></section><section><h3>Existing authoritative matches and suggestions</h3><pre>${escape(JSON.stringify(suggestion, null, 2))}</pre></section><section><h3>Approved values / activation</h3><pre>${escape(JSON.stringify(selected.approvedDecision ?? selected.activationResult ?? {}, null, 2))}</pre></section></div>
      <form id="intake-action"><label>Activation decision (JSON)<textarea name="decision" rows="10">${escape(JSON.stringify(defaultDecision(selected), null, 2))}</textarea></label><label>Reason<input name="reason" placeholder="Required for rejection or override"></label><div class="actions"><button type="button" id="intake-close">Close</button>${canReject ? '<button type="button" data-action="reject">Reject</button>' : ""}${canApprove ? '<button class="button" type="button" data-action="approve">Approve</button>' : ""}${canActivate && selected.status === "approved" ? '<button class="button" type="button" data-action="activate">Activate</button>' : ""}</div></form>`;
    content.querySelector("#intake-close")?.addEventListener("click", () => dialog?.close());
    content.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) =>
      button.addEventListener("click", async () => {
        if (!selected) return;
        const actionForm = content.querySelector<HTMLFormElement>("#intake-action");
        if (!actionForm) return;
        const form = new FormData(actionForm);
        const action = button.dataset.action as "approve" | "reject" | "activate";
        try {
          await api.reviewWebsiteIntake(selected.submissionId, action, {
            expectedVersion: selected.version,
            ...(action !== "activate"
              ? { decision: JSON.parse(String(form.get("decision"))) }
              : {}),
            ...(String(form.get("reason") ?? "") ? { reason: String(form.get("reason")) } : {})
          });
          message = `Intake ${action} succeeded.`;
          dialog?.close();
          await load();
        } catch (cause) {
          message = cause instanceof Error ? cause.message : `Unable to ${action} intake.`;
          dialog?.close();
          await load();
        }
      })
    );
    dialog?.showModal();
  };
  await load();
}

function defaultDecision(detail: IntakeDetail): Record<string, unknown> {
  const submitted = detail.normalizedData ?? {};
  const geography = (detail.decision?.geography as Record<string, unknown> | undefined) ?? {};
  return {
    createClient: true,
    createServiceAddress: true,
    createClientService: true,
    approvedDrumCount: submitted.requestedDrumCount,
    serviceRegionId: geography.serviceRegionId,
    territoryId: geography.suggestedTerritoryId,
    depotId: geography.defaultDepotId,
    defaultTeamId: geography.defaultTeamId,
    collectionDay: geography.collectionDay,
    effectiveStartDate: submitted.requestedStartDate
  };
}
