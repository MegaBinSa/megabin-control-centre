/* global self, caches, fetch, Headers, Request, Response, URL */
const BUILD = new URL(self.location.href).searchParams.get("build") || "local",
  CACHE = `megabin-driver-shell-${BUILD}`,
  SHELL = ["/", "/index.html", "/manifest.webmanifest"];
self.addEventListener("install", (event) => event.waitUntil(precacheShell()));
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  )
);
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/"))
    return;
  event.respondWith(networkFirst(event.request));
});

async function precacheShell() {
  for (const path of SHELL) {
    const response = await fetch(path);
    if (response.ok) await store(new Request(path), response);
  }
  const index = await caches.match("/index.html");
  if (!index) return;
  const html = await index.clone().text();
  const assets = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)]
        .map((match) => match[1])
        .filter((path) => path && !path.startsWith("/api/") && !SHELL.includes(path))
    )
  ];
  await Promise.all(
    assets.map(async (path) => {
      try {
        const response = await fetch(path);
        if (response.ok) await store(new Request(path), response);
      } catch {
        // A missing optional asset must not block the shell.
      }
    })
  );
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) await store(request, response.clone()).catch(() => undefined);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = (await caches.match("/index.html")) ?? (await caches.match("/"));
      if (shell) return shell;
    }
    throw error;
  }
}

async function store(request, response) {
  const headers = new Headers(response.headers);
  headers.delete("cache-control");
  headers.delete("expires");
  headers.delete("pragma");
  headers.delete("vary");
  const cache = await caches.open(CACHE);
  await cache.put(
    request,
    new Response(await response.arrayBuffer(), {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  );
}
