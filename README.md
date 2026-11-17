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

## Desarrollo

```bash
npm install
npm run dev
```

El micrófono solo funciona en `localhost` o con HTTPS.
