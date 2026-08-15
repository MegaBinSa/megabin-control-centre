import type { MasterDataApiClient } from "@megabin/api-client";
import type { DailyRosterModel } from "@megabin/daily-roster";
import type {
  RoutePlanDocument,
  PlannedRoute,
  RouteOptimizationAttempt
} from "@megabin/route-planning";
import { loadAuthorizedServiceRegions } from "./regions.js";
const esc = (v: string) =>
  v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const req = <T extends Element>(s: string) => {
  const e = document.querySelector<T>(s);
  if (!e) throw new Error(`Missing route element ${s}`);
  return e;
};
export async function renderRoutesWorkspace(
  root: HTMLElement,
  api: MasterDataApiClient,
  permissions: readonly string[],
  serviceRegionIds: readonly string[],
  signOut: () => Promise<void>
): Promise<void> {
  const regions = await loadAuthorizedServiceRegions(api, serviceRegionIds);
  const today = new Date().toISOString().slice(0, 10);
  let model: RoutePlanDocument | null = null;
  let roster: DailyRosterModel | null = null;
  let optimization: RouteOptimizationAttempt | null = null;
  let providerStatus = "unknown";
  root.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav><button id="master-data">Master data</button><button id="daily-roster">Daily Roster</button><button aria-current="page">Route Planning</button></nav></aside><main><header><div><h1>Route Planning</h1><p>Deterministic plans from a locked daily roster</p></div><button id="logout">Sign out</button></header><div class="roster-toolbar"><label>Service date<input id="route-date" type="date" value="${today}"></label><label>Service region<select id="route-region">${regions.map((r) => `<option value="${r.serviceRegionId}">${esc(r.name)}</option>`).join("")}</select></label><button id="load">Load</button>${permissions.includes("routes.generate") ? '<button class="button" id="generate">Generate</button>' : ""}</div><div id="route-content" class="panel"><div class="empty">Choose a locked operational day to generate or load its route plan.</div></div></main></div>`;
  document.querySelector("#logout")?.addEventListener("click", () => void signOut());
  document.querySelector("#master-data")?.addEventListener("click", () => location.reload());
  document.querySelector("#daily-roster")?.addEventListener("click", () => location.reload());
  const context = () => ({
    serviceRegionId: req<HTMLSelectElement>("#route-region").value,
    serviceDate: req<HTMLInputElement>("#route-date").value
  });
  const load = async () => {
    const c = context();
    model = await api.findRoutePlan<RoutePlanDocument>(c.serviceRegionId, c.serviceDate);
    roster = await api.findRoster<DailyRosterModel>(c.serviceRegionId, c.serviceDate);
    if (permissions.includes("routes.optimization.read")) {
      const health = await api.routeProviderHealth<readonly { healthStatus: string }[]>(
        c.serviceRegionId
      );
      providerStatus = health[0]?.healthStatus ?? "unknown";
    }
    paint();
  };
  const generate = async () => {
    const c = context();
    roster = await api.findRoster<DailyRosterModel>(c.serviceRegionId, c.serviceDate);
    if (!roster || roster.operationalDay.lifecycleStatus !== "locked")
      throw new Error("Lock the daily roster before generating routes.");
    model = await api.generateRoutePlan<RoutePlanDocument>(roster.operationalDay.operationalDayId);
    paint();
  };
  const paint = () => {
    const content = req("#route-content");
    if (!model) {
      content.innerHTML = '<div class="empty">No route plan exists for this date.</div>';
      return;
    }
    content.innerHTML = `<div class="roster-summary"><div><span class="status">${esc(model.versionStatus)}</span><strong>Version ${model.versionNumber}${model.isStale ? " · stale roster input" : ""}</strong><small>Strategy: deterministic baseline</small></div><div class="actions">${model.versionStatus === "draft" && permissions.includes("routes.optimize") ? '<button class="button" id="optimize">Optimize</button>' : ""}${model.versionStatus === "draft" && permissions.includes("routes.write") ? '<button id="validate">Validate</button>' : ""}${model.versionStatus === "draft" ? '<button id="ready">Mark Ready</button>' : ""}${model.versionStatus === "ready" && permissions.includes("routes.publish") ? '<button class="button" id="publish">Publish</button>' : ""}</div></div>${optimization ? optimizationPanel(optimization) : ""}<div class="route-planner"><section>${model.routes.map(routeCard).join("") || '<div class="empty">No roster routes available.</div>'}</section><aside class="route-map" aria-label="Schematic route geography">${schematic(model.routes)}</aside></div><section class="unassigned"><h2>Unassigned services (${model.unassignedServices.length})</h2>${model.unassignedServices.map((u) => `<article><strong>${esc(u.reasonCode)}</strong><span>${esc(u.remediation)}</span><code>${esc(u.clientServiceId)}</code></article>`).join("") || "<p>All eligible services are assigned.</p>"}</section>`;
    const strategy = content.querySelector(".roster-summary small");
    if (strategy)
      strategy.textContent = `Strategy: ${model.generationMethod === "provider_optimized" ? "provider optimized" : "deterministic baseline"}`;
    if (optimization?.candidateResult) {
      content
        .querySelector(".optimization-panel")
        ?.insertAdjacentHTML(
          "beforeend",
          `${candidateMap(optimization)}${optimization.providerWarnings.length ? `<p class="warning">${optimization.providerWarnings.map(esc).join("; ")}</p>` : ""}<small>${optimization.candidateResult.unassignedStopIds.length} unassigned stop(s)</small>`
        );
    }
    content.insertAdjacentHTML(
      "afterbegin",
      `<div class="provider-health">Optimization provider: <strong>${esc(providerStatus)}</strong></div>`
    );
    document.querySelector("#validate")?.addEventListener("click", async () => {
      if (model)
        alert(JSON.stringify(await api.validateRouteVersion(model.routeVersionId), null, 2));
    });
    document.querySelector("#ready")?.addEventListener("click", () => void transition("ready"));
    document.querySelector("#publish")?.addEventListener("click", () => void transition("publish"));
    document.querySelector("#optimize")?.addEventListener("click", async () => {
      if (model) {
        optimization = await api.startRouteOptimization<RouteOptimizationAttempt>(
          model.routeVersionId,
          model.updatedAt
        );
        paint();
      }
    });
    document.querySelector("#accept-candidate")?.addEventListener("click", async () => {
      if (model && optimization) {
        model = await api.acceptRouteOptimization<RoutePlanDocument>(
          optimization.routeOptimizationAttemptId,
          model.updatedAt
        );
        optimization = null;
        paint();
      }
    });
    document.querySelector("#reject-candidate")?.addEventListener("click", async () => {
      if (optimization) {
        optimization = await api.rejectRouteOptimization<RouteOptimizationAttempt>(
          optimization.routeOptimizationAttemptId,
          "Office rejected candidate"
        );
        paint();
      }
    });
    document.querySelector("#refresh-candidate")?.addEventListener("click", async () => {
      if (optimization) {
        optimization = await api.routeOptimization<RouteOptimizationAttempt>(
          optimization.routeOptimizationAttemptId
        );
        paint();
      }
    });
  };
  const transition = async (target: "ready" | "publish") => {
    if (!model) return;
    model = await api.transitionRouteVersion<RoutePlanDocument>(
      model.routeVersionId,
      target,
      model.updatedAt
    );
    paint();
  };
  document.querySelector("#load")?.addEventListener("click", () => void load());
  document
    .querySelector("#generate")
    ?.addEventListener(
      "click",
      () =>
        void generate().catch((e) => alert(e instanceof Error ? e.message : "Generation failed"))
    );
  await load();
}
function optimizationPanel(a: RouteOptimizationAttempt) {
  const c = a.comparison ?? {};
  return `<section class="optimization-panel"><header><h2>Optimization candidate</h2><span class="status">${esc(a.lifecycleStatus)}</span></header><p>${esc(a.optimizationProvider)} · static road estimates</p>${a.failureSummary ? `<div class="error">${esc(a.failureSummary)}</div>` : `<div class="comparison"><span>Baseline ${c.baselineDistanceMetres ?? 0} m</span><span>Candidate ${c.candidateDistanceMetres ?? 0} m</span><span>Baseline ${c.baselineDurationMinutes ?? 0} min</span><span>Candidate ${c.candidateDurationMinutes ?? 0} min</span></div>`}<div class="actions">${a.lifecycleStatus === "succeeded" ? '<button class="button" id="accept-candidate">Accept candidate</button><button id="reject-candidate">Reject</button>' : a.lifecycleStatus === "pending" || a.lifecycleStatus === "running" ? '<button id="refresh-candidate">Refresh progress</button>' : ""}</div></section>`;
}
function routeCard(r: PlannedRoute) {
  return `<article class="route-card"><header><h3>${esc(r.teamName)}</h3><span>${esc(r.vehicleName)}</span></header><p>${r.plannedCapacityUnits}/${r.vehicleCapacityUnits} drums · ${r.plannedDurationMinutes}/${r.usableWindowMinutes} min</p><ol>${r.stops.map((s) => `<li><strong>${s.sequenceNumber}</strong> ${esc(String(s.addressSnapshot.line1 ?? s.clientServiceId))} <span>${s.drumUnits} drum(s)</span></li>`).join("")}</ol></article>`;
}
function candidateMap(attempt: RouteOptimizationAttempt) {
  const colors = ["#1c7552", "#245b91", "#9a5200", "#713a8a"];
  return `<div class="candidate-map"><strong>Candidate road geometry</strong><svg viewBox="0 0 100 100" role="img" aria-label="Optimized candidate road route">${attempt.candidateResult?.routes.map((route, index) => `<polyline fill="none" stroke="${colors[index % colors.length]}" stroke-width="1" points="${route.geometry.coordinates.map(([longitude, latitude]) => `${((longitude + 180) / 360) * 100},${((90 - latitude) / 180) * 100}`).join(" ")}"/>`).join("") ?? ""}</svg></div>`;
}
function schematic(routes: readonly PlannedRoute[]) {
  const colors = ["#1c7552", "#245b91", "#9a5200", "#713a8a"];
  const points = routes.flatMap((r, i) =>
    r.stops.map((s) => ({
      x: ((s.longitude + 180) / 360) * 100,
      y: ((90 - s.latitude) / 180) * 100,
      c: colors[i % colors.length]
    }))
  );
  return `<svg viewBox="0 0 100 100" role="img" aria-label="Provider-neutral schematic of planned stop order">${routes.map((r, i) => `<polyline fill="none" stroke="${colors[i % colors.length]}" stroke-width="1" points="${r.stops.map((s) => `${((s.longitude + 180) / 360) * 100},${((90 - s.latitude) / 180) * 100}`).join(" ")}"/>`).join("")}${points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="1.8" fill="${p.c}"/>`).join("")}</svg>`;
}
