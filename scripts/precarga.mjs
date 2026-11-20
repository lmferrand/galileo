// Galileo: la lista de lo que la app se guarda al instalarse para funcionar sin conexión.
//
// Se ejecuta DESPUÉS de compilar («npm run build» = «next build» y luego esto) y deja
// public/precarga.json con:
//   - paginas:  las pantallas de la app (una por cada app/**/page.tsx);
//   - archivos: todo lo que esas pantallas pueden pedir: los trozos de la app ya compilada
//               (.next/static, también los que solo se cargan al usarlos: los que buscan el ritmo,
//               separan pistas…) y lo de public/ (fotos, sonidos y los archivos que procesan el sonido).
// El service worker (public/sw.js) la lee al instalarse y lo guarda todo. Sin esta lista solo se
// guardaba lo que se iba abriendo: sin conexión, tocar una pestaña que no se había abierto antes
// dejaba en pantalla el afinador (visto el 20-nov-2026).
//
// El archivo no se sube al repositorio (.gitignore): se hace en cada compilación, aquí y en Vercel.

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const raiz = process.cwd();
const listar = (dir) =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listar(join(dir, e.name)) : [join(dir, e.name)])) : [];
const ruta = (base, archivo) => relative(base, archivo).split(sep).join("/");

// Las pantallas: app/page.tsx → «/», app/mesa/page.tsx → «/mesa». Los grupos «(así)» no cuentan en
// la dirección y las rutas con parámetros «[así]» no se pueden guardar de antemano.
const app = join(raiz, "app");
const paginas = listar(app)
  .filter((f) => /[\\/]page\.(tsx|jsx|ts|js)$/.test(f))
  .map((f) => ruta(app, f).split("/").slice(0, -1))
  .filter((trozos) => !trozos.some((t) => t.startsWith("[")))
  .map((trozos) => "/" + trozos.filter((t) => !t.startsWith("(")).join("/"))
  .sort();

// Los trozos de la app compilada (los mapas de depuración no hacen falta para funcionar)
const compilado = join(raiz, ".next", "static");
const trozos = listar(compilado)
  .map((f) => "/_next/static/" + ruta(compilado, f))
  .filter((u) => !u.endsWith(".map"));
if (trozos.length === 0) {
  console.error("precarga: no hay nada en .next/static (¿se ha compilado antes?)");
  process.exit(1);
}

// Lo de public/. Fuera: la canción de ejemplo (11 MB: se baja al pedirla y se queda en el aparato),
// el propio service worker, esta lista y los textos que nadie pide.
const publico = join(raiz, "public");
const FUERA = [/^\/ejemplo\//, /^\/sw\.js$/, /^\/precarga\.json$/, /\.txt$/, /\/LICENSE$/, /\/\.[^/]+$/];
const publicos = listar(publico)
  .map((f) => "/" + ruta(publico, f))
  .filter((u) => !FUERA.some((r) => r.test(u)));

// Lo que sale de app/ con dirección propia: los iconos y la ficha de la app instalada
const DE_APP = ["/icon.png", "/apple-icon.png", "/manifest.webmanifest"];

const archivos = [...trozos, ...publicos, ...DE_APP].sort();
writeFileSync(join(publico, "precarga.json"), JSON.stringify({ paginas, archivos }) + "\n");
console.log(`precarga: ${paginas.length} pantallas (${paginas.join(" ")}) y ${archivos.length} archivos (${trozos.length} de la app, ${publicos.length} de public)`);
