export type QueueState = "queued" | "syncing" | "synced" | "failed" | "conflict" | "rejected";
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
const DB = "megabin-driver-v1";
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("data");
      request.result.createObjectStore("queue", { keyPath: "actionId" });
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
export async function clearOperationalData() {
  const database = await open();
  await Promise.all(
    ["data", "queue"].map(
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
