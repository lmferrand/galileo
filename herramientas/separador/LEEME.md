# Cómo se hacen las etapas del separador (`public/separador/v2/`)

El modelo es htdemucs_6s (Demucs de Meta, MIT) en ONNX, de
https://huggingface.co/kramp/htdemucs-6s-webgpu-onnx. Entero, pide unos 2,4 GB
de memoria al separar con onnxruntime-web, y en un iPhone no cabe. Estas
herramientas lo dejan en unos 740 MB **sin cambiar el resultado**: se ha comprobado
que la salida es la misma, con la misma «huella».

1. `trocear.mjs`: cada atención se calcula cabeza a cabeza (8 tablas pequeñas en
   vez de una de 230 MB).
2. `tejas.mjs`: las convoluciones con búfer de trabajo grande se parten en tiras a lo
   largo del tiempo, cada una con su margen. Necesita un perfil de ORT para conocer
   las formas, que se saca con `perfil.mjs`.
3. `etapas-ext.mjs`: parte el grafo en 6 etapas (cortes 800,1300,1506,1650,1740),
   que se ejecutan una detrás de otra. Así la memoria de WebAssembly no se
   fragmenta, que era lo que más gastaba. Los pesos apuntan **dentro del archivo
   original** de Hugging Face, así que el aparato sigue descargando ese archivo.
4. `compactar.mjs`: deja en `etapas.json` qué trozos del original necesita cada
   etapa.

`memoria8.mjs` mide el montón de WebAssembly igual que lo hace el worker, y
`comparar.mjs` compara dos modelos.

Para ejecutarlas hacen falta `onnxruntime-node`, `onnxruntime-web` y una copia de
`node_modules/onnxruntime-web/lib/onnxjs/ort-schema/protobuf/onnx.js` guardada
junto a ellas como `onnx-proto.cjs`.

## Canciones ya separadas para añadir a Clavija (`paquetes.mjs`)

`node paquetes.mjs <carpeta-canciones> <htdemucs_6s.onnx> <carpeta-salida> [kbps]`
separa en el PC (onnxruntime-node, el modelo original entero) todas las canciones
de una carpeta y deja un `.zip` sin comprimir por canción: `cancion.json`
(nombre, frames, duración) y las 6 pistas en MP3. En Clavija, Pistas →
«Elegir canciones» → elegir los `.zip`: entran al momento, sin separar, y se
guardan en MP3 (unas diez veces menos que las que separa el aparato). Si un
`.zip` ya existe, esa canción se salta. Las canciones nunca van dentro de la web.

## Separación de más calidad en el PC (`paquetes-roformer.mjs`)

`node paquetes-roformer.mjs <carpeta-canciones> <bs_roformer_sw_fp32.onnx> <carpeta-salida> [kbps]`
con BS-RoFormer SW (jarredou; licencia CC BY-NC-SA 4.0, sin ánimo de lucro: se acredita
en cada canción), en ONNX de huggingface.co/Ryan5453/unblend (700 MB). La STFT y la
iSTFT (Hann periódica de 2048, salto 512, centrada) van en el script; trozos de 588 800
muestras con solape del 50 %. Unos 13 min por canción en el PC (Demucs: 2), pero la
guitarra y el bajo salen mucho más limpios. Mismo `.zip` que `paquetes.mjs`, con
`separador: "roformer"` y `credito` en `cancion.json`: al añadirlo, sustituye a la
canción con el mismo nombre y no se le aplica la limpieza del bajo. Va con dos procesos
a la vez (REVES=1, HILOS=4).
