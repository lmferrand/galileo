// Clavija: guarda la app para que abra sin internet (en el local de ensayo,
// en un escenario…). La página se pide a la red primero y, si no hay, se usa
// la copia guardada. Los archivos con huella (/_next/static) no cambian nunca.
// Los archivos que procesan el sonido en su propio hilo (los «worklet» y «worker» de la raíz) y el
// codificador de MP3 se guardan al instalarse la app y, como la página, se piden a la red primero
// (siempre los de la versión que toca) y sin red sale la copia. Sin esto, sin internet no se podía
// abrir ninguna canción: «Failed to load worklet module script» (visto el 20-nov-2026).

const CACHE = "clavija-app-v107";

const AUDIO = [
  "/mezclador.worklet.js",
  "/toma.worklet.js",
  "/puerta.worklet.js",
  "/limitador.worklet.js",
  "/compresor.worklet.js",
  "/captura.worklet.js",
  "/quitar-graves.worker.js",
  "/codificador.worker.js",
  "/lamejs/lamejs.js",
];
const esDeAudio = (ruta) => /^\/[^/]+\.(worklet|worker)\.js$/.test(ruta) || ruta.startsWith("/lamejs/");

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches
      .open(CACHE)
      // De uno en uno: que uno falle no deja a los demás sin guardar
      .then((c) => Promise.all(["/", ...AUDIO].map((u) => c.add(u).catch(() => undefined))))
      .catch(() => undefined),
  );
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

  if (esDeAudio(url.pathname)) {
    // La red primero (la versión de ahora); sin red, la copia guardada
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname, copia));
          }
          return r;
        })
        .catch(() => caches.match(url.pathname).then((r) => r || Response.error())),
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
