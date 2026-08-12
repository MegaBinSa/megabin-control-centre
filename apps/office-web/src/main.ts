import "./style.css";
import { createOfficeAuth, type OfficeIdentity } from "@megabin/auth";
import { MasterDataApiClient } from "@megabin/api-client";
import { renderGeographyWorkspace } from "./geography.js";
import { renderRosterWorkspace } from "./roster.js";

const modules = [
  "Clients",
  "Client Contacts",
  "Service Addresses",
  "Client Services",
  "Service Configurations",
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
  "Client Contacts": "client-contacts",
  "Service Addresses": "service-addresses",
  "Client Services": "client-services",
  "Service Configurations": "service-configurations",
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
let identity: OfficeIdentity | null = null;
let errorMessage = "";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const auth = supabaseUrl && supabaseKey ? createOfficeAuth(supabaseUrl, supabaseKey) : null;
const api =
  apiBase && auth
    ? new MasterDataApiClient({ baseUrl: apiBase, accessToken: () => auth.accessToken() })
    : null;
const createFields: Record<ModuleName, string> = {
  Clients:
    '<label>Type<select name="clientType"><option value="individual">Individual</option><option value="organisation">Organisation</option></select></label><label>Display name<input name="displayName" required maxlength="200"></label><label>Organisation name<input name="organisationName"></label>',
  "Client Contacts":
    '<label>Client ID<input name="clientId" required></label><label>Contact name<input name="contactName" required></label><label>Mobile<input name="mobile" placeholder="082 123 4567"></label><label>Email<input name="email" type="email"></label><label>Language<select name="preferredLanguage"><option value="english">English</option><option value="afrikaans">Afrikaans</option></select></label>',
  "Service Addresses":
    '<label>Address line 1<input name="addressLine1" required></label><label>Suburb<input name="suburb" required></label><label>City<input name="city" required></label><label>Postal code<input name="postalCode"></label>',
  "Client Services":
    '<label>Client ID<input name="clientId" required></label><label>Service address ID<input name="serviceAddressId" required></label><label>Cadence<select name="cadenceCode"><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select></label>',
  "Service Configurations":
    '<label>Client service ID<input name="clientServiceId" required></label><label>Region ID<input name="serviceRegionId" required></label><label>Configured drums<input name="configuredDrumCount" type="number" min="1" required></label><label>Collection day<input name="configuredCollectionDay" type="number" min="1" max="7"></label><label>Effective from<input name="effectiveFrom" type="date" required></label>',
  Regions:
    '<label>Name<input name="name" required></label><label>Region code<input name="regionCode" required></label>',
  Depots:
    '<label>Region ID<input name="serviceRegionId" required></label><label>Name<input name="name" required></label><label>Address line 1<input name="addressLine1" required></label><label>Suburb<input name="suburb" required></label><label>City<input name="city" required></label>',
  Territories:
    '<label>Region ID<input name="serviceRegionId" required></label><label>Name<input name="name" required></label><label>Priority<input name="priority" type="number" value="0"></label>',
  Teams:
    '<label>Region ID<input name="serviceRegionId" required></label><label>Team code<input name="teamCode" required></label><label>Name<input name="name" required></label>',
  Staff:
    '<label>Display name<input name="displayName" required></label><label>Operational type<select name="operationalRole"><option value="driver">Driver</option><option value="assistant">Assistant</option><option value="supervisor">Supervisor</option><option value="other">Other</option></select></label><label>Default team ID<input name="defaultTeamId"></label>',
  Vehicles:
    '<label>Region ID<input name="serviceRegionId" required></label><label>Registration<input name="registrationReference" required></label><label>Display name<input name="displayName" required></label><label>Drum capacity<input name="estimatedDrumCapacity" type="number" min="1"></label>'
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Office Web root is missing.");
const appRoot = app;

async function load(): Promise<void> {
  records = [];
  errorMessage = "";
  if (api)
    try {
      records = (await api.list<Record<string, unknown>>(paths[active])).items;
    } catch (cause) {
      errorMessage = cause instanceof Error ? cause.message : `Unable to load ${active}.`;
    }
  render();
}

function render(): void {
  if (!auth || !api) {
    appRoot.innerHTML =
      '<main class="login"><h1>MegaBin Control Centre</h1><div class="notice">Configure VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and VITE_MASTER_DATA_API_URL.</div></main>';
    return;
  }
  if (!identity) {
    appRoot.innerHTML = `<main class="login"><form id="login-form"><h1>Office sign in</h1><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label>${errorMessage ? `<div class="error">${escapeText(errorMessage)}</div>` : ""}<button class="button">Sign in</button></form></main>`;
    document
      .querySelector<HTMLFormElement>("#login-form")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget as HTMLFormElement);
        try {
          await auth.signIn(String(form.get("email")), String(form.get("password")));
          await restore();
        } catch (cause) {
          errorMessage = cause instanceof Error ? cause.message : "Sign in failed.";
          render();
        }
      });
    return;
  }
  const canWrite = identity.permissions.includes("master_data.write");
  if (!identity.permissions.includes("master_data.read")) {
    appRoot.innerHTML = `<main class="login"><h1>Office access unavailable</h1><p>Your account is not permitted to use Office master-data administration.</p><button id="logout">Sign out</button></main>`;
    document.querySelector("#logout")?.addEventListener("click", async () => {
      await auth.signOut();
      identity = null;
      render();
    });
    return;
  }
  const visibleModules = identity.permissions.includes("clients.sensitive.read")
    ? modules
    : modules.filter((module) => module !== "Clients" && module !== "Client Contacts");
  const rows = records
    .map(
      (record, index) =>
        `<tr><td>${escapeText(String(record.displayName ?? record.name ?? record.contactName ?? record.addressLine1 ?? "—"))}</td><td>${escapeText(String(record.regionName ?? record.city ?? "—"))}</td><td><span class="status">${escapeText(String(record.lifecycleStatus ?? record.operationalAvailability ?? (record.isActive === false ? "Inactive" : "Active")))}</span></td><td>${canWrite ? `<button data-edit="${index}">Edit</button>` : ""}</td></tr>`
    )
    .join("");
  appRoot.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav>${visibleModules.map((name) => `<button data-module="${name}" ${name === active ? 'aria-current="page"' : ""}>${name}</button>`).join("")}${identity.permissions.includes("geography.read") ? '<button id="geography-workspace">Geography</button>' : ""}${identity.permissions.includes("roster.read") ? '<button id="roster-workspace">Daily Roster</button>' : ""}</nav></aside><main>
    <header><div><h1>${active}</h1><p>Authoritative master-data administration · ${escapeText(identity.displayName)}</p></div><div class="header-actions">${canWrite ? `<button class="button" id="create">Add ${active.replace(/s$/, "")}</button>` : ""}<button id="logout">Sign out</button></div></header>
    ${errorMessage ? `<div class="error">${escapeText(errorMessage)}</div>` : ""}
    <div class="toolbar"><input id="search" type="search" placeholder="Search ${active.toLowerCase()}"/><select aria-label="Status"><option>All statuses</option><option>Active</option><option>Inactive / archived</option></select></div>
    <section class="panel">${rows ? `<table><thead><tr><th>Name / address</th><th>Region / city</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">No ${active.toLowerCase()} to display.</div>`}</section>
    <dialog id="create-dialog"><form id="create-form"><h2>Add ${active.replace(/s$/, "")}</h2>${createFields[active]}<div class="actions"><button type="button" id="cancel">Cancel</button><button class="button" type="submit">Save</button></div></form></dialog>
    <dialog id="edit-dialog"><form id="edit-form"><h2>Edit ${active.replace(/s$/, "")}</h2><input name="id" type="hidden"><input name="expectedUpdatedAt" type="hidden"><label>Editable values (JSON)<textarea name="patch" rows="12" required></textarea></label><div class="actions"><button type="button" id="archive">Archive</button><button type="button" id="edit-cancel">Cancel</button><button class="button">Save</button></div></form></dialog>
  </main></div>`;
  document.querySelectorAll<HTMLButtonElement>("[data-module]").forEach((button) =>
    button.addEventListener("click", () => {
      active = button.dataset.module as ModuleName;
      void load();
    })
  );
  document.querySelector("#geography-workspace")?.addEventListener("click", () => {
    void renderGeographyWorkspace(
      appRoot,
      api,
      identity?.permissions.includes("geography.write") === true,
      async () => {
        await auth.signOut();
        identity = null;
        render();
      }
    );
  });
  document.querySelector("#roster-workspace")?.addEventListener("click", () => {
    void renderRosterWorkspace(appRoot, api, identity?.permissions ?? [], async () => {
      await auth.signOut();
      identity = null;
      render();
    });
  });
  const dialog = document.querySelector<HTMLDialogElement>("#create-dialog");
  document.querySelector("#create")?.addEventListener("click", () => dialog?.showModal());
  document.querySelector("#cancel")?.addEventListener("click", () => dialog?.close());
  document
    .querySelector<HTMLFormElement>("#create-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = normalizeForm(
        Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement).entries())
      );
      try {
        await api.create(paths[active], data);
        dialog?.close();
        await load();
      } catch (cause) {
        errorMessage = cause instanceof Error ? cause.message : "Save failed.";
        render();
      }
    });
  document.querySelector("#logout")?.addEventListener("click", async () => {
    await auth.signOut();
    identity = null;
    render();
  });
  const editDialog = document.querySelector<HTMLDialogElement>("#edit-dialog");
  const editForm = document.querySelector<HTMLFormElement>("#edit-form");
  document.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((button) =>
    button.addEventListener("click", () => {
      const record = records[Number(button.dataset.edit)];
      if (!record || !editForm) return;
      const id = record.id ?? Object.entries(record).find(([key]) => key.endsWith("Id"))?.[1];
      (editForm.elements.namedItem("id") as HTMLInputElement).value = String(id ?? "");
      (editForm.elements.namedItem("expectedUpdatedAt") as HTMLInputElement).value = String(
        record.updatedAt ?? ""
      );
      (editForm.elements.namedItem("patch") as HTMLTextAreaElement).value = JSON.stringify(
        Object.fromEntries(
          Object.entries(record).filter(
            ([key]) =>
              !key.endsWith("Id") &&
              !["createdAt", "updatedAt", "archivedAt", "location", "boundary"].includes(key)
          )
        ),
        null,
        2
      );
      editDialog?.showModal();
    })
  );
  document.querySelector("#edit-cancel")?.addEventListener("click", () => editDialog?.close());
  editForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    try {
      await api.update(paths[active], String(form.get("id")), {
        ...(JSON.parse(String(form.get("patch"))) as object),
        expectedUpdatedAt: String(form.get("expectedUpdatedAt"))
      });
      editDialog?.close();
      await load();
    } catch (cause) {
      errorMessage = cause instanceof Error ? cause.message : "Update failed.";
      render();
    }
  });
  document.querySelector("#archive")?.addEventListener("click", async () => {
    if (!editForm || !confirm("Archive this record?")) return;
    const id = (editForm.elements.namedItem("id") as HTMLInputElement).value;
    const expected = (editForm.elements.namedItem("expectedUpdatedAt") as HTMLInputElement).value;
    try {
      await api.archive(paths[active], id, expected);
      editDialog?.close();
      await load();
    } catch (cause) {
      errorMessage = cause instanceof Error ? cause.message : "Archive failed.";
      render();
    }
  });
  document.querySelector<HTMLInputElement>("#search")?.addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    records = (
      await api.list<Record<string, unknown>>(
        paths[active],
        new URLSearchParams({ search: input.value }).toString()
      )
    ).items;
    render();
  });
}

function normalizeForm(input: Record<string, FormDataEntryValue>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== "")
      .map(([key, value]) => {
        const text = String(value);
        return [
          key,
          [
            "configuredDrumCount",
            "configuredCollectionDay",
            "priority",
            "estimatedDrumCapacity"
          ].includes(key)
            ? Number(text)
            : text
        ];
      })
  );
}

function escapeText(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character
  );
}

async function restore(): Promise<void> {
  if (!auth || !api || !(await auth.session())) {
    identity = null;
    render();
    return;
  }
  try {
    identity = await api.profile<OfficeIdentity>();
    if (!identity.permissions.includes("clients.sensitive.read") && active === "Clients")
      active = "Service Addresses";
    await load();
  } catch (cause) {
    errorMessage = cause instanceof Error ? cause.message : "Session expired.";
    identity = null;
    render();
  }
}
auth?.onChange(() => {
  void restore();
});
void restore();
