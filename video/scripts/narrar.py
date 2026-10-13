"""
Gera a narração do vídeo (voz sintética em pt-BR, modelo aberto Kokoro, licença Apache 2.0).

Uso:
  python scripts/narrar.py [--voz pf_dora|pm_alex|pm_santa] [--modelos DIR]

Lê narracao/roteiro.json e grava public/narracao/<id>.wav. Se uma fala passar do
tempo disponível ("max", em segundos), a velocidade é aumentada até caber (limite 1,25x).
Os modelos (kokoro-v1.0.onnx e voices-v1.0.bin) são baixados de
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
Dependências: pip install kokoro-onnx soundfile
"""
import argparse
import json
import pathlib
import shutil
import subprocess

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = pathlib.Path(__file__).resolve().parent.parent

parser = argparse.ArgumentParser()
parser.add_argument("--voz", default=None)
parser.add_argument("--modelos", default=str(ROOT / "narracao" / "modelos"))
args = parser.parse_args()

roteiro = json.loads((ROOT / "narracao" / "roteiro.json").read_text(encoding="utf-8"))
voz = args.voz or roteiro["voz"]
modelos = pathlib.Path(args.modelos)
kokoro = Kokoro(str(modelos / "kokoro-v1.0.onnx"), str(modelos / "voices-v1.0.bin"))

saida = ROOT / "public" / "narracao"
saida.mkdir(parents=True, exist_ok=True)

for fala in roteiro["falas"]:
    velocidade = 1.0
    while True:
        audio, sr = kokoro.create(fala["texto"], voice=voz, speed=velocidade, lang="pt-br")
        # Remove silêncio nas pontas para o início ficar exatamente no tempo marcado.
        voz_ativa = np.where(np.abs(audio) > 0.01)[0]
        if len(voz_ativa):
            audio = audio[max(0, voz_ativa[0] - int(0.03 * sr)) : voz_ativa[-1] + int(0.12 * sr)]
        duracao = len(audio) / sr
        if duracao <= fala["max"] or velocidade >= 1.25:
            break
        velocidade = round(velocidade + 0.05, 2)
    destino = saida / f"{fala['id']}.wav"
    sf.write(destino, audio.astype(np.float32), sr)
    # Tratamento de locução (se houver ffmpeg): compressão leve e loudness de -16 LUFS.
    if shutil.which("ffmpeg"):
        temp = destino.with_suffix(".tmp.wav")
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(destino), "-af",
             "highpass=f=70,acompressor=threshold=-24dB:ratio=3:attack=5:release=90:makeup=2,"
             "loudnorm=I=-16:TP=-1.5:LRA=7", "-ar", "48000", str(temp)],
            check=True,
        )
        temp.replace(destino)
    aviso = "  << passou do tempo" if duracao > fala["max"] else ""
    print(f"{fala['id']}: {duracao:.2f}s (máx {fala['max']}s, velocidade {velocidade}){aviso}")
