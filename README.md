# Clavija

Afinador de guitarra que funciona en el navegador con el micrófono del móvil.
Sustituye a la antigua app de Los Teros en el mismo proyecto de Vercel.

## Qué hace

- Detecta la nota con el algoritmo YIN (`lib/yin.ts`), estabilizada con una mediana (`lib/motor.ts`).
- 19 afinaciones (estándar, bajadas, drop, abiertas, DADGAD…) y afinaciones propias (`lib/afinaciones.ts`).
- Modo automático (sabe qué cuerda suena) o manual (tocando una clavija), y modo cromático.
- Nota de referencia sintetizada (`lib/tono.ts`) y La de referencia ajustable (415–466 Hz).
- Se instala en la pantalla de inicio y abre sin internet (`public/sw.js`).
- Las preferencias se guardan en el propio aparato; no usa base de datos.

## Pistas (`/pistas`)

- Separa una canción en voz, guitarra, bajo, batería, piano y resto dentro del navegador, con
  Demucs `htdemucs_6s` en ONNX (MIT) y onnxruntime-web desde jsDelivr (`public/separador.worker.js`).
- Va con el procesador (WebAssembly, todos los núcleos menos uno). Para usar varios núcleos hace
  falta aislamiento entre orígenes: cabeceras COOP/COEP en `next.config.ts`.
- WebGPU está desactivado: en una gráfica Intel el primer trozo se quedaba colgado y bloqueaba la pestaña.
- El modelo (285 MB) se descarga una vez y se guarda en Cache Storage o, si falla, en IndexedDB.
- Las pistas se guardan como WAV de 16 bits en IndexedDB (`lib/pistas/almacen.ts`), ~1 MB por segundo de canción.
- Se reproducen juntas con un AudioWorklet que las mezcla muestra a muestra (`public/mezclador.worklet.js`).

## Desarrollo

```bash
npm install
npm run dev
```

El micrófono solo funciona en `localhost` o con HTTPS.
