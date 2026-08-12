export type Position = readonly [longitude: number, latitude: number];
export interface PolygonGeometry {
  readonly type: "Polygon";
  readonly coordinates: readonly (readonly Position[])[];
}
export interface MultiPolygonGeometry {
  readonly type: "MultiPolygon";
  readonly coordinates: readonly (readonly (readonly Position[])[])[];
}
export type TerritoryGeometry = PolygonGeometry | MultiPolygonGeometry;

export interface MapMarker {
  readonly id: string;
  readonly position: Position;
  readonly label: string;
  readonly kind: "depot" | "service-address";
}
export interface MapPolygon {
  readonly id: string;
  readonly geometry: TerritoryGeometry;
  readonly label: string;
  readonly priority: number;
  readonly active: boolean;
  readonly selected?: boolean;
  readonly ambiguous?: boolean;
}
export interface MapInteraction {
  readonly position: Position;
  readonly featureId?: string;
}

/** Provider-neutral boundary. Concrete browser map SDK types must not cross it. */
export interface GeographyMapAdapter {
  mount(container: HTMLElement): void;
  renderBaseMap(): void;
  setMarkers(markers: readonly MapMarker[]): void;
  setPolygons(polygons: readonly MapPolygon[]): void;
  beginPolygonDraw(onChange: (draft: TerritoryGeometry) => void): void;
  beginPolygonEdit(geometry: TerritoryGeometry, onChange: (draft: TerritoryGeometry) => void): void;
  deleteDraft(): void;
  fitBounds(positions: readonly Position[]): void;
  screenToCoordinate(x: number, y: number): Position;
  onInteraction(handler: (interaction: MapInteraction) => void): () => void;
  destroy(): void;
}

export interface TerritoryMapItem {
  readonly territoryId: string;
  readonly name: string;
  readonly priority: number;
  readonly serviceRegionId: string;
  readonly defaultDepotId: string | null;
  readonly serviceStatus: "active" | "inactive" | "limited";
  readonly isActive: boolean;
  readonly preferredCollectionDays: readonly number[];
  readonly eligibleTeamIds: readonly string[];
  readonly geometry: TerritoryGeometry | null;
  readonly updatedAt: string;
}
export interface DepotMapItem {
  readonly depotId: string;
  readonly name: string;
  readonly serviceRegionId: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly geofenceRadiusMetres: number;
  readonly isActive: boolean;
  readonly updatedAt: string;
}
export interface GeographyMapModel {
  readonly territories: readonly TerritoryMapItem[];
  readonly depots: readonly DepotMapItem[];
  readonly addresses: readonly {
    readonly serviceAddressId: string;
    readonly latitude: number;
    readonly longitude: number;
    readonly validationStatus: string;
  }[];
}

export interface PointQueryResult {
  readonly containingTerritories: readonly {
    readonly territoryId: string;
    readonly name: string;
    readonly priority: number;
    readonly serviceRegionId: string;
    readonly defaultDepotId: string | null;
  }[];
  readonly suggestedTerritoryId: string | null;
  readonly ambiguous: boolean;
}

export function positions(geometry: TerritoryGeometry): readonly Position[] {
  return geometry.type === "Polygon" ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
}
