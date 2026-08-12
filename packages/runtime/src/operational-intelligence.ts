export type Confidence = "low" | "medium" | "high";
export type Severity = "info" | "warning" | "critical";

export interface TrackingEvidencePoint {
  readonly observationId: string;
  readonly recordedAt: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMetres: number;
  readonly speedMetresPerSecond?: number;
}
export interface IntelligenceStop {
  readonly stopId: string;
  readonly sequence: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly authoritativeOutcome?: string;
  readonly authoritativeCompletedAt?: string;
  readonly plannedTravelMinutes?: number;
}
export interface IntelligenceRules {
  readonly arrivalRadiusMetres: number;
  readonly departureRadiusMetres: number;
  readonly minimumDwellSeconds: number;
  readonly corridorToleranceMetres: number;
  readonly deviationMinimumObservations: number;
  readonly stationarySeconds: number;
  readonly stationaryRadiusMetres: number;
  readonly lateStartToleranceSeconds: number;
  readonly interStopDurationMultiplier: number;
  readonly outsideHoursGraceSeconds: number;
  readonly minimumAccuracyMetres: number;
  readonly completionToleranceSeconds: number;
  readonly ruleVersion: string;
}
export interface IntelligenceSnapshot {
  readonly serviceRegionId: string;
  readonly vehicleId: string;
  readonly routeOperationId: string;
  readonly sourceRouteVersionId: string;
  readonly manifestRevision: number;
  readonly routeStatus: string;
  readonly now: string;
  readonly plannedStartAt: string;
  readonly plannedEndAt: string;
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly trackingHealth: string;
  readonly points: readonly TrackingEvidencePoint[];
  readonly stops: readonly IntelligenceStop[];
  readonly corridor?: readonly { latitude: number; longitude: number }[];
  readonly insideExpectedArea?: boolean;
  readonly atDepot?: boolean;
  readonly existingOpenDeviation?: boolean;
}
export interface OperationalSignal {
  readonly factType: string;
  readonly vehicleId: string;
  readonly routeOperationId: string;
  readonly routeOperationStopId?: string;
  readonly serviceRegionId: string;
  readonly detectedAt: string;
  readonly evidenceFrom: string;
  readonly evidenceTo: string;
  readonly confidence: Confidence;
  readonly severity: Severity;
  readonly status?: "open" | "resolved";
  readonly resolutionReason?: string;
  readonly deduplicationKey: string;
  readonly ruleVersion: string;
  readonly sourceRouteVersionId: string;
  readonly sourceManifestRevision: number;
  readonly summary: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly firstObservationId?: string | undefined;
  readonly lastObservationId?: string | undefined;
}

const earthRadius = 6_371_000;
const distance = (a: { latitude: number; longitude: number }, b: typeof a) => {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const lat1 = a.latitude * radians;
  const lat2 = b.latitude * radians;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(value));
};
const corridorDistance = (
  point: TrackingEvidencePoint,
  corridor: readonly { latitude: number; longitude: number }[]
) => {
  const latitudeScale = 111_320;
  const longitudeScale = Math.cos((point.latitude * Math.PI) / 180) * latitudeScale;
  const segmentDistance = (
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number }
  ) => {
    const ax = (start.longitude - point.longitude) * longitudeScale;
    const ay = (start.latitude - point.latitude) * latitudeScale;
    const bx = (end.longitude - point.longitude) * longitudeScale;
    const by = (end.latitude - point.latitude) * latitudeScale;
    const dx = bx - ax,
      dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / Math.max(dx * dx + dy * dy, 1)));
    return Math.hypot(ax + t * dx, ay + t * dy);
  };
  const firstCorridorPoint = corridor[0];
  if (!firstCorridorPoint) return Number.POSITIVE_INFINITY;
  if (corridor.length === 1) return distance(point, firstCorridorPoint);
  const distances: number[] = [];
  for (let index = 1; index < corridor.length; index += 1) {
    const start = corridor[index - 1];
    const end = corridor[index];
    if (start && end) distances.push(segmentDistance(start, end));
  }
  return Math.min(...distances);
};

