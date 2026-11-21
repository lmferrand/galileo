// «Qué hace cada mando»: la ayuda de la consola (grabadora, canales y sección MASTER), en
// palabras sencillas y con cuándo tocar cada cosa. Se abre con «?» arriba a la derecha.

interface Mando {
  nombre: string;
  que: string;
}

const SECCIONES: { titulo: string; mandos: Mando[] }[] = [
  {
    titulo: "La grabadora",
    mandos: [
      { nombre: "◂◂  ▸▸", que: "Atrás y adelante 10 segundos." },
      { nombre: "■", que: "Para y vuelve al principio (o al principio del trozo que estés repitiendo)." },
      { nombre: "▸  ❚❚", que: "Tocar y pausa. La de tocar se enciende en verde mientras suena." },
      {
        nombre: "REC",
        que: "Graba lo que tocas. Antes cuenta 4 golpes al tempo del metrónomo; se para con REC, con la pausa o cuando acaba la canción. Tus tomas quedan en la tecla del casete para escucharlas, guardarlas o borrarlas.",
      },
      { nombre: "Rueda naranja izquierda", que: "La velocidad: más lenta sin cambiar el tono, para sacarla con calma." },
      { nombre: "Rueda naranja derecha", que: "Mueve la canción hacia delante o hacia atrás." },
      { nombre: "VU 1 a 8", que: "Lo fuerte que suena cada canal. Si la aguja entra en lo rojo, ese canal está a punto de saturar: bájalo." },
      { nombre: "L y R MASTER", que: "Lo que sale por los cascos, por la izquierda y por la derecha." },
      { nombre: "Pantalla roja", que: "La canción entera. Toca para ir a un punto; arrastra para elegir un trozo y repetirlo." },
    ],
  },
  {
    titulo: "Cada canal de la mesa",
    mandos: [
      { nombre: "INPUT 1 · INPUT 2", que: "Tocando el rótulo se encienden las entradas de tu interfaz (tu guitarra, tu micro). Se iluminan cuando están encendidas." },
      {
        nombre: "TRIM",
        que: "Lo que entra. Ponlo para que la luz del canal suba bien sin llegar a rojo. En las entradas, «Ajustar la ganancia sola» (en SELECT) lo hace por ti.",
      },
      { nombre: "LOW", que: "Los graves. Súbelos para dar cuerpo; bájalos si retumba o si se pisa con el bajo." },
      { nombre: "HIGH", que: "Los agudos. Súbelos para dar brillo; bájalos si chirría o pita." },
      { nombre: "COMP", que: "El compresor: iguala lo fuerte y lo flojo para que suene más parejo. Con un poco basta; mucho aplasta el sonido." },
      { nombre: "PAN", que: "A la izquierda o a la derecha. Abrir un poco cada instrumento hace que se oigan mejor todos." },
      { nombre: "REV", que: "La reverb: la sala, la sensación de espacio. Mejor poca: mucha lo aleja y lo emborrona." },
      { nombre: "DELAY", que: "El eco. Queda bien en solos y voces, en poca cantidad." },
      { nombre: "Tecla roja", que: "Silencia el canal." },
      { nombre: "SOLO", que: "Deja sonar solo ese canal (y los que también tengan SOLO). Para escuchar algo de cerca." },
      { nombre: "SELECT", que: "Abre todos sus efectos (puerta de ruido, distorsión, chorus…) y, en las entradas, el ajuste automático de la ganancia." },
      { nombre: "Fader", que: "El volumen del canal. 0 dB es tal cual; hacia arriba sube y hacia abajo baja hasta el silencio." },
    ],
  },
  {
    titulo: "La sección MASTER",
    mandos: [
      { nombre: "MASTER (rueda)", que: "El volumen de la canción entera (sus pistas)." },
      { nombre: "MONITOR", que: "El volumen de lo que tocas tú (las entradas). Con esta y la de MASTER equilibras tu guitarra con la canción." },
      { nombre: "REV MASTER · DELAY MASTER", que: "Suben o bajan la reverb y el eco de todos los canales a la vez." },
      { nombre: "Fader MASTER", que: "El volumen de todo lo que sale." },
    ],
  },
];

const CONSEJOS = [
  "Todos los mandos se mueven arrastrando arriba y abajo; con dos toques vuelven a su sitio.",
  "Empieza con todo a 0 dB y baja lo que sobre en vez de subir lo que falte.",
  "Si hay voz, que se entienda siempre: es lo que manda.",
  "Mezcla a volumen moderado y descansa los oídos de vez en cuando: cansados, engañan.",
];

export default function AyudaMesa() {
  return (
    <div className="ayuda-mesa">
      {SECCIONES.map((s) => (
        <section key={s.titulo}>
          <h3>{s.titulo}</h3>
          <dl>
            {s.mandos.map((m) => (
              <div key={m.nombre} className="ayuda-fila">
                <dt>{m.nombre}</dt>
                <dd>{m.que}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <section>
        <h3>Consejos</h3>
        <ul>
          {CONSEJOS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>
      {/* Qué versión hay en este aparato (la pone next.config.ts al compilar): para saber si ya ha
          llegado la última, que en el móvil a veces tarda una apertura más */}
      {process.env.NEXT_PUBLIC_VERSION && <p className="ayuda-version">GALILEO · versión {process.env.NEXT_PUBLIC_VERSION}</p>}
    </div>
  );
}
