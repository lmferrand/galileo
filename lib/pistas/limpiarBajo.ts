// Pasa a la pista del bajo los graves que el separador dejó en la guitarra, la voz, el piano y el
// resto (lo hacen los workers de public/quitar-graves.worker.js, sin trabar la pantalla).
// Va pista a pista: `quitar` saca los graves de una (y los guarda) y `sumar` se los añade al bajo.
// Así se reparte entre dos workers y se empieza con cada pista en cuanto está descodificada, sin
// esperar a tenerlas todas (lib/pistas/cargar): la canción se abre antes.
// Las pistas van en Int16 estéreo intercalado y viajan a los workers (sin copia): mientras tanto no
// se pueden usar aquí. Si un worker falla, lo que tenía se pierde: hay que volver a leer las pistas.

import { FRECUENCIA } from "./tipos";

/** Hasta aquí se considera «bajo» (más arriba se irían las notas graves de la guitarra). */
const CORTE_HZ = 130;

type Respuesta = { pista?: Int16Array; graves?: Int16Array; bajo?: Int16Array; error?: string };
interface Encargo {
  mensaje: Record<string, unknown>;
  viajan: Transferable[];
  ok: (r: Respuesta) => void;
  mal: (e: Error) => void;
}

export class LimpiezaBajo {
  private libres: Worker[] = [];
  private todos: Worker[] = [];
  private cola: Encargo[] = [];
  /** Los que están ahora mismo en un worker */
  private enMarcha = new Set<Encargo>();
  /** Lo quitado a las otras pistas que aún no se ha sumado al bajo */
  private graves: Int16Array[] = [];
  private roto: Error | null = null;

  /** `obreros`: workers a la vez (cada uno gasta, mientras trabaja, lo que ocupa una pista y media) */
  constructor(private obreros = 2) {}

  /** ¿Se puede limpiar aquí? (hace falta poder crear workers) */
  static disponible(): boolean {
    return typeof Worker !== "undefined";
  }

  /** Hay graves quitados esperando a sumarse al bajo */
  get pendiente(): boolean {
    return this.graves.length > 0;
  }

  /** Quita los graves de una pista (y los guarda para el bajo). Devuelve la pista ya sin ellos. */
  async quitar(pista: Int16Array): Promise<Int16Array> {
    const r = await this.encargar({ tipo: "quitar", pista, corte: CORTE_HZ, frecuencia: FRECUENCIA }, [pista.buffer]);
    if (!r.pista || !r.graves) throw new Error("La limpieza del bajo no ha devuelto la pista.");
    this.graves.push(r.graves);
    return r.pista;
  }

  /** Suma al bajo lo quitado hasta ahora. Devuelve el bajo con ello. */
  async sumar(bajo: Int16Array): Promise<Int16Array> {
    let b = bajo;
    for (let g = this.graves.pop(); g; g = this.graves.pop()) {
      const r = await this.encargar({ tipo: "sumar", bajo: b, graves: g }, [b.buffer, g.buffer]);
      if (!r.bajo) throw new Error("La limpieza del bajo no ha devuelto el bajo.");
      b = r.bajo;
    }
    return b;
  }

  /** Al acabar (o al dejarlo a medias): se cierran los workers. */
  cerrar() {
    this.romper(new Error("Se ha cerrado la limpieza del bajo."));
  }

  private encargar(mensaje: Record<string, unknown>, viajan: Transferable[]): Promise<Respuesta> {
    return new Promise((ok, mal) => {
      if (this.roto) return mal(this.roto);
      this.cola.push({ mensaje, viajan, ok, mal });
      this.repartir();
    });
  }

  private repartir() {
    while (this.cola.length) {
      let w = this.libres.pop();
      if (!w) {
        if (this.todos.length >= this.obreros) return;
        try {
          w = new Worker("/quitar-graves.worker.js");
        } catch (e) {
          return this.romper(e instanceof Error ? e : new Error(String(e)));
        }
        this.todos.push(w);
      }
      const obrero = w;
      const encargo = this.cola.shift()!;
      this.enMarcha.add(encargo);
      obrero.onmessage = (e: MessageEvent<Respuesta>) => {
        if (e.data.error) return this.romper(new Error(e.data.error));
        this.enMarcha.delete(encargo);
        this.libres.push(obrero);
        encargo.ok(e.data);
        this.repartir();
      };
      obrero.onerror = () => this.romper(new Error("Ha fallado la limpieza del bajo."));
      try {
        obrero.postMessage(encargo.mensaje, encargo.viajan);
      } catch (e) {
        return this.romper(e instanceof Error ? e : new Error(String(e)));
      }
    }
  }

  /** Un fallo (o el cierre): se acaba todo y quien esperaba algo se entera. */
  private romper(error: Error) {
    this.roto ??= error;
    this.todos.forEach((w) => w.terminate());
    this.todos = [];
    this.libres = [];
    this.graves = [];
    const esperando = [...this.enMarcha, ...this.cola];
    this.enMarcha.clear();
    this.cola = [];
    esperando.forEach((x) => x.mal(error));
  }
}
