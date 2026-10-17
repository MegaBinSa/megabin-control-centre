export class DriverSessionActivity {
  private activeSync: Promise<void> | null = null;
  private endingSession = false;

  runSync(operation: () => Promise<void>) {
    if (this.endingSession) return Promise.resolve();
    // Retain requests made during a sync, including its completion window.
    // A preceding failure must not discard subsequently scheduled work.
    const active = (this.activeSync ?? Promise.resolve()).then(operation, operation).finally(() => {
      if (this.activeSync === active) this.activeSync = null;
    });
    this.activeSync = active;
    return active;
  }

  async endSession(cleanup: () => Promise<void>) {
    this.endingSession = true;
    try {
      try {
        await this.activeSync;
      } catch {
        // Session cleanup remains authoritative when an in-flight sync fails.
      }
      await cleanup();
    } finally {
      this.endingSession = false;
    }
  }
}
