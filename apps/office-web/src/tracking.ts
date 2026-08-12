/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { MasterDataApiClient } from "@megabin/api-client";
interface Position {
  vehicleId: string;
  vehicleDisplayName: string;
  registrationReference: string;
  deviceId?: string;
  deviceName?: string;
  deviceStatus?: string;
  teamName?: string;
  routeOperationId?: string;
  latitude?: number;
  longitude?: number;
  recordedAt?: string;
  ageSeconds?: number;
  accuracyMetres?: number;
  health: string;
}
interface Device {
  vehicleTrackingDeviceId: string;
  deviceName: string;
  deviceReference: string;
  lifecycleStatus: string;
  vehicleDisplayName?: string;
  lastSeenAt?: string;
}
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
export async function renderTrackingWorkspace(
  root: HTMLElement,
  api: MasterDataApiClient,
  permissions: readonly string[],
  signOut: () => Promise<void>
) {
  const regions = (await api.list<{ serviceRegionId: string; name: string }>("service-regions"))
    .items;
  let regionId = regions[0]?.serviceRegionId ?? "",
    positions: Position[] = [],
    devices: Device[] = [],
    selected: Position | null = null,
    error = "";
  const load = async () => {
    if (!regionId) return;
    try {
      [positions, devices] = await Promise.all([
        api.currentVehiclePositions<Position[]>(regionId),
        api.trackingDevices<Device[]>(regionId)
      ]);
      error = "";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Unable to load tracking.";
    }
    render();
  };
  const render = () => {
    const located = positions.filter((p) => p.latitude !== undefined && p.longitude !== undefined);
    root.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav><button id="back">Master Data</button><button aria-current="page">Live Vehicles</button></nav></aside><main><header><div><h1>Live Vehicles</h1><p>Current regional vehicle positions · 30 second polling</p></div><button id="logout">Sign out</button></header>${error ? `<div class="error">${escape(error)}</div>` : ""}<section class="panel"><div class="toolbar"><label>Region<select id="region">${regions.map((r) => `<option value="${r.serviceRegionId}" ${r.serviceRegionId === regionId ? "selected" : ""}>${escape(r.name)}</option>`).join("")}</select></label><button id="refresh">Refresh</button></div></section><section class="panel"><h2>Vehicle map</h2><div class="tracking-map">${located.map((p, i) => `<button class="vehicle-marker ${escape(p.health)}" style="left:${10 + ((i * 31) % 80)}%;top:${15 + ((i * 37) % 70)}%" data-vehicle="${p.vehicleId}">${i + 1}</button>`).join("")}${located.length ? "" : '<div class="empty">No current positions.</div>'}</div>${selected ? `<div class="route-card"><h3>${escape(selected.vehicleDisplayName)}</h3><p>${escape(selected.registrationReference)} · ${escape(selected.teamName ?? "No active team")}</p><p>${escape(selected.latitude)}, ${escape(selected.longitude)} · accuracy ${escape(selected.accuracyMetres)} m</p><p>${escape(selected.health)} · ${escape(selected.ageSeconds)} seconds old</p><p>Device: ${escape(selected.deviceName)} (${escape(selected.deviceStatus)})</p><p>Route: ${escape(selected.routeOperationId ?? "None")}</p></div>` : ""}</section><section class="panel"><h2>Tracking status</h2><table><thead><tr><th>Team</th><th>Vehicle</th><th>Status</th><th>Last position</th><th>Device</th></tr></thead><tbody>${positions.map((p) => `<tr data-vehicle="${p.vehicleId}"><td>${escape(p.teamName ?? "—")}</td><td>${escape(p.vehicleDisplayName)}<br>${escape(p.registrationReference)}</td><td><span class="status">${escape(p.health)}</span></td><td>${p.recordedAt ? escape(new Date(p.recordedAt).toLocaleString()) : "Never"}</td><td>${escape(p.deviceName ?? "Unassigned")} · ${escape(p.deviceStatus ?? "unknown")}</td></tr>`).join("")}</tbody></table></section>${permissions.includes("vehicle_tracking.manage_devices") ? `<section class="panel"><h2>Device administration</h2><button id="register">Register device</button><table><tbody>${devices.map((d) => `<tr><td>${escape(d.deviceName)}<br>${escape(d.deviceReference)}</td><td>${escape(d.lifecycleStatus)}</td><td>${escape(d.vehicleDisplayName ?? "Unassigned")}</td><td>${escape(d.lastSeenAt ?? "Never")}</td><td><button data-lifecycle="${d.vehicleTrackingDeviceId}">Lifecycle</button>${permissions.includes("vehicle_tracking.assign_devices") ? `<button data-assign="${d.vehicleTrackingDeviceId}">Assign</button>` : ""}<button data-history="${d.vehicleTrackingDeviceId}">History</button></td></tr>`).join("")}</tbody></table></section><dialog id="device-dialog"><form id="device-form"><h2>Register device</h2><label>Name<input name="deviceName" required></label><label>Reference<input name="deviceReference" required></label><label>Provider<input name="providerKey" value="driver-pwa" required></label><label>Type<select name="deviceType"><option value="driver_pwa">Driver PWA</option><option value="dedicated_gps">Dedicated GPS</option><option value="external_provider">External provider</option></select></label><input name="serviceRegionId" value="${regionId}" type="hidden"><label>Owner user ID<input name="ownerUserId"></label><label>Credential reference<input name="credentialReference"></label><div class="actions"><button type="button" id="cancel">Cancel</button><button>Register</button></div></form></dialog>` : ""}</main></div>`;
    root.querySelector("#region")?.addEventListener("change", (e) => {
      regionId = (e.target as HTMLSelectElement).value;
      void load();
    });
    root.querySelector("#refresh")?.addEventListener("click", () => void load());
    root.querySelectorAll<HTMLElement>("[data-vehicle]").forEach((e) =>
      e.addEventListener("click", () => {
        selected = positions.find((p) => p.vehicleId === e.dataset.vehicle) ?? null;
        render();
      })
    );
    const dialog = root.querySelector<HTMLDialogElement>("#device-dialog");
    root.querySelector("#register")?.addEventListener("click", () => dialog?.showModal());
    root.querySelector("#cancel")?.addEventListener("click", () => dialog?.close());
    root.querySelector<HTMLFormElement>("#device-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await api.registerTrackingDevice(
        Object.fromEntries(new FormData(e.currentTarget as HTMLFormElement))
      );
      dialog?.close();
      await load();
    });
    root.querySelectorAll<HTMLElement>("[data-lifecycle]").forEach((b) =>
      b.addEventListener("click", async () => {
        const target = prompt("Target: active, suspended, revoked, retired", "active"),
          reason = target && prompt("Reason");
        if (target && reason) {
          await api.changeTrackingDeviceLifecycle(b.dataset.lifecycle!, target, reason);
          await load();
        }
      })
    );
    root.querySelectorAll<HTMLElement>("[data-assign]").forEach((b) =>
      b.addEventListener("click", async () => {
        const vehicle = prompt("Vehicle ID"),
          reason = vehicle && prompt("Reason");
        if (vehicle && reason) {
          await api.assignTrackingDevice(b.dataset.assign!, vehicle, reason);
          await load();
        }
      })
    );
    root
      .querySelectorAll<HTMLElement>("[data-history]")
      .forEach((b) =>
        b.addEventListener("click", async () =>
          alert(
            `${(await api.trackingAssignmentHistory<unknown[]>(b.dataset.history!)).length} assignment record(s)`
          )
        )
      );
    root.querySelector("#logout")?.addEventListener("click", () => void signOut());
    root.querySelector("#back")?.addEventListener("click", () => location.reload());
  };
  await load();
  window.setInterval(() => void load(), 30000);
}
