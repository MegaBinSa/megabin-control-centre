export type OfficeRoute =
  | "clients"
  | "client-contacts"
  | "service-addresses"
  | "client-services"
  | "service-configurations"
  | "service-regions"
  | "depots"
  | "territories"
  | "teams"
  | "staff"
  | "vehicles"
  | "geography"
  | "daily-roster"
  | "route-planning"
  | "route-operations"
  | "live-vehicles"
  | "live-operations"
  | "website-intake"
  | "client-migration"
  | "accounting"
  | "financial-eligibility"
  | "communications"
  | "client-skip";

export interface OfficeLocation {
  readonly route: OfficeRoute;
  readonly serviceRegionId?: string;
  readonly serviceDate?: string;
}

const knownRoutes = new Set<OfficeRoute>([
  "clients",
  "client-contacts",
  "service-addresses",
  "client-services",
  "service-configurations",
  "service-regions",
  "depots",
  "territories",
  "teams",
  "staff",
  "vehicles",
  "geography",
  "daily-roster",
  "route-planning",
  "route-operations",
  "live-vehicles",
  "live-operations",
  "website-intake",
  "client-migration",
  "accounting",
  "financial-eligibility",
  "communications",
  "client-skip"
]);

let mountGeneration = 0;

export function beginOfficeMount(): number {
  mountGeneration += 1;
  return mountGeneration;
}

export function isOfficeMountCurrent(generation: number): boolean {
  return generation === mountGeneration;
}

export function readOfficeLocation(url = new URL(window.location.href)): OfficeLocation {
  const candidate = url.searchParams.get("module") as OfficeRoute | null;
  const serviceRegionId = url.searchParams.get("region");
  const serviceDate = url.searchParams.get("date");
  return {
    route: candidate && knownRoutes.has(candidate) ? candidate : "clients",
    ...(serviceRegionId ? { serviceRegionId } : {}),
    ...(serviceDate ? { serviceDate } : {})
  };
}

export function officeUrl(location: OfficeLocation, currentHref = window.location.href): string {
  const url = new URL(currentHref);
  url.search = "";
  if (location.route !== "clients") url.searchParams.set("module", location.route);
  if (location.serviceRegionId) url.searchParams.set("region", location.serviceRegionId);
  if (location.serviceDate) url.searchParams.set("date", location.serviceDate);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function shouldBootstrapOfficeSession(event: string, hasIdentity: boolean): boolean {
  return !hasIdentity && (event === "INITIAL_SESSION" || event === "SIGNED_IN");
}

export function updateOfficeLocation(
  location: OfficeLocation,
  mode: "push" | "replace" = "push"
): void {
  window.history[mode === "push" ? "pushState" : "replaceState"](
    { office: location },
    "",
    officeUrl(location)
  );
}

export function markFormClean(form: HTMLFormElement | null | undefined): void {
  if (form) delete form.dataset.dirty;
}

export function hasUnsavedOfficeForm(root: HTMLElement): boolean {
  return root.querySelector('dialog[open] form[data-dirty="true"]') !== null;
}

export function installDirtyFormTracking(root: HTMLElement): () => void {
  const markDirty = (event: Event) => {
    const element = event.target;
    if (!(element instanceof Element)) return;
    const form = element.closest<HTMLFormElement>("dialog[open] form");
    if (form) form.dataset.dirty = "true";
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!hasUnsavedOfficeForm(root)) return;
    event.preventDefault();
    event.returnValue = "";
  };
  root.addEventListener("input", markDirty, true);
  root.addEventListener("change", markDirty, true);
  window.addEventListener("beforeunload", beforeUnload);
  return () => {
    root.removeEventListener("input", markDirty, true);
    root.removeEventListener("change", markDirty, true);
    window.removeEventListener("beforeunload", beforeUnload);
  };
}
