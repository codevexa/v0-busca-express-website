"""
Aplica a narração (public/narracao/*.wav, nos tempos de narracao/roteiro.json) sobre um
MP4 já renderizado, sem renderizar os quadros de novo. Equivale ao áudio que `npm run render`
inclui quando os arquivos de narração existem.

Uso: python scripts/mixar.py entrada.mp4 saida.mp4 [pasta_dos_wavs]
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
entrada, saida = sys.argv[1], sys.argv[2]
pasta = pathlib.Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / "public" / "narracao"
falas = json.loads((ROOT / "narracao" / "roteiro.json").read_text(encoding="utf-8"))["falas"]

cmd = ["ffmpeg", "-v", "error", "-y", "-i", entrada]
filtros = []
for i, f in enumerate(falas, start=1):
    cmd += ["-i", str(pasta / f"{f['id']}.wav")]
    ms = int(round(f["inicio"] * 1000))
    filtros.append(f"[{i}:a]adelay={ms}|{ms},aformat=channel_layouts=stereo[a{i}]")
mix = "".join(f"[a{i}]" for i in range(1, len(falas) + 1))
filtros.append(f"{mix}amix=inputs={len(falas)}:normalize=0:duration=longest,apad[voz]")
cmd += [
    "-filter_complex", ";".join(filtros),
    "-map", "0:v", "-map", "[voz]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-shortest", "-movflags", "+faststart", saida,
]
subprocess.run(cmd, check=True)
print(saida)
