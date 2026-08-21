import type { MasterDataApiClient } from "@megabin/api-client";
import type {
  GeographyMapAdapter,
  GeographyMapModel,
  MapMarker,
  MapPolygon,
  Position,
  TerritoryGeometry
} from "@megabin/geography";
import { loadAuthorizedServiceRegions } from "./regions.js";

const escapeText = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character
  );
const points = (geometry: TerritoryGeometry): readonly Position[] =>
  geometry.type === "Polygon"
    ? (geometry.coordinates[0] ?? [])
    : (geometry.coordinates[0]?.[0] ?? []);
function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required geography element is missing: ${selector}`);
  return element;
}

/** Deliberately small local adapter: no external provider contract leaks into Office code. */
export class SvgGeographyMapAdapter implements GeographyMapAdapter {
  private container?: HTMLElement;
  private markers: readonly MapMarker[] = [];
  private polygons: readonly MapPolygon[] = [];
  private handler: ((value: { position: Position; featureId?: string }) => void) | undefined;
  mount(container: HTMLElement): void {
    this.container = container;
    this.paint();
  }
  renderBaseMap(): void {
    this.paint();
  }
  setMarkers(markers: readonly MapMarker[]): void {
    this.markers = markers;
    this.paint();
  }
  setPolygons(polygons: readonly MapPolygon[]): void {
    this.polygons = polygons;
    this.paint();
  }
  beginPolygonDraw(onChange: (draft: TerritoryGeometry) => void): void {
    onChange({
      type: "Polygon",
      coordinates: [
        [
          [28.15, -25.82],
          [28.32, -25.82],
          [28.32, -25.68],
          [28.15, -25.68],
          [28.15, -25.82]
        ]
      ]
    });
  }
  beginPolygonEdit(
    geometry: TerritoryGeometry,
    onChange: (draft: TerritoryGeometry) => void
  ): void {
    onChange(structuredClone(geometry));
  }
  deleteDraft(): void {
    /* draft belongs to the controller */
  }
  fitBounds(): void {
    this.paint();
  }
  screenToCoordinate(x: number, y: number): Position {
    return [16 + x / 10, -35 + y / 10];
  }
  onInteraction(handler: (value: { position: Position; featureId?: string }) => void): () => void {
    this.handler = handler;
    return () => {
      this.handler = undefined;
    };
  }
  destroy(): void {
    if (this.container) this.container.innerHTML = "";
  }
  private paint(): void {
    if (!this.container) return;
    const project = ([longitude, latitude]: Position) =>
      `${((longitude - 16) / 17) * 800},${((latitude + 35) / 13) * 480}`;
    this.container.innerHTML = `<svg class="admin-map" viewBox="0 0 800 480" role="img" aria-label="Geography configuration map"><rect width="800" height="480" fill="#e9f0eb"/><g class="map-grid"><path d="M0 120H800M0 240H800M0 360H800M200 0V480M400 0V480M600 0V480"/></g>${this.polygons.map((polygon) => `<polygon data-feature="${polygon.id}" points="${points(polygon.geometry).map(project).join(" ")}" class="territory-shape ${polygon.selected ? "selected" : ""} ${polygon.active ? "" : "inactive"} ${polygon.ambiguous ? "ambiguous" : ""}"><title>${escapeText(polygon.label)} · priority ${polygon.priority}</title></polygon>`).join("")}${this.markers
      .map((marker) => {
        const [x, y] = project(marker.position).split(",");
        return `<g data-feature="${marker.id}" class="marker ${marker.kind}" transform="translate(${x} ${y})"><circle r="7"/><text x="10" y="4">${escapeText(marker.label)}</text></g>`;
      })
      .join("")}</svg>`;
    this.container.querySelectorAll<SVGElement>("[data-feature]").forEach((feature) =>
      feature.addEventListener("click", () =>
        this.handler?.({
          position: [0, 0],
          ...(feature.dataset.feature ? { featureId: feature.dataset.feature } : {})
        })
      )
    );
  }
}

export async function renderGeographyWorkspace(
  root: HTMLElement,
  api: MasterDataApiClient,
  canWrite: boolean,
  serviceRegionIds: readonly string[],
  signOut: () => Promise<void>
): Promise<void> {
  const regions = await loadAuthorizedServiceRegions(api, serviceRegionIds);
  const regionId = regions[0]?.serviceRegionId;
  root.innerHTML = `<div class="shell"><aside><div class="brand">MegaBin Control Centre</div><nav><button id="master-data">Master data</button><button aria-current="page">Geography</button></nav></aside><main><header><div><h1>Geography</h1><p>Authoritative territory, depot and service-address configuration</p></div><button id="logout">Sign out</button></header>${regionId ? `<div class="geo-toolbar"><label>Service region<select id="region">${regions.map((region) => `<option value="${region.serviceRegionId}">${escapeText(region.name)}</option>`).join("")}</select></label><label><input id="depots" type="checkbox" checked> Depots</label><label><input id="addresses" type="checkbox"> Service addresses</label><button id="reviews">Assignment reviews</button></div><div class="geography-layout"><section class="geo-list"><h2>Territories</h2><div id="territories"></div>${canWrite ? '<button class="button" id="create-territory">Draw territory</button>' : ""}</section><section><div id="map"></div><div id="map-message" class="notice" hidden></div></section><section class="geo-details"><h2>Territory details</h2><div id="details">Select a territory on the map or list.</div></section></div><dialog id="territory-editor"><form id="territory-form"><h2>Territory editor</h2><input name="territoryId" type="hidden"><input name="expectedUpdatedAt" type="hidden"><label>Name<input name="name" required maxlength="120"></label><label>Priority<input name="priority" type="number" min="-10000" max="10000" value="0"></label><label>Default depot ID<input name="defaultDepotId"></label><label>Preferred days<input name="preferredCollectionDays" placeholder="1,3,5"></label><label>Eligible team IDs<input name="eligibleTeamIds" placeholder="UUID, UUID"></label><label>Service status<select name="serviceStatus"><option>active</option><option>limited</option><option>inactive</option></select></label><label>GeoJSON<textarea name="geometry" rows="10" required></textarea></label><div id="impact"></div><div class="actions"><button type="button" id="delete-draft">Delete draft</button><button type="button" id="cancel-edit">Cancel</button><button type="button" id="preview">Preview impact</button><button class="button">Save</button></div></form></dialog><dialog id="review-dialog"><h2>Geography assignment reviews</h2><div id="review-items"></div><button id="close-reviews">Close</button></dialog>` : '<div class="empty">Create a service region before configuring geography.</div>'}</main></div>`;
  document.querySelector("#logout")?.addEventListener("click", () => void signOut());
  if (!regionId) return;
  let model: GeographyMapModel;
  let selected: GeographyMapModel["territories"][number] | undefined;
  const adapter = new SvgGeographyMapAdapter();
  adapter.mount(required<HTMLElement>("#map"));
  const load = async () => {
    model = await api.geographyMap<GeographyMapModel>(required<HTMLSelectElement>("#region").value);
    paint();
  };
  const paint = () => {
    const showAddresses = required<HTMLInputElement>("#addresses").checked;
    const showDepots = required<HTMLInputElement>("#depots").checked;
    adapter.setPolygons(
      model.territories
        .filter(
          (item): item is typeof item & { geometry: TerritoryGeometry } => item.geometry !== null
        )
        .map((item) => ({
          id: item.territoryId,
          geometry: item.geometry,
          label: item.name,
          priority: item.priority,
          active: item.isActive,
          selected: item.territoryId === selected?.territoryId
        }))
    );
    adapter.setMarkers([
      ...(showDepots
        ? model.depots
            .filter(
              (item): item is typeof item & { latitude: number; longitude: number } =>
                item.latitude !== null && item.longitude !== null
            )
            .map((item) => ({
              id: item.depotId,
              position: [item.longitude, item.latitude] as Position,
              label: item.name,
              kind: "depot" as const
            }))
        : []),
      ...(showAddresses
        ? model.addresses.map((item) => ({
            id: item.serviceAddressId,
            position: [item.longitude, item.latitude] as Position,
            label: "Service address",
            kind: "service-address" as const
          }))
        : [])
    ]);
    required("#territories").innerHTML =
      model.territories
        .map(
          (item) =>
            `<button data-territory="${item.territoryId}" class="territory-row"><strong>${escapeText(item.name)}</strong><span>Priority ${item.priority} · ${item.serviceStatus}</span></button>`
        )
        .join("") || '<p class="empty">No territories.</p>';
    document.querySelectorAll<HTMLButtonElement>("[data-territory]").forEach(
      (button) =>
        (button.onclick = () => {
          if (button.dataset.territory) select(button.dataset.territory);
        })
    );
  };
  const select = (id: string) => {
    selected = model.territories.find((item) => item.territoryId === id);
    paint();
    required("#details").innerHTML = selected
      ? `<dl><dt>Name</dt><dd>${escapeText(selected.name)}</dd><dt>Priority</dt><dd>${selected.priority}</dd><dt>Status</dt><dd>${selected.serviceStatus}</dd></dl>${canWrite ? '<button class="button" id="edit-territory">Edit geometry and metadata</button>' : ""}`
      : "";
    document
      .querySelector("#edit-territory")
      ?.addEventListener("click", () => openEditor(selected));
  };
  adapter.onInteraction(({ featureId }) => {
    if (!featureId) return;
    if (model.territories.some((item) => item.territoryId === featureId)) select(featureId);
    else if (model.depots.some((item) => item.depotId === featureId)) showDepot(featureId);
    else void showAddress(featureId);
  });
  document.querySelector("#region")?.addEventListener("change", () => void load());
  document.querySelector("#depots")?.addEventListener("change", paint);
  document.querySelector("#addresses")?.addEventListener("change", paint);
  const dialog = required<HTMLDialogElement>("#territory-editor");
  const form = required<HTMLFormElement>("#territory-form");
  const showDepot = (id: string) => {
    const depot = model.depots.find((item) => item.depotId === id);
    if (!depot) return;
    required("#details").innerHTML =
      `<h3>${escapeText(depot.name)}</h3><p>Depot marker · geofence ${depot.geofenceRadiusMetres} m</p>${canWrite ? `<form id="depot-form"><label>Latitude<input name="latitude" type="number" step="any" value="${depot.latitude ?? ""}" required></label><label>Longitude<input name="longitude" type="number" step="any" value="${depot.longitude ?? ""}" required></label><label>Geofence metres<input name="radius" type="number" min="10" max="5000" value="${depot.geofenceRadiusMetres}" required></label><button class="button">Save depot location</button></form>` : ""}`;
    document
      .querySelector<HTMLFormElement>("#depot-form")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget as HTMLFormElement);
        await api.updateDepotGeography(depot.depotId, {
          latitude: Number(values.get("latitude")),
          longitude: Number(values.get("longitude")),
          geofenceRadiusMetres: Number(values.get("radius")),
          expectedUpdatedAt: depot.updatedAt
        });
        await load();
      });
  };
  const showAddress = async (id: string) => {
    const context = await api.serviceAddressGeography<{
      clientServiceId: string;
      suggestedTerritoryId: string | null;
      currentTerritoryId: string | null;
      territoryIsOverride: boolean;
      ambiguous: boolean;
      mismatch: boolean;
    }>(id);
    required("#details").innerHTML =
      `<h3>Service-address geography</h3><dl><dt>Suggested</dt><dd>${escapeText(context.suggestedTerritoryId ?? (context.ambiguous ? "Ambiguous" : "None"))}</dd><dt>Configured</dt><dd>${escapeText(context.currentTerritoryId ?? "None")}</dd><dt>Permanent override</dt><dd>${context.territoryIsOverride ? "Yes" : "No"}</dd><dt>Review state</dt><dd>${context.mismatch || context.ambiguous ? "Needs review" : "Aligned"}</dd></dl>${canWrite ? `<form id="override-form"><label>Permanent territory ID<input name="territoryId" value="${context.currentTerritoryId ?? ""}"></label><button class="button" name="action" value="set">Set override</button><button name="action" value="remove">Remove override</button></form>` : ""}`;
    document
      .querySelector<HTMLFormElement>("#override-form")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget as HTMLFormElement);
        const remove = (event.submitter as HTMLButtonElement | null)?.value === "remove";
        await api.setTerritoryOverride(context.clientServiceId, {
          territoryId: values.get("territoryId") || null,
          remove
        });
        await showAddress(id);
      });
  };
  const openEditor = (item?: GeographyMapModel["territories"][number]) => {
    form.reset();
    (form.elements.namedItem("territoryId") as HTMLInputElement).value = item?.territoryId ?? "";
    (form.elements.namedItem("expectedUpdatedAt") as HTMLInputElement).value =
      item?.updatedAt ?? "";
    (form.elements.namedItem("name") as HTMLInputElement).value = item?.name ?? "";
    (form.elements.namedItem("priority") as HTMLInputElement).value = String(item?.priority ?? 0);
    (form.elements.namedItem("geometry") as HTMLTextAreaElement).value = item?.geometry
      ? JSON.stringify(item.geometry, null, 2)
      : "";
    if (!item)
      adapter.beginPolygonDraw((draft) => {
        (form.elements.namedItem("geometry") as HTMLTextAreaElement).value = JSON.stringify(
          draft,
          null,
          2
        );
      });
    dialog.showModal();
  };
  document.querySelector("#create-territory")?.addEventListener("click", () => openEditor());
  document.querySelector("#cancel-edit")?.addEventListener("click", () => {
    adapter.deleteDraft();
    dialog.close();
  });
  document.querySelector("#delete-draft")?.addEventListener("click", () => {
    (form.elements.namedItem("geometry") as HTMLTextAreaElement).value = "";
    adapter.deleteDraft();
  });
  const body = () => ({
    serviceRegionId: required<HTMLSelectElement>("#region").value,
    name: (form.elements.namedItem("name") as HTMLInputElement).value,
    priority: Number((form.elements.namedItem("priority") as HTMLInputElement).value),
    defaultDepotId:
      (form.elements.namedItem("defaultDepotId") as HTMLInputElement).value || undefined,
    preferredCollectionDays: (
      form.elements.namedItem("preferredCollectionDays") as HTMLInputElement
    ).value
      .split(",")
      .filter(Boolean)
      .map(Number),
    eligibleTeamIds: (form.elements.namedItem("eligibleTeamIds") as HTMLInputElement).value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    serviceStatus: (form.elements.namedItem("serviceStatus") as HTMLSelectElement).value,
    isActive: true,
    geometry: JSON.parse(
      (form.elements.namedItem("geometry") as HTMLTextAreaElement).value
    ) as TerritoryGeometry,
    expectedUpdatedAt: (form.elements.namedItem("expectedUpdatedAt") as HTMLInputElement).value
  });
  document.querySelector("#preview")?.addEventListener("click", async () => {
    const id = (form.elements.namedItem("territoryId") as HTMLInputElement).value;
    if (!id) {
      required("#impact").textContent =
        "A new territory never assigns existing services automatically.";
      return;
    }
    const result = await api.territoryImpact<readonly unknown[]>(id, body());
    required("#impact").textContent = `${result.length} active service(s) require review if saved.`;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = (form.elements.namedItem("territoryId") as HTMLInputElement).value;
    if (id) await api.updateTerritoryGeometry(id, body());
    else await api.createTerritoryGeometry(body());
    dialog.close();
    await load();
  });
  const reviewDialog = required<HTMLDialogElement>("#review-dialog");
  document.querySelector("#reviews")?.addEventListener("click", async () => {
    const reviews = await api.geographyReviews<readonly Record<string, unknown>[]>(
      required<HTMLSelectElement>("#region").value
    );
    required("#review-items").innerHTML =
      reviews
        .map(
          (review) =>
            `<article class="review"><strong>${escapeText(String(review.reason))}</strong><p>Service ${escapeText(String(review.clientServiceId))}</p><p>Current ${escapeText(String(review.currentTerritoryId ?? "none"))} → suggested ${escapeText(String(review.newSuggestedTerritoryId ?? "ambiguous/none"))}${review.territoryIsOverride ? " · permanent override" : ""}</p><button data-review="${review.geographyAssignmentReviewId}" data-resolution="dismiss" data-updated="${review.updatedAt}">Retain / dismiss</button>${review.newSuggestedTerritoryId ? `<button class="button" data-review="${review.geographyAssignmentReviewId}" data-resolution="confirm" data-updated="${review.updatedAt}">Confirm new assignment</button>` : ""}</article>`
        )
        .join("") || '<p class="empty">No open reviews.</p>';
    document.querySelectorAll<HTMLButtonElement>("[data-review]").forEach((button) =>
      button.addEventListener("click", async () => {
        if (!button.dataset.review) return;
        await api.resolveGeographyReview(button.dataset.review, {
          resolution: button.dataset.resolution,
          expectedUpdatedAt: button.dataset.updated
        });
        button.closest("article")?.remove();
      })
    );
    reviewDialog.showModal();
  });
  document.querySelector("#close-reviews")?.addEventListener("click", () => reviewDialog.close());
  await load();
}
