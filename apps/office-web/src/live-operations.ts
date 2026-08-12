/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { MasterDataApiClient } from "@megabin/api-client";
interface Route {
  routeOperationId: string;
  vehicleId: string;
  vehicleName: string;
  registrationReference: string;
  teamName?: string;
  routeStatus: string;
  currentInterpretation: string;
  authoritativeCompletedStops: number;
  inferredVisitedStops: number;
  remainingStops: number;
  scheduleRisk: string;
  trackingHealth: string;
  openFactCount: number;
  position?: { latitude: number; longitude: number; recordedAt: string; accuracyMetres: number };
}
interface Fact {
  operationalFactId: string;
  factType: string;
  vehicleName: string;
  teamName?: string;
  routeOperationId?: string;
  severity: string;
  confidence: string;
  lifecycleStatus: string;
  detectedAt: string;
  summary: string;
  evidence: Record<string, unknown>;
}
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
export async function renderLiveOperationsWorkspace(
  root: HTMLElement,
  api: MasterDataApiClient,
  permissions: readonly string[],
  signOut: () => Promise<void>
) {
  const regions = (await api.list<{ serviceRegionId: string; name: string }>("service-regions"))
    .items;
  let regionId = regions[0]?.serviceRegionId ?? "",
    routes: Route[] = [],
    facts: Fact[] = [],
    needsCount = 0,
    error = "",
    selected: Route | null = null;
  const load = async () => {
    try {
      const [overview, items, needs] = await Promise.all([
        api.liveOperations<{ routes: Route[]; openNeedsAttention: number }>(regionId),
        api.operationalFacts<Fact[]>(regionId),
        api.needsAttention<unknown[]>(regionId)
      ]);
      routes = overview.routes;
      facts = items;
      needsCount = needs.length;
      error = "";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Unable to load live operations.";
    }
    render();
  };
  const render = () => {
    root.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav><button id="back">Master Data</button><button aria-current="page">Live Operations</button></nav></aside><main><header><div><h1>Live Operations</h1><p>Reviewable intelligence · inferred evidence never changes route truth</p></div><button id="logout">Sign out</button></header>${error ? `<div class="error">${escape(error)}</div>` : ""}<section class="panel"><div class="toolbar"><label>Region<select id="region">${regions.map((r) => `<option value="${r.serviceRegionId}" ${r.serviceRegionId === regionId ? "selected" : ""}>${escape(r.name)}</option>`).join("")}</select></label><button id="refresh">Refresh</button><span class="status">${needsCount} Needs Attention</span></div></section><section class="panel"><h2>Fleet awareness</h2><div class="tracking-map">${
      routes
        .filter((r) => r.position)
        .map(
          (r, i) =>
            `<button class="vehicle-marker ${escape(r.scheduleRisk)}" style="left:${10 + ((i * 29) % 80)}%;top:${15 + ((i * 31) % 70)}%" data-route="${r.routeOperationId}">${i + 1}</button>`
        )
        .join("") || '<div class="empty">No live route positions.</div>'
    }</div>${selected ? `<div class="route-card"><h3>${escape(selected.vehicleName)} · ${escape(selected.teamName ?? "No team")}</h3><p>Authoritative route: ${escape(selected.routeStatus)}</p><p>Inferred: ${escape(selected.currentInterpretation)} · Next/current context is advisory</p><p>Progress: ${selected.authoritativeCompletedStops} authoritative, ${selected.inferredVisitedStops} inferred, ${selected.remainingStops} remaining</p><p>Schedule: ${escape(selected.scheduleRisk)} · Tracking: ${escape(selected.trackingHealth)}</p><p>${selected.openFactCount} open facts</p></div>` : ""}</section><section class="panel"><h2>Route status</h2><table><thead><tr><th>Team / vehicle</th><th>Route truth</th><th>Interpretation</th><th>Risk</th><th>Facts</th></tr></thead><tbody>${routes.map((r) => `<tr data-route="${r.routeOperationId}"><td>${escape(r.teamName ?? "—")}<br>${escape(r.vehicleName)}</td><td>${escape(r.routeStatus)}<br>${r.authoritativeCompletedStops} completed</td><td>${escape(r.currentInterpretation)}<br>${r.remainingStops} remaining</td><td>${escape(r.scheduleRisk)}<br>${escape(r.trackingHealth)}</td><td>${r.openFactCount}</td></tr>`).join("")}</tbody></table></section><section class="panel"><h2>Operational facts</h2>${facts.map((f) => `<article class="route-card"><h3>${escape(f.factType.replaceAll("_", " "))} · ${escape(f.severity)}</h3><p>${escape(f.vehicleName)} · ${escape(f.teamName ?? "—")} · ${escape(f.confidence)} confidence</p><p>${escape(f.summary)}</p><p>Detected ${escape(new Date(f.detectedAt).toLocaleString())}</p><details><summary>Evidence</summary><pre>${escape(JSON.stringify(f.evidence, null, 2))}</pre></details>${permissions.includes("operational_intelligence.review") ? `<div class="actions"><button data-action="acknowledge" data-fact="${f.operationalFactId}">Acknowledge</button><button data-action="resolve" data-fact="${f.operationalFactId}">Resolve</button><button data-action="dismiss" data-fact="${f.operationalFactId}">Dismiss false positive</button></div>` : ""}</article>`).join("") || '<div class="empty">No open operational facts.</div>'}</section></main></div>`;
    root.querySelector("#region")?.addEventListener("change", (e) => {
      regionId = (e.target as HTMLSelectElement).value;
      void load();
    });
    root.querySelector("#refresh")?.addEventListener("click", () => void load());
    root.querySelectorAll<HTMLElement>("[data-route]").forEach((el) =>
      el.addEventListener("click", () => {
        selected = routes.find((r) => r.routeOperationId === el.dataset.route) ?? null;
        render();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-action]").forEach((button) =>
      button.addEventListener("click", async () => {
        const action = button.dataset.action!,
          reason = action === "acknowledge" ? undefined : prompt("Resolution reason");
        if (action !== "acknowledge" && !reason) return;
        await api.reviewOperationalFact(button.dataset.fact!, action, reason ?? undefined);
        await load();
      })
    );
    root.querySelector("#back")?.addEventListener("click", () => location.reload());
    root.querySelector("#logout")?.addEventListener("click", () => void signOut());
  };
  await load();
  const timer = setInterval(() => void load(), 30_000);
  window.addEventListener("beforeunload", () => clearInterval(timer), { once: true });
}
