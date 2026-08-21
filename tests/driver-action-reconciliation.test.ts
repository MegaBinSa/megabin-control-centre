import { describe, expect, it } from "vitest";
import {
  actionIsPending,
  actionIsResolved,
  actionNeedsAttention,
  operationQueueState,
  reconcileAlreadyAchievedRouteAction
} from "../apps/driver-pwa/src/action-reconciliation.js";
import type { QueuedAction, QueueState } from "../apps/driver-pwa/src/storage.js";

const action = (overrides: Partial<QueuedAction> = {}): QueuedAction => ({
  actionId: "2e7ada54-e208-4ab4-8af4-ec32cdc4108e",
  routeOperationId: "621cf930-d80d-4b6a-a4e7-44a4896a57bc",
  kind: "route",
  endpoint: "/driver/route-operations/621cf930-d80d-4b6a-a4e7-44a4896a57bc/actions",
  body: { actionType: "accept" },
  clientSequence: 2,
  state: "rejected",
  rejectionCode: "invalid_lifecycle_transition",
  ...overrides
});

describe("Driver action reconciliation", () => {
  it("reconciles a duplicate Accept when authoritative state already achieved the intent", () => {
    const reconciled = reconcileAlreadyAchievedRouteAction(action(), "accepted");
    expect(reconciled.state).toBe("reconciled");
    expect(actionIsResolved(reconciled)).toBe(true);
    expect(actionIsPending(reconciled)).toBe(false);
    expect(actionNeedsAttention(reconciled)).toBe(false);
  });

  it("reconciles a duplicate Start only after authoritative execution has started", () => {
    expect(
      reconcileAlreadyAchievedRouteAction(action({ body: { actionType: "start" } }), "in_progress")
        .state
    ).toBe("reconciled");
    expect(
      reconcileAlreadyAchievedRouteAction(action({ body: { actionType: "start" } }), "accepted")
        .state
    ).toBe("rejected");
  });

  it("retains genuine lifecycle and idempotency conflicts for attention", () => {
    const genuineLifecycleRejection = action({ rejectionCode: "stale_assignment_revision" });
    const idempotencyConflict = action({
      state: "conflict",
      rejectionCode: "idempotency_key_reused"
    });
    expect(reconcileAlreadyAchievedRouteAction(genuineLifecycleRejection, "accepted").state).toBe(
      "rejected"
    );
    expect(actionNeedsAttention(genuineLifecycleRejection)).toBe(true);
    expect(actionNeedsAttention(idempotencyConflict)).toBe(true);
    expect(actionIsPending(idempotencyConflict)).toBe(false);
  });

  it("distinguishes retryable work from terminal outcomes", () => {
    const retryable: QueueState[] = ["queued", "syncing", "failed"];
    const terminal: QueueState[] = ["synced", "reconciled", "rejected", "conflict"];
    expect(retryable.map((state) => actionIsPending(action({ state })))).toEqual([
      true,
      true,
      true
    ]);
    expect(terminal.map((state) => actionIsPending(action({ state })))).toEqual([
      false,
      false,
      false,
      false
    ]);
  });

  it("scopes blocking actions and attention to the current Route Operation", () => {
    const oldRejectedStart = action({ body: { actionType: "start" } });
    const currentOperationId = "b9e4f245-1f94-4aef-a6f0-17188f50854b";
    const currentQueuedStart = action({
      actionId: "38f3ab68-2498-4b6f-8956-06060cefe887",
      routeOperationId: currentOperationId,
      body: { actionType: "start" },
      state: "queued",
      rejectionCode: undefined
    });

    const historicalOnly = operationQueueState([oldRejectedStart], currentOperationId);
    expect(historicalOnly.attention).toEqual([]);
    expect(historicalOnly.historicalAttention).toEqual([oldRejectedStart]);
    expect(historicalOnly.blockedControls.has("route:start")).toBe(false);

    const currentBlocked = operationQueueState(
      [oldRejectedStart, currentQueuedStart],
      currentOperationId
    );
    expect(currentBlocked.pending).toEqual([currentQueuedStart]);
    expect(currentBlocked.blockedControls.has("route:start")).toBe(true);
  });
});
