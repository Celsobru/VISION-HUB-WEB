#!/usr/bin/env python3
"""VISION PLUS - Transcreve audio/video com faster-whisper e devolve segmentos JSON.

Uso:
    python whisper-transcribe.py <arquivo.mp4|wav|mp3> [--model small] [--lang pt]

Saida (stdout): JSON [{"start": 0.0, "duration": 2.5, "text": "..."}, ...]
Erros vao para stderr. Exit code != 0 em falha.
Modelo baixado uma vez e cacheado em ~/.cache/huggingface.
"""
import json
import sys

def parse_args(argv):
    media = None
    model_name = "small"
    lang = "pt"
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--model" and i + 1 < len(argv):
            model_name = argv[i + 1]
            i += 2
        elif a == "--lang" and i + 1 < len(argv):
            lang = argv[i + 1]
            i += 2
        elif not a.startswith("--") and media is None:
            media = a
            i += 1
        else:
            i += 1
    return media, model_name, lang

def main():
    media, model_name, lang = parse_args(sys.argv[1:])
    if not media:
        print("Uso: whisper-transcribe.py <arquivo> [--model small] [--lang pt]", file=sys.stderr)
        return 2
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        print("faster-whisper nao instalado: pip install faster-whisper", file=sys.stderr)
        return 3
    try:
        # int8 = rapido e economico em CPU; compute_type cai p/ int8 em CPU automaticamente
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        segments_iter, _info = model.transcribe(
            media,
            language=lang,
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )
        out = []
        for seg in segments_iter:
            text = (seg.text or "").strip()
            if not text:
                continue
            out.append({
                "start": round(float(seg.start), 2),
                "duration": round(max(0.3, float(seg.end) - float(seg.start)), 2),
                "text": text,
            })
        sys.stdout.write(json.dumps(out, ensure_ascii=False))
        return 0
    except Exception as e:
        print("Falha na transcricao: %s" % e, file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
