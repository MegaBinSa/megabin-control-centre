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
