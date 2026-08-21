import type { MasterDataApiClient } from "@megabin/api-client";
import type { DailyRosterModel } from "@megabin/daily-roster";
import type {
  RoutePlanDocument,
  PlannedRoute,
  RouteOptimizationAttempt
} from "@megabin/route-planning";
import { loadAuthorizedServiceRegions } from "./regions.js";
import { isOfficeMountCurrent, updateOfficeLocation, type OfficeLocation } from "./office-shell.js";
const esc = (v: string) =>
  v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
export async function renderRoutesWorkspace(
  root: HTMLElement,
  api: MasterDataApiClient,
  permissions: readonly string[],
  serviceRegionIds: readonly string[],
  signOut: () => Promise<void>,
  shell: { readonly mount: number; readonly location: OfficeLocation }
): Promise<void> {
  const regions = await loadAuthorizedServiceRegions(api, serviceRegionIds);
  if (!isOfficeMountCurrent(shell.mount)) return;
  const today = new Date().toISOString().slice(0, 10);
  const selectedDate = shell.location.serviceDate ?? today;
  const selectedRegion = shell.location.serviceRegionId ?? regions[0]?.serviceRegionId ?? "";
  let model: RoutePlanDocument | null = null;
  let optimization: RouteOptimizationAttempt | null = null;
  let providerStatus = "unknown";
  root.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav><button id="master-data">Master data</button><button id="daily-roster">Daily Roster</button><button aria-current="page">Route Planning</button></nav></aside><main><header><div><h1>Route Planning</h1><p>Deterministic plans from a locked daily roster</p></div><button id="logout">Sign out</button></header><div class="roster-toolbar"><label>Service date<input id="route-date" type="date" value="${selectedDate}"></label><label>Service region<select id="route-region">${regions.map((r) => `<option value="${r.serviceRegionId}" ${r.serviceRegionId === selectedRegion ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></label><button id="load">Load</button>${permissions.includes("routes.generate") ? '<button class="button" id="generate">Generate</button>' : ""}</div><div id="route-content" class="panel"><div class="empty">Choose a locked operational day to generate or load its route plan.</div></div></main></div>`;
  root.querySelector("#logout")?.addEventListener("click", () => void signOut());
  const element = <T extends Element>(selector: string): T => {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error(`Missing route element ${selector}`);
    return found;
  };
  const context = () => ({
    serviceRegionId: element<HTMLSelectElement>("#route-region").value,
    serviceDate: element<HTMLInputElement>("#route-date").value
  });
  let requestGeneration = 0;
  const current = (request: number) =>
    request === requestGeneration && isOfficeMountCurrent(shell.mount);
  const showLoading = () => {
    model = null;
    optimization = null;
    element("#route-content").innerHTML = '<div class="empty">Loading route plan…</div>';
  };
  const persistContext = () => {
    requestGeneration += 1;
    const c = context();
    updateOfficeLocation(
      { route: "route-planning", serviceRegionId: c.serviceRegionId, serviceDate: c.serviceDate },
      "replace"
    );
    model = null;
    optimization = null;
    element("#route-content").innerHTML =
      '<div class="empty">Date or region changed. Load to inspect this route plan.</div>';
  };
  const dateInput = element<HTMLInputElement>("#route-date");
  dateInput.addEventListener("input", persistContext);
  dateInput.addEventListener("change", persistContext);
  element<HTMLSelectElement>("#route-region").addEventListener("change", persistContext);
  const load = async () => {
    const request = ++requestGeneration;
    const c = context();
    updateOfficeLocation(
      { route: "route-planning", serviceRegionId: c.serviceRegionId, serviceDate: c.serviceDate },
      "replace"
    );
    showLoading();
    const nextModel = await api.findRoutePlan<RoutePlanDocument>(c.serviceRegionId, c.serviceDate);
    if (!current(request)) return;
    model = nextModel;
    if (permissions.includes("routes.optimization.read")) {
      const health = await api.routeProviderHealth<readonly { healthStatus: string }[]>(
        c.serviceRegionId
      );
      if (!current(request)) return;
      providerStatus = health[0]?.healthStatus ?? "unknown";
    }
    paint();
  };
  const generate = async () => {
    const request = ++requestGeneration;
    const c = context();
    updateOfficeLocation(
      { route: "route-planning", serviceRegionId: c.serviceRegionId, serviceDate: c.serviceDate },
      "replace"
    );
    showLoading();
    const nextRoster = await api.findRoster<DailyRosterModel>(c.serviceRegionId, c.serviceDate);
    if (!current(request)) return;
    if (!nextRoster || nextRoster.operationalDay.lifecycleStatus !== "locked")
      throw new Error("Lock the daily roster before generating routes.");
    const nextModel = await api.generateRoutePlan<RoutePlanDocument>(
      nextRoster.operationalDay.operationalDayId
    );
    if (!current(request)) return;
    model = nextModel;
    paint();
  };
  const paint = () => {
    if (!isOfficeMountCurrent(shell.mount)) return;
    const content = element("#route-content");
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
    root.querySelector("#validate")?.addEventListener("click", async () => {
      if (model)
        alert(JSON.stringify(await api.validateRouteVersion(model.routeVersionId), null, 2));
    });
    root.querySelector("#ready")?.addEventListener("click", () => void transition("ready"));
    root.querySelector("#publish")?.addEventListener("click", () => void transition("publish"));
    root.querySelector("#optimize")?.addEventListener("click", async () => {
      if (model) {
        optimization = await api.startRouteOptimization<RouteOptimizationAttempt>(
          model.routeVersionId,
          model.updatedAt
        );
        if (isOfficeMountCurrent(shell.mount)) paint();
      }
    });
    root.querySelector("#accept-candidate")?.addEventListener("click", async () => {
      if (model && optimization) {
        model = await api.acceptRouteOptimization<RoutePlanDocument>(
          optimization.routeOptimizationAttemptId,
          model.updatedAt
        );
        optimization = null;
        paint();
      }
    });
    root.querySelector("#reject-candidate")?.addEventListener("click", async () => {
      if (optimization) {
        optimization = await api.rejectRouteOptimization<RouteOptimizationAttempt>(
          optimization.routeOptimizationAttemptId,
          "Office rejected candidate"
        );
        paint();
      }
    });
    root.querySelector("#refresh-candidate")?.addEventListener("click", async () => {
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
  root.querySelector("#load")?.addEventListener("click", () => void load());
  root
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
