# Separador de Galileo en Hugging Face (ZeroGPU).
#
# La app manda la canción desde el aparato de cada persona y recibe un .zip con las 6 pistas
# en mp3: el mismo formato que las tandas del PC (cancion.json + voz, guitarra, bajo, bateria,
# piano y resto .mp3), así la app lo importa por el camino de siempre.
#
# El tiempo de gráfica se descuenta de los minutos gratis de QUIEN LO USA, no de la cuenta del
# Space. Si se le acaban, ZeroGPU da un error que habla de «quota» y la app manda la canción a
# la cola del PC del estudio.
#
# Modelo: BS-RoFormer SW (jarredou), licencia CC BY-NC-SA 4.0 (uso no comercial).
# Código del modelo: Music-Source-Separation-Training (ZFTurbo), licencia MIT.

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor

import spaces  # antes que torch: ZeroGPU lo necesita así
import gradio as gr
import numpy as np
import torch
import torch.nn.functional as F
from huggingface_hub import hf_hub_download

from models.bs_roformer.bs_roformer import BSRoformer

SR = 44100
KBPS = 112
DURACION_MAX_S = 600
# De dónde sale el modelo (fijado a una revisión para que no cambie solo)
REPO_MODELO = os.environ.get("REPO_MODELO", "enerjazzer/BS-ROFO-SW-Fixed")
REVISION_MODELO = os.environ.get("REVISION_MODELO", "a443a2985534b3bc815ef54a5d446c6a0390f974")
ARCHIVO_MODELO = os.environ.get("ARCHIVO_MODELO", "BS-Rofo-SW-Fixed.ckpt")
# Segundos de gráfica que se piden: pedir de más gasta prioridad en la cola y, si quedan
# menos minutos que lo pedido, ZeroGPU no deja empezar. Se ajusta tras medir.
GPU_BASE_S = float(os.environ.get("GPU_BASE_S", "15"))
GPU_POR_SEGUNDO = float(os.environ.get("GPU_POR_SEGUNDO", "0.2"))
GPU_MAX_S = float(os.environ.get("GPU_MAX_S", "150"))

# Orden en que el modelo da las pistas, y orden dentro del zip (como en el PC)
SALIDAS = ["bajo", "bateria", "resto", "voz", "guitarra", "piano"]
ORDEN_ZIP = ["voz", "guitarra", "bajo", "bateria", "piano", "resto"]
CREDITO = "Separada con BS-RoFormer SW (jarredou), licencia CC BY-NC-SA 4.0."
EXTENSIONES = [".mp3", ".m4a", ".mp4", ".aac", ".wav", ".flac", ".ogg", ".opus", ".aif", ".aiff", ".caf", ".webm"]

# BS-Rofo-SW-Fixed.yaml: solo lo que usa el modelo al separar
CONFIG = dict(
    dim=256, depth=12, stereo=True, num_stems=6,
    time_transformer_depth=1, freq_transformer_depth=1, linear_transformer_depth=0,
    freqs_per_bands=(2,) * 24 + (4,) * 12 + (12,) * 8 + (24,) * 8 + (48,) * 8 + (128, 129),
    dim_head=64, heads=8, attn_dropout=0.1, ff_dropout=0.1, flash_attn=True,
    dim_freqs_in=1025, stft_n_fft=2048, stft_hop_length=512, stft_win_length=2048,
    stft_normalized=False, mask_estimator_depth=2, mlp_expansion_factor=4,
    use_torch_checkpoint=False, skip_connection=False,
)
TROZO = 588800  # muestras por trozo, como en el PC (13,35 s)
SOLAPE = 2      # cada muestra la separan 2 trozos y se funden


def cargar_modelo() -> BSRoformer:
    ruta = hf_hub_download(REPO_MODELO, ARCHIVO_MODELO, revision=REVISION_MODELO)
    # weights_only: solo números, nunca código de dentro del archivo
    pesos = torch.load(ruta, map_location="cpu", weights_only=True)
    if isinstance(pesos, dict) and "state_dict" in pesos:
        pesos = pesos["state_dict"]
    pesos = {k.removeprefix("module."): v for k, v in pesos.items()}
    modelo = BSRoformer(**CONFIG)
    modelo.load_state_dict(pesos)
    return modelo.eval()


