import { describe, expect, it, vi } from "vitest";

import { DriverSessionActivity } from "../apps/driver-pwa/src/session-activity.js";

describe("Driver session activity", () => {
  it("serializes concurrent requests and waits for every scheduled pass before logout", async () => {
    const activity = new DriverSessionActivity();
    const gates = Array.from({ length: 3 }, () => Promise.withResolvers<undefined>());
    const order: string[] = [];
    let running = 0;
    let maximumRunning = 0;
    const passes = gates.map((gate, index) =>
      activity.runSync(async () => {
        maximumRunning = Math.max(maximumRunning, ++running);
        order.push(`start-${index}`);
        await gate.promise;
        order.push(`end-${index}`);
        running--;
      })
    );
    const logout = activity.endSession(async () => {
      order.push("cleanup");
    });
    const ignored = vi.fn(async () => undefined);
    await activity.runSync(ignored);
    expect(ignored).not.toHaveBeenCalled();
    for (const [index, gate] of gates.entries()) {
      await vi.waitFor(() => expect(order.at(-1)).toBe(`start-${index}`));
      expect(order).not.toContain("cleanup");
      gate.resolve(undefined);
    }
    await Promise.all([...passes, logout]);
    expect(maximumRunning).toBe(1);
    expect(order).toEqual(["start-0", "end-0", "start-1", "end-1", "start-2", "end-2", "cleanup"]);
    await activity.runSync(ignored);
    expect(ignored).toHaveBeenCalledOnce();
  });

  it("runs work requested after an operation finishes but before activeSync clears", async () => {
    const activity = new DriverSessionActivity();
    const order: string[] = [];
    let followUp: Promise<void> | undefined;
    const first = activity.runSync(async () => {
      order.push("0 pending");
      // Queue the request in the promise completion window, ahead of finally.
      queueMicrotask(() => {
        followUp = activity.runSync(async () => {
          order.push("start-posted");
        });
      });
    });
    await first;
    await followUp;
    expect(order).toEqual(["0 pending", "start-posted"]);
  });

  it("drains scheduled work after a failed pass before logout cleanup", async () => {
    const activity = new DriverSessionActivity();
    const gate = Promise.withResolvers<undefined>();
    const order: string[] = [];
    const first = activity.runSync(async () => {
      throw new Error("sync failed");
    });
    const rejection = expect(first).rejects.toThrow("sync failed");
    const next = activity.runSync(async () => {
      order.push("follow-up");
      await gate.promise;
      order.push("finished");
    });
    const logout = activity.endSession(async () => {
      order.push("cleanup");
    });
    await rejection;
    await vi.waitFor(() => expect(order).toEqual(["follow-up"]));
    gate.resolve(undefined);
    await Promise.all([next, logout]);
    expect(order).toEqual(["follow-up", "finished", "cleanup"]);
  });

  it("waits for an in-flight sync before clearing signed-out operational data", async () => {
    const activity = new DriverSessionActivity();
    let finishSync: (() => void) | undefined;
    const syncReachedProvider = new Promise<void>((resolve) => {
      finishSync = resolve;
    });
    const order: string[] = [];

    const sync = activity.runSync(async () => {
      order.push("sync-started");
      await syncReachedProvider;
      order.push("manifest-cached");
    });
    await vi.waitFor(() => expect(order).toEqual(["sync-started"]));

    const logout = activity.endSession(async () => {
      order.push("storage-cleared");
    });
    await Promise.resolve();
    expect(order).toEqual(["sync-started"]);

    finishSync?.();
    await Promise.all([sync, logout]);
    expect(order).toEqual(["sync-started", "manifest-cached", "storage-cleared"]);
  });

  it("does not start another sync while session cleanup is pending", async () => {
    const activity = new DriverSessionActivity();
    let finishCleanup: (() => void) | undefined;
    const cleanupGate = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    const operation = vi.fn(async () => undefined);

    const logout = activity.endSession(async () => cleanupGate);
    await activity.runSync(operation);
    expect(operation).not.toHaveBeenCalled();

    finishCleanup?.();
    await logout;
  });

  it("still clears session data when the in-flight sync fails", async () => {
    const activity = new DriverSessionActivity();
    const cleanup = vi.fn(async () => undefined);
    const sync = activity.runSync(async () => {
      throw new Error("synthetic sync failure");
    });

    await activity.endSession(cleanup);
    await expect(sync).rejects.toThrow("synthetic sync failure");
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
