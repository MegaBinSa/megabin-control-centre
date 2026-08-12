import type { MasterDataApiClient } from "@megabin/api-client";
import type { DailyRosterEntry, DailyRosterModel, ReadinessResult } from "@megabin/daily-roster";
const escapeText = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c
  );
const required = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing roster element ${selector}`);
  return element;
};
export async function renderRosterWorkspace(
  root: HTMLElement,
  api: MasterDataApiClient,
  permissions: readonly string[],
  signOut: () => Promise<void>
): Promise<void> {
  const regions = (await api.list<{ serviceRegionId: string; name: string }>("service-regions"))
    .items;
  const today = new Date().toISOString().slice(0, 10);
  let model: DailyRosterModel | null = null;
  let readiness: ReadinessResult | null = null;
  root.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav><button id="master-data">Master data</button><button aria-current="page">Daily Roster</button><button id="availability">Availability</button></nav></aside><main><header><div><h1>Daily Operational Roster</h1><p>Day-specific teams, people, vehicles and depots</p></div><button id="logout">Sign out</button></header><div class="roster-toolbar"><label>Service date<input id="roster-date" type="date" value="${today}"></label><label>Service region<select id="roster-region">${regions.map((r) => `<option value="${r.serviceRegionId}">${escapeText(r.name)}</option>`).join("")}</select></label>${permissions.includes("roster.generate") ? '<button class="button" id="generate">Generate roster</button>' : ""}<button id="refresh">Refresh</button></div><div id="roster-content" class="panel"><div class="empty">Choose a date and generate or load its roster.</div></div><dialog id="entry-dialog"><form id="entry-form"><h2>Daily assignment</h2><input name="entryId" type="hidden"><input name="expectedUpdatedAt" type="hidden"><label>Vehicle ID<input name="assignedVehicleId"></label><label>Depot ID<input name="assignedDepotId"></label><label>Staff IDs (comma separated)<textarea name="staffIds"></textarea></label><label>Substitution / emergency reason<textarea name="reason"></textarea></label><div class="actions"><button type="button" id="entry-cancel">Cancel</button><button class="button">Save assignment</button></div></form></dialog><dialog id="availability-dialog"><form id="availability-form"><h2>Planned availability</h2><label>Resource type<select name="kind"><option value="staff">Staff absence</option><option value="vehicle">Vehicle unavailability</option></select></label><label>Resource ID<input name="resourceId" required></label><label>Starts<input name="startsAt" type="datetime-local" required></label><label>Ends<input name="endsAt" type="datetime-local" required></label><label>Status<select name="status"><option value="unavailable">Unavailable</option><option value="limited">Limited</option><option value="maintenance">Maintenance</option></select></label><label>Reason<input name="reason" required></label><label>Note<textarea name="note"></textarea></label><div id="availability-list"></div><div class="actions"><button type="button" id="availability-close">Close</button><button class="button">Save window</button></div></form></dialog></main></div>`;
  document.querySelector("#logout")?.addEventListener("click", () => void signOut());
  document.querySelector("#master-data")?.addEventListener("click", () => location.reload());
  const context = () => ({
    serviceRegionId: required<HTMLSelectElement>("#roster-region").value,
    serviceDate: required<HTMLInputElement>("#roster-date").value
  });
  const load = async () => {
    const c = context();
    model = await api.findRoster<DailyRosterModel>(c.serviceRegionId, c.serviceDate);
    readiness = model
      ? await api.validateRoster<ReadinessResult>(model.operationalDay.operationalDayId)
      : null;
    paint();
  };
  const paint = () => {
    const content = required("#roster-content");
    if (!model) {
      content.innerHTML =
        '<div class="empty">No operational day exists for this region and date.</div>';
      return;
    }
    const day = model.operationalDay;
    content.innerHTML = `<div class="roster-summary"><div><span class="status roster-${day.lifecycleStatus}">${day.lifecycleStatus}</span><strong>${readiness?.ready ? "Ready checks pass" : `${readiness?.issues.length ?? 0} blocking issue(s)`}</strong></div><div class="actions">${day.lifecycleStatus === "draft" ? '<button id="mark-ready">Mark Ready</button>' : ""}${day.lifecycleStatus === "ready" ? '<button class="button" id="lock-roster">Lock roster</button>' : ""}${day.lifecycleStatus === "locked" && permissions.includes("roster.unlock") ? '<button id="unlock-roster">Unlock</button>' : ""}</div></div>${readiness?.issues.length ? `<div class="error">${readiness.issues.map((i) => escapeText(i.code)).join(", ")}</div>` : ""}<div class="roster-grid">${model.entries.map(entryCard).join("") || '<div class="empty">No active teams were generated.</div>'}</div>`;
    document
      .querySelectorAll<HTMLButtonElement>("[data-entry]")
      .forEach((b) => (b.onclick = () => openEntry(b.dataset.entry ?? "")));
    document
      .querySelector("#mark-ready")
      ?.addEventListener("click", () => void transition("ready"));
    document
      .querySelector("#lock-roster")
      ?.addEventListener("click", () => void transition("locked"));
    document.querySelector("#unlock-roster")?.addEventListener("click", () => {
      const reason = prompt("Reason for unlocking this roster?");
      if (reason) void transition("ready", reason);
    });
  };
  const entryCard = (entry: DailyRosterEntry) =>
    `<article class="roster-card"><header><h3>${escapeText(entry.teamName)}</h3><span class="status">${entry.availabilityState}</span></header><dl><dt>Vehicle</dt><dd>${escapeText(entry.vehicleName ?? "Unassigned")}${entry.vehicleIsSubstitution ? ' <strong class="substitution">Substitute</strong>' : ""}</dd><dt>Depot</dt><dd>${escapeText(entry.depotName ?? "Unassigned")}${entry.depotIsOverride ? ' <strong class="substitution">Override</strong>' : ""}</dd><dt>Staff</dt><dd>${entry.staff.map((s) => `${escapeText(s.displayName)} (${escapeText(s.assignmentRole)})${s.isSubstitution ? ' <strong class="substitution">Substitute</strong>' : ""}`).join("<br>") || "No staff"}</dd></dl>${permissions.includes("roster.write") && model?.operationalDay.lifecycleStatus !== "locked" ? `<button data-entry="${entry.dailyRosterEntryId}">Edit daily assignment</button>` : ""}</article>`;
  const transition = async (target: string, reason?: string) => {
    if (!model) return;
    await api.transitionRoster(model.operationalDay.operationalDayId, {
      target,
      reason,
      expectedUpdatedAt: model.operationalDay.updatedAt
    });
    await load();
  };
  const dialog = required<HTMLDialogElement>("#entry-dialog"),
    form = required<HTMLFormElement>("#entry-form");
  const openEntry = (id: string) => {
    const entry = model?.entries.find((e) => e.dailyRosterEntryId === id);
    if (!entry) return;
    (form.elements.namedItem("entryId") as HTMLInputElement).value = id;
    (form.elements.namedItem("expectedUpdatedAt") as HTMLInputElement).value = entry.updatedAt;
    (form.elements.namedItem("assignedVehicleId") as HTMLInputElement).value =
      entry.assignedVehicleId ?? "";
    (form.elements.namedItem("assignedDepotId") as HTMLInputElement).value =
      entry.assignedDepotId ?? "";
    (form.elements.namedItem("staffIds") as HTMLTextAreaElement).value = entry.staff
      .map((s) => s.staffId)
      .join(", ");
    (form.elements.namedItem("reason") as HTMLTextAreaElement).value = "";
    dialog.showModal();
  };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    await api.updateRosterEntry(String(data.get("entryId")), {
      assignedVehicleId: data.get("assignedVehicleId") || null,
      assignedDepotId: data.get("assignedDepotId") || null,
      staffIds: String(data.get("staffIds"))
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      reason: data.get("reason") || null,
      expectedUpdatedAt: data.get("expectedUpdatedAt")
    });
    dialog.close();
    await load();
  });
  document.querySelector("#entry-cancel")?.addEventListener("click", () => dialog.close());
  document.querySelector("#generate")?.addEventListener("click", async () => {
    const c = context();
    model = await api.generateRoster<DailyRosterModel>(c.serviceRegionId, c.serviceDate);
    readiness = await api.validateRoster<ReadinessResult>(model.operationalDay.operationalDayId);
    paint();
  });
  document.querySelector("#refresh")?.addEventListener("click", () => void load());
  const availabilityDialog = required<HTMLDialogElement>("#availability-dialog"),
    availabilityForm = required<HTMLFormElement>("#availability-form");
  document.querySelector("#availability")?.addEventListener("click", async () => {
    const c = context();
    const from = `${c.serviceDate}T00:00:00Z`,
      to = `${c.serviceDate}T23:59:59Z`;
    const windows = await api.availabilityWindows<{
      staff: readonly Record<string, unknown>[];
      vehicles: readonly Record<string, unknown>[];
    }>(c.serviceRegionId, from, to);
    required("#availability-list").innerHTML = [...windows.staff, ...windows.vehicles]
      .map((w) => `<p>${escapeText(String(w.displayName))}: ${escapeText(String(w.reason))}</p>`)
      .join("");
    availabilityDialog.showModal();
  });
  document
    .querySelector("#availability-close")
    ?.addEventListener("click", () => availabilityDialog.close());
  availabilityForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(availabilityForm);
    const kind = String(data.get("kind")) as "staff" | "vehicle";
    await api.saveAvailability(kind, {
      serviceRegionId: context().serviceRegionId,
      [kind === "staff" ? "staffId" : "vehicleId"]: data.get("resourceId"),
      startsAt: new Date(String(data.get("startsAt"))).toISOString(),
      endsAt: new Date(String(data.get("endsAt"))).toISOString(),
      fullDay: false,
      status: data.get("status"),
      reason: data.get("reason"),
      note: data.get("note")
    });
    availabilityDialog.close();
  });
  await load();
}
