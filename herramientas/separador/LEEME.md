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
