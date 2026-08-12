/* eslint-disable @typescript-eslint/no-non-null-assertion */
import "./style.css";
import { createDriverAuth } from "@megabin/auth";
import { API_BASE_PATH, MasterDataApiClient } from "@megabin/api-client";
import {
  clearOperationalData,
  getData,
  putData,
  queueAction,
  queuePosition,
  queuedActions,
  queuedPositions,
  trimPositionQueue,
  type QueuedAction
} from "./storage.js";
interface Stop {
  routeOperationStopId: string;
  sequenceNumber: number;
  address: Record<string, unknown>;
  plannedDrumUnits: number;
  serviceFlags: Record<string, unknown>;
  execution?: { executionStatus: string; outcomeCode: string; actualDrumCount?: number } | null;
}
interface Manifest {
  routeOperationId: string;
  routeDate: string;
  lifecycleStatus: string;
  assignmentRevision: number;
  manifestRevision: number;
  plannedDistanceMetres?: number;
  plannedDurationMinutes?: number;
  team?: { name: string };
  vehicle?: { displayName: string };
  stops: Stop[];
}
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Driver root missing");
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
  base = import.meta.env.VITE_DRIVER_API_URL as string | undefined;
const auth = url && key ? createDriverAuth(url, key) : null,
  api =
    auth && base
      ? new MasterDataApiClient({ baseUrl: base, accessToken: () => auth.accessToken() })
      : null;
let manifest: Manifest | null = null,
  selected: Stop | null = null,
  online = navigator.onLine,
  syncing = false,
  message = "",
  trackingStatus = "Tracking unavailable",
  trackingDevice: { deviceId: string; status: string } | null = null,
  trackingTimer: number | null = null;
const outcomes = [
  ["cleaned", "Cleaned"],
  ["client_requested_skip", "Client requested skip"],
  ["drum_empty", "Drum empty"],
  ["drum_unavailable", "Drum unavailable"],
  ["could_not_access", "Could not access property"],
  ["drum_missing", "Drum missing"],
  ["account_hold", "Account hold"],
  ["other_issue", "Other issue"]
] as const;
const escape = (v: unknown) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
    ),
  nextSequence = async () =>
    Math.max(0, ...(await queuedActions()).map((a) => a.clientSequence)) + 1;
