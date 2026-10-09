"""Genera un mp3 por parte (edge-tts, es-AR-ElenaNeural) y sus marcas de palabras; anota la duración con ffprobe."""
import asyncio, json, subprocess, sys, pathlib
import edge_tts

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FFPROBE = sys.argv[1] if len(sys.argv) > 1 else "ffprobe"

async def generar(parte):
    destino = RAIZ / "audio" / f"{parte['id']}.mp3"
    com = edge_tts.Communicate(parte["voz"], "es-AR-ElenaNeural", boundary="WordBoundary")
    palabras = []
    with open(destino, "wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                palabras.append({"t": chunk["offset"] / 1e7, "w": chunk["text"]})
    dur = float(subprocess.check_output([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(destino)]).decode().strip())
    return {"id": parte["id"], "duracion": round(dur, 3), "palabras": palabras}

async def main():
    partes = json.loads((RAIZ / "scripts" / "partes.json").read_text(encoding="utf8"))
    res = [await generar(p) for p in partes]
    (RAIZ / "audio" / "duraciones.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf8")
    for r in res:
        print(r["id"], r["duracion"], "s")
    print("total", round(sum(r["duracion"] for r in res), 1), "s")

asyncio.run(main())