# En ZeroGPU el modelo se pone en «cuda» al arrancar (la gráfica de verdad llega al separar)
DISPOSITIVO = "cuda" if torch.cuda.is_available() else "cpu"
MODELO = cargar_modelo().to(DISPOSITIVO)


def _ventana(fundido: int, dispositivo) -> torch.Tensor:
    v = torch.ones(TROZO, device=dispositivo)
    rampa = torch.linspace(0, 1, fundido, device=dispositivo)
    v[:fundido] = rampa
    v[-fundido:] = rampa.flip(0)
    return v


@torch.inference_mode()
def demezclar(mezcla: torch.Tensor) -> torch.Tensor:
    """(2, N) en float32 → (6, 2, N), en el orden de SALIDAS. Igual que MSST: trozos que se
    solapan a la mitad, fundidos lineales y bordes reflejados para que el principio y el
    final se separen tan bien como el medio."""
    dispositivo = next(MODELO.parameters()).device
    en_grafica = dispositivo.type == "cuda"
    lote_max = 4 if en_grafica else 1
    paso = TROZO // SOLAPE
    fundido = TROZO // 10
    borde = TROZO - paso
    n = mezcla.shape[-1]
    mezcla = mezcla.to(dispositivo)
    if n > 2 * borde:
        mezcla = F.pad(mezcla[None], (borde, borde), mode="reflect")[0]
    else:
        borde = 0
    total = mezcla.shape[-1]
    suma = torch.zeros((6, 2, total), device=dispositivo)
    pesos = torch.zeros(total, device=dispositivo)
    base = _ventana(fundido, dispositivo)
    lote, sitios = [], []
    i = 0
    while i < total:
        parte = mezcla[:, i:i + TROZO]
        largo = parte.shape[-1]
        if largo < TROZO:
            modo = "reflect" if largo > TROZO // 2 + 1 else "constant"
            parte = F.pad(parte[None], (0, TROZO - largo), mode=modo)[0]
        lote.append(parte)
        sitios.append((i, largo))
        i += paso
        if len(lote) >= lote_max or i >= total:
            with torch.autocast(device_type=dispositivo.type, dtype=torch.float16, enabled=en_grafica):
                salida = MODELO(torch.stack(lote))
            salida = salida.float()
            for j, (ini, lg) in enumerate(sitios):
                v = base.clone()
                if ini == 0:
                    v[:fundido] = 1
                if ini + paso >= total:
                    v[-fundido:] = 1
                suma[..., ini:ini + lg] += salida[j, ..., :lg] * v[:lg]
                pesos[ini:ini + lg] += v[:lg]
            lote, sitios = [], []
    pistas = suma / pesos.clamp_min(1e-8)
    if borde:
        pistas = pistas[..., borde:-borde]
    return pistas


def _segundos_gpu(ruta_mezcla: str, segundos: float) -> int:
    return int(min(GPU_MAX_S, GPU_BASE_S + segundos * GPU_POR_SEGUNDO))


@spaces.GPU(duration=_segundos_gpu)
def separar_en_gpu(ruta_mezcla: str, segundos: float) -> str:
    # Por archivo y no como resultado: así no viajan cientos de MB entre procesos
    mezcla = torch.from_numpy(np.load(ruta_mezcla))
    pistas = demezclar(mezcla)
    pistas = (pistas.clamp(-1, 1) * 32767).round().to(torch.int16).cpu().numpy()
    ruta = ruta_mezcla[:-4] + "-pistas.npy"
    np.save(ruta, pistas)
    return ruta


