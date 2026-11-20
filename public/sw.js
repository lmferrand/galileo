// Clavija: guarda la app para que abra sin internet (en el local de ensayo,
// en un escenario…). La página se pide a la red primero y, si no hay, se usa
// la copia guardada. Los archivos con huella (/_next/static) no cambian nunca.
// Los archivos que procesan el sonido en su propio hilo (los «worklet» y «worker» de la raíz) y el
// codificador de MP3 se guardan al instalarse la app y, como la página, se piden a la red primero
// (siempre los de la versión que toca) y sin red sale la copia. Sin esto, sin internet no se podía
// abrir ninguna canción: «Failed to load worklet module script» (visto el 20-nov-2026).
// Además, al instalarse se guarda la app ENTERA: todas las pantallas, sus fotos, sus sonidos y los
// trozos de la app (la lista la hace scripts/precarga.mjs al compilar: /precarga.json). Antes solo se
// guardaba lo que se iba abriendo: quien abría la app en casa y solo veía el afinador, luego sin
// conexión tocaba «Pistas» o «Mesa» y seguía viendo el afinador.
// «La red primero» no espera a la red más de unos segundos si hay copia: con mala cobertura (un
// sótano, un local de ensayo) las peticiones ni llegan ni fallan, y la app se quedaba en blanco.
// Y si la red se ha quedado callada una vez, las siguientes peticiones ya no la esperan (van a la
// copia y siguen probando la red por detrás) hasta que vuelva a contestar: si no, cada pestaña
// sumaba sus segundos de espera.

const CACHE = "clavija-app-v108";

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

// Las pantallas, por si la lista no llega (la buena viene en /precarga.json)
const PAGINAS = ["/", "/pistas", "/aprender", "/mesa"];
// Cuánto se espera a la red antes de tirar de la copia guardada
const ESPERA = 3000;
// Cuántos archivos se bajan a la vez al guardar la app (para no ahogar una conexión floja)
const A_LA_VEZ = 6;

/** Guarda la app entera. Cada cosa por separado: que una falle no deja a las demás sin guardar. */
async function guardarLaApp() {
  const c = await caches.open(CACHE);
  const guardar = (u) => c.add(u).catch(() => undefined);
  // Lo imprescindible, lo primero: la pantalla de entrada y lo que procesa el sonido
  await Promise.all(["/", ...AUDIO].map(guardar));
  const lista = await fetch("/precarga.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const paginas = Array.isArray(lista?.paginas) && lista.paginas.length ? lista.paginas : PAGINAS;
  const archivos = Array.isArray(lista?.archivos) ? lista.archivos : [];
  const hechos = new Set(["/", ...AUDIO]);
  const cola = [...paginas, ...archivos].filter((u) => typeof u === "string" && u.startsWith("/") && !hechos.has(u) && hechos.add(u));
  const tanda = async () => {
    for (let u = cola.shift(); u; u = cola.shift()) await guardar(u);
  };
  await Promise.all(Array.from({ length: A_LA_VEZ }, tanda));
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(guardarLaApp().catch(() => undefined));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith("clavija-") && k !== CACHE && !k.startsWith("clavija-modelo")).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// La última petición a la red se quedó sin respuesta: las siguientes no la esperan
let redCallada = false;

/**
 * La red primero (la versión de ahora) y, si no hay red, la copia guardada con esa clave (o, para
 * las pantallas, la de entrada). Si hay copia, a la red no se la espera más de ESPERA: sale la copia.
 * Con «sinEsperas», tampoco se espera más cuando no hay copia: la petición falla y quien la hizo
 * busca otro camino.
 */
async function redPrimero(e, req, clave, { respaldo, sinEsperas } = {}) {
  const abierta = caches.open(CACHE);
  let aTiempo = true;
  let acabada = false;
  // La petición sale ya: buscar la copia no la retrasa
  const red = fetch(req).then(
    (r) => {
      acabada = true;
      redCallada = false;
      // Solo se guarda lo que de verdad se usa. Si la red llega tarde (ya ha salido la copia) y trae
      // una pantalla más nueva, guardarla la dejaría sin sus trozos hasta que se instale la versión nueva.
      if (aTiempo && r.ok && r.status === 200) {
        const copia = r.clone();
        e.waitUntil(abierta.then((c) => c.put(clave, copia)).catch(() => undefined));
      }
      return r;
    },
    (fallo) => {
      acabada = true;
      throw fallo;
    },
  );
  red.catch(() => undefined);
  const c = await abierta;
  const sinMirarCabeceras = { ignoreVary: true };
  const guardada = (await c.match(clave, sinMirarCabeceras)) || (respaldo ? await c.match(respaldo, sinMirarCabeceras) : undefined);
  if (!guardada && !sinEsperas) return red.catch(() => Response.error());
  const sinRed = () => guardada || Response.error();
  const tarde = new Promise((ok) =>
    setTimeout(
      () => {
        if (acabada) return; // contestó (o falló) a tiempo: ya está servido
        aTiempo = false;
        redCallada = true;
        ok(sinRed());
      },
      redCallada ? 0 : ESPERA,
    ),
  );
  return Promise.race([red.catch(sinRed), tarde]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(redPrimero(e, req, url.pathname.replace(/\/+$/, "") || "/", { respaldo: "/" }));
    return;
  }

  // Lo que la app pide por dentro al cambiar de pestaña (lleva «_rsc» en la dirección, que ya
  // distingue una petición de otra): con su copia, cambiar de pestaña sin conexión no recarga la app.
  // Sin copia y sin red (o con una red que no contesta) falla enseguida, y entonces la app abre la
  // pestaña como una página entera, que sí está guardada: sin esto se quedaba esperando sin fin.
  if (url.searchParams.has("_rsc")) {
    e.respondWith(redPrimero(e, req, url.pathname + url.search, { sinEsperas: true }));
    return;
  }

  if (esDeAudio(url.pathname)) {
    e.respondWith(redPrimero(e, req, url.pathname));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/separador/") || /\.(png|webp|svg|ico|woff2?|webmanifest|mp3)$/.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    e.respondWith(
      // Sin mirar la coletilla («?…»): el icono se pide con una, y es el mismo archivo. Una foto que
      // cambia se publica con otro nombre.
      caches.match(req, { ignoreSearch: true, ignoreVary: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((r) => {
            if (r.ok && r.status === 200) {
              const copia = r.clone();
              caches.open(CACHE).then((c) => c.put(req, copia));
            }
            return r;
          }),
      ),
    );
  }
});
