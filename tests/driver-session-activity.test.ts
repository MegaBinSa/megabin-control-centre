import { describe, expect, it, vi } from "vitest";

import { DriverSessionActivity } from "../apps/driver-pwa/src/session-activity.js";

describe("Driver session activity", () => {
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
