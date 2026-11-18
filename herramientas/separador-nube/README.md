---
title: Separador de The Clavija
emoji: 🎸
colorFrom: purple
colorTo: green
sdk: gradio
sdk_version: 5.50.0
python_version: "3.12"
app_file: app.py
pinned: false
license: cc-by-nc-sa-4.0
short_description: Separa canciones en 6 pistas para The Clavija
---

# Separador de The Clavija

Separa una canción en 6 pistas (voz, guitarra, bajo, batería, piano y resto) para la app
The Clavija. Devuelve un `.zip` con `cancion.json` y las 6 pistas en mp3, el mismo formato
que las tandas del PC del estudio.

- Corre en **ZeroGPU** (gráfica gratis de Hugging Face). El tiempo de gráfica se descuenta de
  los minutos gratis de quien lo usa; si se acaban, la app manda la canción al PC del estudio.
- Mientras la cuenta no cumpla 30 días se puede probar en «CPU basic»: funciona igual, pero
  tarda muchos minutos.
- Uso no comercial.

## Créditos

- Modelo: **BS-RoFormer SW** de jarredou, licencia CC BY-NC-SA 4.0. Los pesos se bajan de
  `enerjazzer/BS-ROFO-SW-Fixed` en una revisión fija (variables `REPO_MODELO`,
  `REVISION_MODELO` y `ARCHIVO_MODELO` para cambiarlo).
- Código del modelo: [Music-Source-Separation-Training](https://github.com/ZFTurbo/Music-Source-Separation-Training)
  de ZFTurbo, licencia MIT (ver `LICENSE-MSST`). `attend.py` está reducido para separar.

## Ajustes (variables del Space)

- `GPU_BASE_S`, `GPU_POR_SEGUNDO` y `GPU_MAX_S`: segundos de gráfica que se piden por canción
  (base + por cada segundo de canción, con tope). Pedir de más empeora el turno en la cola.