async function enqueue(
  kind: QueuedAction["kind"],
  endpoint: string,
  body: Record<string, unknown>
) {
  const actionId = String(body.actionId ?? crypto.randomUUID());
  await queueAction({
    actionId,
    routeOperationId: manifest!.routeOperationId,
    kind,
    endpoint,
    body,
    clientSequence: Number(body.clientSequence),
    state: "queued"
  });
  await applyLocal(kind, body);
  if (online) await sync();
  else await render();
}
async function applyLocal(kind: QueuedAction["kind"], body: Record<string, unknown>) {
  if (!manifest) return;
  if (kind === "route")
    manifest = {
      ...manifest,
      lifecycleStatus: body.actionType === "accept" ? "accepted" : "in_progress"
    };
  if (kind === "stop")
    manifest = {
      ...manifest,
      stops: manifest.stops.map((s) =>
        s.routeOperationStopId === body.routeOperationStopId
          ? {
              ...s,
              execution: {
                executionStatus:
                  body.outcome === "cleaned"
                    ? "completed"
                    : ["could_not_access", "drum_missing", "other_issue"].includes(
                          String(body.outcome)
                        )
                      ? "issue"
                      : "skipped",
                outcomeCode: String(body.outcome),
                actualDrumCount: Number(body.actualDrumCount ?? 0)
              }
            }
          : s
      )
    };
  await putData("manifest", manifest);
}
async function post(action: QueuedAction) {
  const token = await auth!.accessToken();
  const response = await fetch(`${base!.replace(/\/$/, "")}${API_BASE_PATH}${action.endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": String(action.body.idempotencyKey),
      "X-Correlation-Id": String(action.body.correlationId)
    },
    body: JSON.stringify(action.body)
  });
  return response.json() as Promise<{
    ok: boolean;
    data?: { outcome?: string; rejectionCode?: string };
    error?: { code: string };
  }>;
}
async function sync() {
  if (!online || syncing || !auth) return;
  syncing = true;
  await render();
  for (const action of await queuedActions()) {
    if (!["queued", "failed"].includes(action.state)) continue;
    action.state = "syncing";
    await queueAction(action);
    try {
      const result = await post(action);
      if (result.ok) {
        action.state =
          result.data?.outcome === "conflict"
            ? "conflict"
            : result.data?.outcome === "rejected"
              ? "rejected"
              : "synced";
        if (result.data?.rejectionCode) action.rejectionCode = result.data.rejectionCode;
      } else {
        action.state = result.error?.code === "conflict" ? "conflict" : "failed";
        if (result.error?.code) action.rejectionCode = result.error.code;
      }
    } catch {
      action.state = "failed";
    }
    await queueAction(action);
  }
  syncing = false;
  await syncPositions();
  await refresh();
}
async function syncPositions() {
  if (!online || !api || !trackingDevice || trackingDevice.status !== "active") return;
  const pending = (await queuedPositions())
    .filter((position) => position.state === "queued")
    .slice(0, 100);
  if (!pending.length) return;
  pending.forEach((position) => (position.state = "syncing"));
  await Promise.all(pending.map(queuePosition));
  try {
    const result = await api.ingestTrackingBatch<{
      receipts: { observationId: string; outcome: string; rejectionCode?: string }[];
    }>(trackingDevice.deviceId, pending, {
      idempotencyKey: crypto.randomUUID(),
      correlationId: crypto.randomUUID()
    });
    for (const receipt of result.receipts) {
      const position = pending.find((item) => item.observationId === receipt.observationId);
      if (!position) continue;
      position.state =
        receipt.outcome === "conflict"
          ? "conflict"
          : receipt.outcome === "rejected"
            ? "rejected"
            : "synced";
      if (receipt.rejectionCode) position.rejectionCode = receipt.rejectionCode;
      await queuePosition(position);
    }
    trackingStatus = "Tracking active";
  } catch {
    pending.forEach((position) => (position.state = "queued"));
    await Promise.all(pending.map(queuePosition));
    trackingStatus = "Tracking delayed/offline";
  }
  await trimPositionQueue();
}
async function startTracking() {
  if (!api || !navigator.geolocation) {
    trackingStatus = "GPS unavailable";
    return;
  }
  try {
    trackingDevice = online
      ? await api.ownTrackingDevice<{ deviceId: string; status: string } | null>()
      : ((await getData<{ deviceId: string; status: string }>("tracking-device")) ?? null);
    if (trackingDevice) await putData("tracking-device", trackingDevice);
  } catch {
    trackingDevice =
      (await getData<{ deviceId: string; status: string }>("tracking-device")) ?? null;
  }
  if (!trackingDevice || trackingDevice.status !== "active") {
    trackingStatus = trackingDevice
      ? `Tracking ${trackingDevice.status}`
      : "Tracking device not assigned";
    return;
  }
  const capture = () =>
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const id = crypto.randomUUID();
        const sequence =
          Math.max(0, ...(await queuedPositions()).map((item) => item.clientSequence)) + 1;
        await queuePosition({
          observationId: id,
          recordedAt: new Date(position.timestamp).toISOString(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: position.coords.accuracy,
          ...(position.coords.altitude === null
            ? {}
            : { altitudeMetres: position.coords.altitude }),
          ...(position.coords.heading === null ? {} : { headingDegrees: position.coords.heading }),
          ...(position.coords.speed === null
            ? {}
            : { speedMetresPerSecond: position.coords.speed }),
          clientSequence: sequence,
          idempotencyKey: id,
          correlationId: crypto.randomUUID(),
          sourceProvider: "driver-pwa",
          state: "queued"
        });
        trackingStatus = online ? "Tracking active" : "Tracking delayed/offline";
        await trimPositionQueue();
        if (online) await syncPositions();
        await render();
      },
      () => {
        trackingStatus = "GPS permission unavailable";
        void render();
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
  capture();
  addEventListener("megabin:capture-location", capture);
  if (trackingTimer === null) trackingTimer = window.setInterval(capture, 45000);
}
async function refresh() {
  const session = await auth?.session();
  if (!session) {
    renderLogin();
    return;
  }
  if (online && api) {
    try {
      const cached = (await getData<Manifest>("manifest")) ?? null;
      const unresolved = (await queuedActions()).some((action) => action.state !== "synced");
      if (cached && unresolved) {
        manifest = cached;
        const freshness = await api.routeOperationFreshness<{
          stale: boolean;
          cancelled: boolean;
          superseded: boolean;
        }>(cached.routeOperationId, cached.manifestRevision);
        if (freshness.stale || freshness.cancelled || freshness.superseded)
          message =
            "The assigned route changed while local actions are pending. Sync or resolve them before refreshing.";
        await render();
        return;
      }
      const assigned = await api.assignedRouteOperations<{ routeOperationId: string }[]>();
      if (assigned[0]) {
        const fresh = await api.routeOperationManifest<Manifest>(assigned[0].routeOperationId);
        const execution = await api.routeOperationStops<{ stops: Stop[] }>(
          assigned[0].routeOperationId
        );
        manifest = { ...fresh, stops: execution.stops };
        await putData("manifest", manifest);
      } else manifest = null;
    } catch {
      manifest = (await getData<Manifest>("manifest")) ?? null;
    }
  } else manifest = (await getData<Manifest>("manifest")) ?? null;
  await render();
  if (trackingTimer === null) void startTracking();
}
function progress() {
  const stops = manifest?.stops ?? [],
    done = stops.filter((s) => s.execution),
    clean = stops.filter((s) => s.execution?.executionStatus === "completed");
  return {
    total: stops.length,
    done: done.length,
    remaining: stops.length - done.length,
    actual: clean.reduce((n, s) => n + (s.execution?.actualDrumCount ?? 0), 0),
    planned: stops.reduce((n, s) => n + s.plannedDrumUnits, 0)
  };
}
async function render() {
  if (!manifest) {
    const gpsPending = (await queuedPositions()).filter(
      (position) => position.state !== "synced"
    ).length;
    root!.innerHTML = `<header><b>MegaBin Driver</b><button id="logout">Logout</button></header><main><div class="notice">${escape(trackingStatus)} · ${gpsPending} GPS pending</div><section class="card"><h1>No route assigned</h1><p>${online ? "Check with Operations." : "Offline: no cached route is available."}</p></section></main>`;
    wireLogout();
    return;
  }
  const queue = await queuedActions(),
    pending = queue.filter((a) => a.state !== "synced").length,
    p = progress(),
    issues = queue.filter((a) => ["failed", "conflict", "rejected"].includes(a.state));
  const gpsPending = (await queuedPositions()).filter(
    (position) => position.state !== "synced"
  ).length;
  root!.innerHTML = `<header><b>MegaBin Driver</b><span class="status ${online ? "" : "offline"}"><i class="dot"></i>${syncing ? "Syncing" : issues.length ? "Sync issue" : online ? "Online" : "Offline"} · ${pending} pending</span></header><main>${message ? `<div class="notice">${escape(message)}</div>` : ""}${issues.length ? `<div class="notice">${issues.length} action(s) need attention and remain queued.</div>` : ""}<section class="card"><h1>${escape(manifest.team?.name ?? "Assigned route")}</h1><p>${escape(manifest.routeDate)} · ${escape(manifest.vehicle?.displayName ?? "Vehicle")}</p><p>Status: <b>${escape(manifest.lifecycleStatus)}</b> · Manifest ${manifest.manifestRevision}</p><div class="metrics"><div class="metric"><b>${p.done}/${p.total}</b><br>stops</div><div class="metric"><b>${p.actual}/${p.planned}</b><br>drums</div><div class="metric"><b>${p.remaining}</b><br>remaining</div></div><div class="actions"><button id="accept" class="primary">Accept route</button><button id="start" class="primary">Start route</button><button id="capacity">Near capacity</button><button id="complete">Complete route</button><button id="sync">Sync now</button><button id="logout">Logout</button></div></section><section class="card"><h2>Next stop</h2>${manifest.stops.find((s) => !s.execution) ? `Stop ${manifest.stops.find((s) => !s.execution)!.sequenceNumber}` : "All stops recorded"}</section><section class="card"><h2>Stops</h2>${manifest.stops.map((s) => `<button class="stop ${s.execution?.executionStatus === "completed" ? "done" : s.execution ? "issue" : ""}" data-stop="${s.routeOperationStopId}"><b>${s.sequenceNumber}. ${escape(s.address.line1 ?? s.address.address_line_1 ?? "Service address")}</b><br>${s.plannedDrumUnits} planned drums · ${escape(s.execution?.outcomeCode ?? "Pending")}</button>`).join("")}</section></main>`;
  root!
    .querySelector("main")
    ?.insertAdjacentHTML(
      "afterbegin",
      `<div class="notice">${escape(trackingStatus)} · ${gpsPending} GPS pending</div>`
    );
  document.querySelectorAll<HTMLElement>("[data-stop]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = manifest!.stops.find((s) => s.routeOperationStopId === b.dataset.stop) ?? null;
        renderStop();
      })
  );
  document.querySelector("#accept")?.addEventListener("click", () => queueRoute("accept"));
  document.querySelector("#start")?.addEventListener("click", () => queueRoute("start"));
  document.querySelector("#capacity")?.addEventListener("click", () => queueCapacity());
  document.querySelector("#complete")?.addEventListener("click", () => queueComplete());
  document.querySelector("#sync")?.addEventListener("click", () => sync());
  wireLogout();
}
function renderStop() {
  if (!selected) return;
  root!.innerHTML = `<header><button id="back">← Route</button><b>Stop ${selected.sequenceNumber}</b></header><main><section class="card"><h1>${escape(selected.address.line1 ?? selected.address.address_line_1)}</h1><p>Planned drums: <b>${selected.plannedDrumUnits}</b></p><p>${escape(selected.serviceFlags.accessInstructions ?? "")}</p>${selected.serviceFlags.dangerousAnimal ? '<p class="safety">Dangerous animal warning</p>' : ""}<div class="actions"><button id="previous" type="button">Previous</button><button id="next" type="button">Next</button></div><form id="result"><label>Outcome<select name="outcome">${outcomes.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label><label>Actual drums serviced<input name="actual" type="number" min="0" value="${selected.plannedDrumUnits}"></label><label>Reason / note<textarea name="reason"></textarea></label><button class="primary">Save outcome</button></form></section></main>`;
  document.querySelector("#back")?.addEventListener("click", () => render());
  const move = (offset: number) => {
    const index = manifest!.stops.findIndex(
      (stop) => stop.routeOperationStopId === selected!.routeOperationStopId
    );
    selected = manifest!.stops[index + offset] ?? selected;
    renderStop();
  };
  document.querySelector("#previous")?.addEventListener("click", () => move(-1));
  document.querySelector("#next")?.addEventListener("click", () => move(1));
  document.querySelector<HTMLFormElement>("#result")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement),
      outcome = String(f.get("outcome")),
      reason = String(f.get("reason")).trim();
    if (
      [
        "drum_unavailable",
        "could_not_access",
        "drum_missing",
        "account_hold",
        "other_issue"
      ].includes(outcome) &&
      !reason
    ) {
      message = "A reason is required for this outcome.";
      return renderStop();
    }
    const seq = await nextSequence(),
      id = crypto.randomUUID();
    await enqueue(
      "stop",
      `/driver/route-operations/${manifest!.routeOperationId}/stops/${selected!.routeOperationStopId}/result`,
      {
        actionId: id,
        routeOperationId: manifest!.routeOperationId,
        routeOperationStopId: selected!.routeOperationStopId,
        assignmentRevision: manifest!.assignmentRevision,
        manifestRevision: manifest!.manifestRevision,
        deviceTimestamp: new Date().toISOString(),
        clientSequence: seq,
        idempotencyKey: id,
        correlationId: crypto.randomUUID(),
        outcome,
        actualDrumCount: outcome === "cleaned" ? Number(f.get("actual")) : null,
        reason: reason || null,
        payloadVersion: 1
      }
    );
    selected = null;
  });
}
async function queueRoute(actionType: "accept" | "start") {
  const seq = await nextSequence(),
    id = crypto.randomUUID();
  await enqueue("route", `/driver/route-operations/${manifest!.routeOperationId}/actions`, {
    actionId: id,
    routeOperationId: manifest!.routeOperationId,
    assignmentRevision: manifest!.assignmentRevision,
    manifestRevision: manifest!.manifestRevision,
    deviceTimestamp: new Date().toISOString(),
    clientSequence: seq,
    idempotencyKey: id,
    correlationId: crypto.randomUUID(),
    actionType,
    payloadVersion: 1,
    payload: {}
  });
}
async function queueCapacity() {
  const seq = await nextSequence(),
    id = crypto.randomUUID();
  await enqueue("capacity", `/driver/route-operations/${manifest!.routeOperationId}/capacity`, {
    actionId: id,
    routeOperationId: manifest!.routeOperationId,
    assignmentRevision: manifest!.assignmentRevision,
    manifestRevision: manifest!.manifestRevision,
    deviceTimestamp: new Date().toISOString(),
    clientSequence: seq,
    idempotencyKey: id,
    correlationId: crypto.randomUUID(),
    capacityState: "near_capacity",
    payloadVersion: 1
  });
}
async function queueComplete() {
  if (progress().remaining) {
    message = "Complete every stop before completing the route.";
    return render();
  }
  if ((await queuedActions()).some((action) => action.state !== "synced")) {
    message = "Sync or resolve all pending actions before completing the route.";
    return render();
  }
  const seq = await nextSequence(),
    id = crypto.randomUUID();
  await enqueue("complete", `/driver/route-operations/${manifest!.routeOperationId}/complete`, {
    actionId: id,
    routeOperationId: manifest!.routeOperationId,
    assignmentRevision: manifest!.assignmentRevision,
    manifestRevision: manifest!.manifestRevision,
    deviceTimestamp: new Date().toISOString(),
    clientSequence: seq,
    idempotencyKey: id,
    correlationId: crypto.randomUUID(),
    payloadVersion: 1
  });
}
function wireLogout() {
  document.querySelector("#logout")?.addEventListener("click", async () => {
    await clearOperationalData();
    if (trackingTimer !== null) window.clearInterval(trackingTimer);
    trackingTimer = null;
    trackingDevice = null;
    await auth?.signOut();
    manifest = null;
    renderLogin();
  });
}
function renderLogin() {
  root!.innerHTML = `<main class="login">${message ? `<div class="notice">${escape(message)}</div>` : ""}<form id="login" class="card"><h1>Driver sign in</h1><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label><button class="primary">Sign in</button></form></main>`;
  document.querySelector<HTMLFormElement>("#login")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    try {
      await auth?.signIn(String(f.get("email")), String(f.get("password")));
      await refresh();
    } catch {
      message = "Sign in failed.";
      renderLogin();
    }
  });
}
addEventListener("online", () => {
  online = true;
  void sync();
});
addEventListener("offline", () => {
  online = false;
  void render();
});
if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
if (!auth || !api)
  root.innerHTML =
    '<main class="login"><div class="notice">Driver environment is not configured.</div></main>';
else void refresh();