export function evaluateOperationalIntelligence(
  snapshot: IntelligenceSnapshot,
  rules: IntelligenceRules
): { signals: readonly OperationalSignal[]; progress: Readonly<Record<string, unknown>> } {
  const ordered = [...snapshot.points].sort(
    (a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)
  );
  const usable = ordered.filter((point) => point.accuracyMetres <= rules.minimumAccuracyMetres);
  const latest = usable.at(-1);
  const first = usable[0];
  const base = (factType: string, key: string, summary: string): OperationalSignal => ({
    factType,
    vehicleId: snapshot.vehicleId,
    routeOperationId: snapshot.routeOperationId,
    serviceRegionId: snapshot.serviceRegionId,
    detectedAt: snapshot.now,
    evidenceFrom: first?.recordedAt ?? snapshot.now,
    evidenceTo: latest?.recordedAt ?? snapshot.now,
    confidence: usable.length >= 3 ? "high" : usable.length >= 2 ? "medium" : "low",
    severity: "warning",
    deduplicationKey: `${snapshot.routeOperationId}:${key}`,
    ruleVersion: rules.ruleVersion,
    sourceRouteVersionId: snapshot.sourceRouteVersionId,
    sourceManifestRevision: snapshot.manifestRevision,
    summary,
    evidence: { supportingObservationCount: usable.length },
    firstObservationId: first?.observationId,
    lastObservationId: latest?.observationId
  });
  const signals: OperationalSignal[] = [];
  const remaining = snapshot.stops.filter((stop) => !stop.authoritativeOutcome);
  const next = remaining[0];
  let currentStop: IntelligenceStop | undefined;
  if (next && latest) {
    const inside = usable.filter((point) => distance(point, next) <= rules.arrivalRadiusMetres);
    const firstInside = inside[0];
    const lastInside = inside.at(-1);
    const dwell =
      firstInside && lastInside
        ? (Date.parse(lastInside.recordedAt) - Date.parse(firstInside.recordedAt)) / 1000
        : 0;
    if (inside.length >= 2 && dwell >= rules.minimumDwellSeconds) {
      currentStop = next;
      signals.push({
        ...base(
          "stop_arrival",
          `arrival:${next.stopId}`,
          `Candidate arrival at stop ${next.sequence}`
        ),
        routeOperationStopId: next.stopId,
        severity: "info",
        evidence: {
          supportingObservationCount: inside.length,
          minimumDistanceMetres: Math.min(...inside.map((point) => distance(point, next))),
          dwellSeconds: dwell,
          authoritativeOutcome: next.authoritativeOutcome ?? null
        }
      });
      if (distance(latest, next) > rules.departureRadiusMetres) {
        signals.push({
          ...base(
            "stop_departure",
            `departure:${next.stopId}`,
            `Candidate departure from stop ${next.sequence}`
          ),
          routeOperationStopId: next.stopId,
          severity: "info",
          evidence: { dwellSeconds: dwell, departureDistanceMetres: distance(latest, next) }
        });
        currentStop = undefined;
      }
    }
  }
  if (snapshot.corridor?.length && usable.length) {
    const corridor = snapshot.corridor;
    const recent = usable.slice(-rules.deviationMinimumObservations);
    const distances = recent.map((point) => corridorDistance(point, corridor));
    if (
      recent.length === rules.deviationMinimumObservations &&
      distances.every((value) => value > rules.corridorToleranceMetres)
    )
      signals.push({
        ...base("route_deviation", "deviation", "Vehicle is outside the published route corridor"),
        evidence: { consecutiveObservations: recent.length, corridorDistancesMetres: distances }
      });
    else if (
      snapshot.existingOpenDeviation &&
      latest &&
      corridorDistance(latest, corridor) <= rules.corridorToleranceMetres
    )
      signals.push({
        ...base("route_deviation", "deviation", "Vehicle returned to the route corridor"),
        status: "resolved",
        resolutionReason: "Recovered inside configured corridor tolerance"
      });
  }
  if (usable.length >= 2 && first && latest && !currentStop && !snapshot.atDepot) {
    const duration = (Date.parse(latest.recordedAt) - Date.parse(first.recordedAt)) / 1000;
    const spread = Math.max(...usable.map((point) => distance(first, point)));
    if (duration >= rules.stationarySeconds && spread <= rules.stationaryRadiusMetres)
      signals.push({
        ...base("unusual_stationary", "stationary", "Vehicle has remained stationary unexpectedly"),
        evidence: { durationSeconds: duration, spreadMetres: spread }
      });
  }
  const now = Date.parse(snapshot.now);
  const plannedStart = Date.parse(snapshot.plannedStartAt);
  const plannedEnd = Date.parse(snapshot.plannedEndAt);
  if (!snapshot.startedAt && now > plannedStart + rules.lateStartToleranceSeconds * 1000)
    signals.push({
      ...base("late_start", "late-start", "Route has not started within the planned tolerance"),
      evidence: {
        plannedStartAt: snapshot.plannedStartAt,
        delaySeconds: (now - plannedStart) / 1000
      }
    });
  if (
    latest &&
    (latest.speedMetresPerSecond ?? 0) > 1 &&
    (now < plannedStart - rules.outsideHoursGraceSeconds * 1000 ||
      now > plannedEnd + rules.outsideHoursGraceSeconds * 1000)
  )
    signals.push({
      ...base(
        "outside_hours_movement",
        "outside-hours",
        "Vehicle movement is outside the configured operating window"
      ),
      evidence: { plannedStartAt: snapshot.plannedStartAt, plannedEndAt: snapshot.plannedEndAt }
    });
  if (snapshot.insideExpectedArea === false && latest)
    signals.push({
      ...base(
        "unexpected_area",
        "unexpected-area",
        "Vehicle is outside its expected operating area"
      ),
      confidence: usable.length >= 3 ? "high" : "medium",
      evidence: { conservativeAreaCheck: true, accuracyMetres: latest.accuracyMetres }
    });
  const completed = snapshot.stops.filter((stop) => stop.authoritativeOutcome).length;
  const elapsedRatio = Math.max(
    0,
    Math.min(1.5, (now - plannedStart) / (plannedEnd - plannedStart))
  );
  const progressRatio = snapshot.stops.length ? completed / snapshot.stops.length : 0;
  const scheduleRisk =
    snapshot.routeStatus === "completed"
      ? "on_track"
      : progressRatio + 0.25 < elapsedRatio
        ? "behind"
        : progressRatio + 0.1 < elapsedRatio
          ? "at_risk"
          : "on_track";
  if (scheduleRisk !== "on_track")
    signals.push({
      ...base(
        "falling_behind",
        "schedule-risk",
        `Route schedule is ${scheduleRisk.replace("_", " ")}`
      ),
      severity: scheduleRisk === "behind" ? "warning" : "info",
      evidence: {
        authoritativeCompletedStops: completed,
        totalStops: snapshot.stops.length,
        elapsedRatio,
        progressRatio
      }
    });
  if (snapshot.completedAt) {
    const delta = (Date.parse(snapshot.completedAt) - plannedEnd) / 1000;
    const classification =
      delta < -rules.completionToleranceSeconds
        ? "early"
        : delta > rules.completionToleranceSeconds
          ? "late"
          : "within_tolerance";
    signals.push({
      ...base(
        "completion_timing",
        "completion",
        `Route completion was ${classification.replace("_", " ")}`
      ),
      severity: classification === "late" ? "warning" : "info",
      evidence: { classification, deltaSeconds: delta }
    });
  }
  const completedWithTimes = snapshot.stops.filter(
    (stop): stop is IntelligenceStop & { authoritativeCompletedAt: string } =>
      typeof stop.authoritativeCompletedAt === "string"
  );
  const previous = completedWithTimes.at(-2);
  const last = completedWithTimes.at(-1);
  if (previous && last) {
    const actualMinutes =
      (Date.parse(last.authoritativeCompletedAt) - Date.parse(previous.authoritativeCompletedAt)) /
      60_000;
    if (actualMinutes > (last.plannedTravelMinutes ?? 15) * rules.interStopDurationMultiplier)
      signals.push({
        ...base(
          "excessive_inter_stop",
          `inter-stop:${last.stopId}`,
          "Inter-stop travel materially exceeded the planned duration"
        ),
        routeOperationStopId: last.stopId,
        evidence: { actualMinutes, plannedMinutes: last.plannedTravelMinutes ?? 15 }
      });
  }
  return {
    signals,
    progress: {
      routeOperationId: snapshot.routeOperationId,
      serviceRegionId: snapshot.serviceRegionId,
      vehicleId: snapshot.vehicleId,
      currentStopId: currentStop?.stopId,
      nextStopId: currentStop ? remaining[1]?.stopId : next?.stopId,
      currentInterpretation: !latest
        ? "tracking_insufficient"
        : currentStop
          ? "at_stop"
          : next
            ? "between_stops"
            : "route_unknown",
      authoritativeCompletedStops: completed,
      inferredVisitedStops: signals.filter((signal) => signal.factType === "stop_departure").length,
      remainingStops: remaining.length,
      scheduleRisk,
      trackingHealth: snapshot.trackingHealth,
      evidenceAt: latest?.recordedAt,
      ruleVersion: rules.ruleVersion
    }
  };
}