def decodificar(ruta: str) -> np.ndarray:
    """Cualquier audio → (2, N) float32 a 44,1 kHz."""
    orden = ["ffmpeg", "-v", "error", "-nostdin", "-i", ruta, "-t", str(DURACION_MAX_S + 1),
             "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"]
    hecho = subprocess.run(orden, capture_output=True, timeout=180)
    if hecho.returncode != 0 or not hecho.stdout:
        raise gr.Error("No se ha podido leer la canción. Prueba con un mp3, m4a o wav.")
    datos = np.frombuffer(hecho.stdout, dtype=np.float32)
    datos = datos[: len(datos) // 2 * 2].reshape(-1, 2).T
    if datos.shape[1] > DURACION_MAX_S * SR:
        raise gr.Error("La canción dura más de 10 minutos.")
    if datos.shape[1] < SR:
        raise gr.Error("La canción es demasiado corta.")
    return np.ascontiguousarray(datos)


def a_mp3(pista: np.ndarray) -> bytes:
    """(2, N) int16 → mp3 sin etiquetas (como las tandas del PC)."""
    orden = ["ffmpeg", "-v", "error", "-nostdin", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "-",
             "-c:a", "libmp3lame", "-b:a", f"{KBPS}k", "-write_xing", "0",
             "-id3v2_version", "0", "-write_id3v1", "0", "-f", "mp3", "-"]
    hecho = subprocess.run(orden, input=np.ascontiguousarray(pista.T).tobytes(), capture_output=True, timeout=300)
    if hecho.returncode != 0 or not hecho.stdout:
        raise gr.Error("No se han podido guardar las pistas.")
    return hecho.stdout


def _nombre_archivo(nombre: str) -> str:
    limpio = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", nombre).strip()[:80]
    return limpio or "cancion"


def _limpiar_viejas():
    """Los zip ya entregados se quedan en /tmp: se borran pasada una hora."""
    raiz = tempfile.gettempdir()
    for d in os.listdir(raiz):
        ruta = os.path.join(raiz, d)
        if d.startswith("clavija-") and os.path.isdir(ruta) and time.time() - os.path.getmtime(ruta) > 3600:
            shutil.rmtree(ruta, ignore_errors=True)


def separar(archivo, nombre):
    if not archivo:
        raise gr.Error("No ha llegado ninguna canción.")
    _limpiar_viejas()
    ruta = archivo if isinstance(archivo, str) else archivo.name
    nombre = (nombre or "").strip()[:120] or os.path.splitext(os.path.basename(ruta))[0]
    mezcla = decodificar(ruta)
    segundos = mezcla.shape[1] / SR
    carpeta = tempfile.mkdtemp(prefix="clavija-")
    ruta_mezcla = os.path.join(carpeta, "mezcla.npy")
    np.save(ruta_mezcla, mezcla)
    del mezcla
    try:
        pistas = np.load(separar_en_gpu(ruta_mezcla, segundos))
        with ThreadPoolExecutor(6) as hilos:
            mp3s = dict(zip(SALIDAS, hilos.map(a_mp3, [pistas[k] for k in range(len(SALIDAS))])))
        info = {"nombre": nombre, "frames": int(pistas.shape[-1]), "duracion": pistas.shape[-1] / SR,
                "separador": "roformer", "credito": CREDITO}
        ruta_zip = os.path.join(carpeta, _nombre_archivo(nombre) + ".zip")
        with zipfile.ZipFile(ruta_zip, "w", zipfile.ZIP_STORED) as z:
            z.writestr("cancion.json", json.dumps(info, ensure_ascii=False, indent=2))
            for p in ORDEN_ZIP:
                z.writestr(p + ".mp3", mp3s[p])
        return ruta_zip
    finally:
        for f in ("mezcla.npy", "mezcla-pistas.npy"):
            try:
                os.remove(os.path.join(carpeta, f))
            except FileNotFoundError:
                pass


with gr.Blocks(title="Separador de Galileo", delete_cache=(1800, 3600)) as demo:
    gr.Markdown(
        "## Separador de Galileo\n"
        "Separa una canción en 6 pistas (voz, guitarra, bajo, batería, piano y resto) con "
        "BS-RoFormer SW. Se usa desde la app Galileo; aquí puedes probarlo con un archivo. "
        "Uso no comercial."
    )
    entrada = gr.File(label="Canción", file_types=EXTENSIONES, type="filepath")
    titulo = gr.Textbox(label="Nombre de la canción", max_lines=1)
    boton = gr.Button("Separar", variant="primary")
    salida = gr.File(label="Las 6 pistas (.zip)")
    boton.click(separar, [entrada, titulo], salida, api_name="separar", concurrency_limit=4)

demo.queue(max_size=40).launch(show_error=True)
