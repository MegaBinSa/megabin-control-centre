import type { QueuedAction, QueueState } from "./storage.js";

const pendingStates = new Set<QueueState>(["queued", "syncing", "failed"]);
const attentionStates = new Set<QueueState>(["conflict", "rejected"]);
const resolvedStates = new Set<QueueState>(["synced", "reconciled"]);

export const actionIsPending = (action: Pick<QueuedAction, "state">) =>
  pendingStates.has(action.state);
export const actionNeedsAttention = (action: Pick<QueuedAction, "state">) =>
  attentionStates.has(action.state);
export const actionIsResolved = (action: Pick<QueuedAction, "state">) =>
  resolvedStates.has(action.state);

export function actionControlKey(action: QueuedAction): string | null {
  if (action.kind === "route") return `route:${String(action.body.actionType)}`;
  if (action.kind === "stop") return `stop:${String(action.body.routeOperationStopId)}`;
  if (action.kind === "capacity") return "capacity";
  if (action.kind === "complete") return "complete";
  return null;
}

export function operationQueueState(actions: QueuedAction[], routeOperationId: string) {
  const current = actions.filter((action) => action.routeOperationId === routeOperationId);
  return {
    current,
    pending: current.filter(actionIsPending),
    attention: current.filter(actionNeedsAttention),
    historicalAttention: actions.filter(
      (action) => action.routeOperationId !== routeOperationId && actionNeedsAttention(action)
    ),
    blockedControls: new Set(
      current
        .filter((action) => !actionIsResolved(action))
        .map(actionControlKey)
        .filter((key): key is string => key !== null)
    )
  };
}

export function reconcileAlreadyAchievedRouteAction(
  action: QueuedAction,
  authoritativeLifecycleStatus: string
): QueuedAction {
  if (
    action.kind !== "route" ||
    action.state !== "rejected" ||
    action.rejectionCode !== "invalid_lifecycle_transition"
  )
    return action;

  const actionType = action.body.actionType;
  const achieved =
    (actionType === "accept" &&
      ["accepted", "in_progress", "suspended", "completed"].includes(
        authoritativeLifecycleStatus
      )) ||
    (actionType === "start" &&
      ["in_progress", "suspended", "completed"].includes(authoritativeLifecycleStatus));

  return achieved ? { ...action, state: "reconciled" } : action;
}
