export type QueueState =
  | "queued"
  | "syncing"
  | "synced"
  | "reconciled"
  | "failed"
  | "conflict"
  | "rejected";
export interface QueuedAction {
  readonly actionId: string;
  readonly routeOperationId: string;
  readonly kind: "route" | "stop" | "capacity" | "complete";
  readonly endpoint: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly clientSequence: number;
  state: QueueState;
  rejectionCode?: string;
}
export interface QueuedPosition {
  readonly observationId: string;
  readonly recordedAt: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMetres: number;
  readonly altitudeMetres?: number;
  readonly headingDegrees?: number;
  readonly speedMetresPerSecond?: number;
  readonly clientSequence: number;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly sourceProvider: "driver-pwa";
  state: Exclude<QueueState, "failed">;
  rejectionCode?: string;
}
const DB = "megabin-driver-v1";
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("data"))
        request.result.createObjectStore("data");
      if (!request.result.objectStoreNames.contains("queue"))
        request.result.createObjectStore("queue", { keyPath: "actionId" });
      if (!request.result.objectStoreNames.contains("positions"))
        request.result.createObjectStore("positions", { keyPath: "observationId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const transaction = async <T>(
  store: string,
  mode: IDBTransactionMode,
  operation: (value: IDBObjectStore) => IDBRequest<T>
) => {
  const database = await open();
  return new Promise<T>((resolve, reject) => {
    const request = operation(database.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
};
export const getData = <T>(key: string) =>
  transaction<T | undefined>("data", "readonly", (store) => store.get(key));
export const putData = (key: string, value: unknown) =>
  transaction("data", "readwrite", (store) => store.put(value, key));
export const queueAction = (action: QueuedAction) =>
  transaction("queue", "readwrite", (store) => store.put(action));
export const queuedActions = () =>
  transaction<QueuedAction[]>("queue", "readonly", (store) => store.getAll()).then((items) =>
    items.sort((a, b) => a.clientSequence - b.clientSequence)
  );
export const queuePosition = (position: QueuedPosition) =>
  transaction("positions", "readwrite", (store) => store.put(position));
export const queuedPositions = () =>
  transaction<QueuedPosition[]>("positions", "readonly", (store) => store.getAll()).then((items) =>
    items.sort((a, b) => a.clientSequence - b.clientSequence)
  );
export async function trimPositionQueue(max = 1000) {
  const positions = await queuedPositions();
  if (positions.length <= max + 100) return;
  const synced = positions.filter((position) => position.state === "synced").slice(-100);
  const queued = positions.filter((position) => position.state !== "synced");
  const step = Math.max(1, Math.ceil(queued.length / max));
  const keep = [...synced, ...queued.filter((_position, index) => index % step === 0).slice(-max)];
  const database = await open();
  const tx = database.transaction("positions", "readwrite");
  tx.objectStore("positions").clear();
  keep.forEach((position) => tx.objectStore("positions").put(position));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
}
export async function clearOperationalData() {
  const database = await open();
  await Promise.all(
    ["data", "queue", "positions"].map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = database.transaction(name, "readwrite").objectStore(name).clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
    )
  );
  database.close();
}
