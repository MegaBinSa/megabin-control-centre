import "./style.css";

const modules = [
  "Clients",
  "Service Addresses",
  "Client Services",
  "Regions",
  "Depots",
  "Territories",
  "Teams",
  "Staff",
  "Vehicles"
] as const;
type ModuleName = (typeof modules)[number];
const paths: Record<ModuleName, string> = {
  Clients: "clients",
  "Service Addresses": "service-addresses",
  "Client Services": "client-services",
  Regions: "service-regions",
  Depots: "depots",
  Territories: "territories",
  Teams: "teams",
  Staff: "staff",
  Vehicles: "vehicles"
};
const apiBase = (import.meta.env.VITE_MASTER_DATA_API_URL as string | undefined)?.replace(
  /\/$/,
  ""
);
let active: ModuleName = "Clients";
let records: readonly Record<string, unknown>[] = [];

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Office Web root is missing.");
const appRoot = app;

async function load(): Promise<void> {
  records = [];
  if (apiBase) {
    const response = await fetch(`${apiBase}/api/v1/master-data/${paths[active]}`, {
      credentials: "include"
    });
    if (!response.ok) throw new Error(`Unable to load ${active}.`);
    const body = (await response.json()) as { data?: readonly Record<string, unknown>[] };
    records = body.data ?? [];
  }
  render();
}

function render(): void {
  const rows = records
    .map(
      (record) =>
        `<tr><td>${escapeText(String(record.displayName ?? record.name ?? record.addressLine1 ?? "—"))}</td><td>${escapeText(String(record.regionName ?? record.city ?? "—"))}</td><td><span class="status">${escapeText(String(record.lifecycleStatus ?? record.operationalAvailability ?? (record.isActive === false ? "Inactive" : "Active")))}</span></td></tr>`
    )
    .join("");
  appRoot.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav>${modules.map((name) => `<button data-module="${name}" ${name === active ? 'aria-current="page"' : ""}>${name}</button>`).join("")}</nav></aside><main>
    <header><div><h1>${active}</h1><p>Authoritative master-data administration</p></div><button class="button" id="create">Add ${active.replace(/s$/, "")}</button></header>
    ${apiBase ? "" : '<div class="notice">Set VITE_MASTER_DATA_API_URL to connect this administration shell. No direct database writes are used.</div>'}
    <div class="toolbar"><input id="search" type="search" placeholder="Search ${active.toLowerCase()}"/><select aria-label="Status"><option>All statuses</option><option>Active</option><option>Inactive / archived</option></select></div>
    <section class="panel">${rows ? `<table><thead><tr><th>Name / address</th><th>Region / city</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">No ${active.toLowerCase()} to display.</div>`}</section>
    <dialog id="create-dialog"><form id="create-form"><h2>Add ${active.replace(/s$/, "")}</h2><label>Display name<input name="displayName" required maxlength="200"/></label><label>Region ID<input name="serviceRegionId" placeholder="Immutable UUID where applicable"/></label><div class="actions"><button type="button" id="cancel">Cancel</button><button class="button" type="submit">Save</button></div></form></dialog>
  </main></div>`;
  document.querySelectorAll<HTMLButtonElement>("[data-module]").forEach((button) =>
    button.addEventListener("click", () => {
      active = button.dataset.module as ModuleName;
      void load();
    })
  );
  const dialog = document.querySelector<HTMLDialogElement>("#create-dialog");
  document.querySelector("#create")?.addEventListener("click", () => dialog?.showModal());
  document.querySelector("#cancel")?.addEventListener("click", () => dialog?.close());
  document
    .querySelector<HTMLFormElement>("#create-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!apiBase) {
        dialog?.close();
        return;
      }
      const data = Object.fromEntries(
        new FormData(event.currentTarget as HTMLFormElement).entries()
      );
      const response = await fetch(`${apiBase}/api/v1/master-data/${paths[active]}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "X-Correlation-Id": crypto.randomUUID()
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error("Save failed.");
      dialog?.close();
      await load();
    });
}

function escapeText(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character
  );
}

void load();
