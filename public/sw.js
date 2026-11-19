// Clavija: guarda la app para que abra sin internet (en el local de ensayo,
// en un escenario…). La página se pide a la red primero y, si no hay, se usa
// la copia guardada. Los archivos con huella (/_next/static) no cambian nunca.

const CACHE = "clavija-app-v70";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/"])).catch(() => undefined));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith("clavija-") && k !== CACHE && !k.startsWith("clavija-modelo")).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    const clave = url.pathname.replace(/\/+$/, "") || "/";
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(clave, copia));
          }
          return r;
        })
        .catch(() =>
          caches
            .match(clave)
            .then((r) => r || caches.match("/"))
            .then((r) => r || Response.error()),
        ),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/separador/") || /\.(png|webp|svg|ico|woff2?|webmanifest)$/.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((r) => {
            if (r.ok) {
              const copia = r.clone();
              caches.open(CACHE).then((c) => c.put(req, copia));
            }
            return r;
          }),
      ),
    );
  }
});
