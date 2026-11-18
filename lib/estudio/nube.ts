// Separar en la gráfica gratis de Hugging Face (ZeroGPU), directamente desde este aparato.
// El Space es herramientas/separador-nube: recibe la canción y devuelve un .zip con las 6
// pistas (el mismo formato que las tandas del PC), que Pistas importa como cualquier .zip.
//
// El tiempo de gráfica se descuenta de los minutos gratis de cada persona (por eso se llama
// desde el aparato y no desde el servidor). Si se acaban, o el Space no responde, Pistas manda
// la canción a la cola del PC del estudio.

/** Dirección del Space, p. ej. "https://usuario-separador.hf.space". Vacía = no se usa. */
export const SPACE = "";

const RECUERDO_CUPO = "clavija-nube-sin-cupo";
const ESPERA_MAX_MS = 8 * 60 * 1000;
const DESPERTAR_MAX_MS = 150 * 1000;

export type FaseNube = "despertando" | "subiendo" | "separando" | "bajando";
export type MotivoFallo = "cupo" | "dormido" | "error";

export class ErrorNube extends Error {
  constructor(
    public motivo: MotivoFallo,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** Si hay Space y a este aparato no se le han acabado hoy los minutos. */
export function nubeDisponible(): boolean {
  if (!SPACE) return false;
  const hasta = Number(localStorage.getItem(RECUERDO_CUPO) ?? 0);
  return !(hasta > Date.now());
}

function recordarSinCupo(mensaje: string) {
  // ZeroGPU dice cuánto falta («Try again in 13:45:12»); si no, se vuelve a probar en una hora.
  const m = /(\d+):(\d{2}):(\d{2})/.exec(mensaje);
  const espera = m ? (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 : 3600 * 1000;
  localStorage.setItem(RECUERDO_CUPO, String(Date.now() + Math.min(espera, 24 * 3600 * 1000)));
}

const esperar = (ms: number, senal: AbortSignal) =>
  new Promise<void>((ok, mal) => {
    const t = setTimeout(ok, ms);
    senal.addEventListener("abort", () => (clearTimeout(t), mal(senal.reason)), { once: true });
  });

/** Un Space que nadie usa en dos días se duerme; la primera visita lo despierta (1–2 min). */
async function despierto(senal: AbortSignal, alAvanzar: (f: FaseNube) => void) {
  const fin = Date.now() + DESPERTAR_MAX_MS;
  let primera = true;
  for (;;) {
    try {
      const r = await fetch(`${SPACE}/gradio_api/info`, { cache: "no-store", signal: senal });
      // Dormido, Hugging Face contesta con su página (HTML), no con lo de Gradio
      if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) return;
    } catch (e) {
      if (senal.aborted) throw e;
    }
    if (Date.now() > fin) throw new ErrorNube("dormido", "La gráfica no se ha despertado a tiempo.");
    if (primera) alAvanzar("despertando");
    primera = false;
    await esperar(5000, senal);
  }
}

function errorDeGradio(datos: string): ErrorNube {
  let texto = "";
  try {
    const d = JSON.parse(datos) as unknown;
    texto = typeof d === "string" ? d : d && typeof d === "object" && "error" in d ? String((d as { error: unknown }).error) : "";
  } catch {
    texto = datos;
  }
  if (/quota|cuota/i.test(texto)) {
    recordarSinCupo(texto);
    return new ErrorNube("cupo", "Se han acabado tus minutos gratis de hoy en la gráfica.");
  }
  return new ErrorNube("error", texto || "La gráfica ha fallado.");
}

/** Lee los avisos (SSE) de Gradio hasta que termina: devuelve el resultado o lanza el error. */
async function resultado(url: string, senal: AbortSignal): Promise<unknown[]> {
  const res = await fetch(url, { cache: "no-store", signal: senal });
  if (!res.ok || !res.body) throw new ErrorNube("error", `La gráfica no responde (${res.status}).`);
  const lector = res.body.getReader();
  const texto = new TextDecoder();
  let resto = "";
  let evento = "";
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    resto += texto.decode(value, { stream: true });
    let fin: number;
    while ((fin = resto.indexOf("\n")) >= 0) {
      const linea = resto.slice(0, fin).replace(/\r$/, "");
      resto = resto.slice(fin + 1);
      if (linea.startsWith("event:")) evento = linea.slice(6).trim();
      else if (linea.startsWith("data:")) {
        const datos = linea.slice(5).trim();
        if (evento === "complete") {
          void lector.cancel();
          return JSON.parse(datos) as unknown[];
        }
        if (evento === "error") {
          void lector.cancel();
          throw errorDeGradio(datos);
        }
      }
    }
  }
  throw new ErrorNube("error", "La gráfica ha cortado la conexión.");
}

/**
 * Manda la canción al Space y devuelve el .zip con sus 6 pistas. Lanza ErrorNube con
 * motivo «cupo» si a esta persona se le han acabado los minutos de hoy.
 */
export async function separarEnLaNube(archivo: File, nombre: string, alAvanzar: (f: FaseNube) => void): Promise<File> {
  if (!SPACE) throw new ErrorNube("error", "No hay gráfica configurada.");
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(new ErrorNube("error", "La gráfica tarda demasiado.")), ESPERA_MAX_MS);
  const senal = control.signal;
  try {
    await despierto(senal, alAvanzar);

    alAvanzar("subiendo");
    const formulario = new FormData();
    formulario.append("files", archivo, archivo.name || `${nombre}.mp3`);
    const subida = await fetch(`${SPACE}/gradio_api/upload`, { method: "POST", body: formulario, signal: senal });
    if (!subida.ok) throw new ErrorNube(subida.status === 503 ? "dormido" : "error", `No se ha podido subir la canción (${subida.status}).`);
    const [ruta] = (await subida.json()) as string[];
    if (!ruta) throw new ErrorNube("error", "No se ha podido subir la canción.");

    alAvanzar("separando");
    const llamada = await fetch(`${SPACE}/gradio_api/call/separar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [{ path: ruta, orig_name: archivo.name, meta: { _type: "gradio.FileData" } }, nombre] }),
      signal: senal,
    });
    if (!llamada.ok) throw new ErrorNube("error", `La gráfica no acepta la canción (${llamada.status}).`);
    const { event_id } = (await llamada.json()) as { event_id?: string };
    if (!event_id) throw new ErrorNube("error", "La gráfica no acepta la canción.");
    const [fichero] = (await resultado(`${SPACE}/gradio_api/call/separar/${event_id}`, senal)) as { url?: string; path?: string }[];
    const url = fichero?.url ?? (fichero?.path ? `${SPACE}/gradio_api/file=${fichero.path}` : "");
    if (!url) throw new ErrorNube("error", "La gráfica no ha devuelto las pistas.");

    alAvanzar("bajando");
    const zip = await fetch(url, { cache: "no-store", signal: senal });
    if (!zip.ok) throw new ErrorNube("error", `No se han podido bajar las pistas (${zip.status}).`);
    return new File([await zip.blob()], `${nombre}.zip`, { type: "application/zip" });
  } catch (e) {
    if (e instanceof ErrorNube) throw e;
    if (senal.aborted && senal.reason instanceof ErrorNube) throw senal.reason;
    throw new ErrorNube("error", (e as Error).message || "La gráfica no responde.");
  } finally {
    clearTimeout(reloj);
  }
}
