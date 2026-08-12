import type { MasterDataApiClient } from "@megabin/api-client";

interface Operation {
  readonly routeOperationId: string;
  readonly lifecycleStatus: string;
  readonly assignmentRevision: number;
  readonly manifestRevision: number;
  readonly currentTeamId: string;
  readonly currentVehicleId: string;
  readonly acceptedAt?: string | null;
  readonly startedAt?: string | null;
  readonly manifest?: {
    readonly team?: { readonly name?: string };
    readonly vehicle?: { readonly displayName?: string };
    readonly staff?: readonly { readonly displayName?: string }[];
  };
}

const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character
  );

export async function renderRouteOperationsWorkspace(
  root: HTMLElement,
  api: MasterDataApiClient,
  permissions: readonly string[],
  signOut: () => Promise<void>
): Promise<void> {
  const regions = (await api.list<{ serviceRegionId: string; name: string }>("service-regions"))
    .items;
  let operations: readonly Operation[] = [];
  let error = "";
  let selectedRegion = regions[0]?.serviceRegionId ?? "";
  let selectedDate = "";
  const render = () => {
    root.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav><button id="master">Master Data</button><button id="roster">Daily Roster</button><button id="routes">Route Planning</button><button aria-current="page">Route Operations</button></nav></aside><main>
      <header><div><h1>Route Operations</h1><p>Published-route handoff and day-of-operation assignments</p></div><button id="logout">Sign out</button></header>
      ${error ? `<div class="error">${escape(error)}</div>` : ""}
      <section class="panel"><div class="toolbar"><label>Region<select id="region">${regions.map((region) => `<option value="${region.serviceRegionId}" ${region.serviceRegionId === selectedRegion ? "selected" : ""}>${escape(region.name)}</option>`).join("")}</select></label><label>Service date<input id="date" type="date" value="${escape(selectedDate)}"></label><button id="load">Load operations</button></div>
      ${permissions.includes("route_operations.create") ? '<div class="toolbar"><label>Published Route Version ID<input id="published-version" placeholder="UUID"></label><button class="button" id="handoff">Hand off published route</button></div>' : ""}</section>
      <section class="panel"><h2>Operations by team</h2>${operations.length ? operations.map((operation) => `<article class="route-card"><h3>${escape(operation.manifest?.team?.name ?? operation.currentTeamId)}</h3><p><span class="status">${escape(operation.lifecycleStatus)}</span> · ${escape(operation.manifest?.vehicle?.displayName ?? operation.currentVehicleId)}</p><p>Staff: ${escape(operation.manifest?.staff?.map((staff) => staff.displayName).join(", ") || "Unassigned")}</p><p>Assignment revision ${operation.assignmentRevision} · Manifest revision ${operation.manifestRevision}</p><p>Accepted: ${operation.acceptedAt ? "Yes" : "No"} · Started: ${operation.startedAt ? "Yes" : "No"}</p>${permissions.includes("route_operations.reassign") && ["prepared", "assigned", "available"].includes(operation.lifecycleStatus) ? `<button data-reassign="${operation.routeOperationId}">Reassign</button>` : ""}</article>`).join("") : '<div class="empty">No route operations for this date.</div>'}</section>
      <dialog id="reassign-dialog"><form id="reassign-form"><h2>Reassign route operation</h2><input type="hidden" name="routeOperationId"><input type="hidden" name="expectedAssignmentRevision"><label>Team ID<input name="teamId" required></label><label>Vehicle ID<input name="vehicleId" required></label><label>Staff IDs (comma separated)<input name="staffIds" required></label><label>Device ID (optional)<input name="deviceId"></label><label>Reason<textarea name="reason" required></textarea></label><div class="actions"><button type="button" id="cancel-reassign">Cancel</button><button class="button">Save reassignment</button></div></form></dialog>
    </main></div>`;
    const region = root.querySelector<HTMLSelectElement>("#region");
    const date = root.querySelector<HTMLInputElement>("#date");
    const load = async () => {
      if (!region?.value || !date?.value) return;
      selectedRegion = region.value;
      selectedDate = date.value;
      try {
        operations = await api.routeOperations(region.value, date.value);
        error = "";
      } catch (cause) {
        error = cause instanceof Error ? cause.message : "Unable to load route operations.";
      }
      render();
    };
    root.querySelector("#load")?.addEventListener("click", () => void load());
    root.querySelector("#handoff")?.addEventListener("click", async () => {
      const version = root.querySelector<HTMLInputElement>("#published-version")?.value.trim();
      if (!version) return;
      try {
        await api.handoffRouteOperations(version);
        await load();
      } catch (cause) {
        error = cause instanceof Error ? cause.message : "Handoff failed.";
        render();
      }
    });
    const dialog = root.querySelector<HTMLDialogElement>("#reassign-dialog");
    root.querySelectorAll<HTMLButtonElement>("[data-reassign]").forEach((button) =>
      button.addEventListener("click", () => {
        const operation = operations.find(
          (candidate) => candidate.routeOperationId === button.dataset.reassign
        );
        const form = root.querySelector<HTMLFormElement>("#reassign-form");
        if (!operation || !form) return;
        (form.elements.namedItem("routeOperationId") as HTMLInputElement).value =
          operation.routeOperationId;
        (form.elements.namedItem("expectedAssignmentRevision") as HTMLInputElement).value = String(
          operation.assignmentRevision
        );
        (form.elements.namedItem("teamId") as HTMLInputElement).value = operation.currentTeamId;
        (form.elements.namedItem("vehicleId") as HTMLInputElement).value =
          operation.currentVehicleId;
        dialog?.showModal();
      })
    );
    root.querySelector("#cancel-reassign")?.addEventListener("click", () => dialog?.close());
    root
      .querySelector<HTMLFormElement>("#reassign-form")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = Object.fromEntries(
          new FormData(event.currentTarget as HTMLFormElement).entries()
        );
        try {
          await api.reassignRouteOperation(String(values.routeOperationId), {
            expectedAssignmentRevision: Number(values.expectedAssignmentRevision),
            teamId: values.teamId,
            vehicleId: values.vehicleId,
            staffIds: String(values.staffIds)
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            deviceId: String(values.deviceId).trim() || null,
            reason: values.reason
          });
          dialog?.close();
          await load();
        } catch (cause) {
          error = cause instanceof Error ? cause.message : "Reassignment failed.";
          render();
        }
      });
    root.querySelector("#logout")?.addEventListener("click", () => void signOut());
    root.querySelector("#master")?.addEventListener("click", () => location.reload());
  };
  render();
}
