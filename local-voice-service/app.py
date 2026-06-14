import asyncio
import os
import tempfile
from pathlib import Path

from flask import Flask, jsonify, request, send_file
from faster_whisper import WhisperModel
import edge_tts

app = Flask(__name__)

MODEL_NAME = os.getenv("WHISPER_MODEL", "small")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
HOST = os.getenv("LOCAL_VOICE_HOST", "127.0.0.1")
PORT = int(os.getenv("LOCAL_VOICE_PORT", "5001"))

# Load once at startup for better performance.
model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)


def _suffix_from_mime(mime_type: str) -> str:
    mime = (mime_type or "").lower()
    if "ogg" in mime:
        return ".ogg"
    if "wav" in mime:
        return ".wav"
    if "mpeg" in mime or "mp3" in mime:
        return ".mp3"
    if "mp4" in mime:
        return ".mp4"
    return ".bin"


@app.post("/transcribe")
def transcribe():
    if "file" not in request.files:
        return jsonify({"error": "file is required"}), 400

    file = request.files["file"]
    if not file or file.filename == "":
        return jsonify({"error": "file is empty"}), 400

    suffix = _suffix_from_mime(file.mimetype)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_path = tmp.name
            file.save(tmp)

        segments, _ = model.transcribe(
            temp_path,
            vad_filter=True,
            beam_size=1,
            temperature=0.0,
            condition_on_previous_text=False,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return jsonify({"text": text})
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500
    finally:
        if temp_path and Path(temp_path).exists():
            Path(temp_path).unlink(missing_ok=True)


async def _edge_tts_to_file(text: str, voice: str, output_path: str) -> None:
    communicate = edge_tts.Communicate(text=text, voice=voice)
    await communicate.save(output_path)


@app.post("/tts")
def tts():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    voice = (data.get("voice") or "en-US-JennyNeural").strip()

    if not text:
        return jsonify({"error": "text is required"}), 400

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
            temp_path = tmp.name

        asyncio.run(_edge_tts_to_file(text=text, voice=voice, output_path=temp_path))
        return send_file(temp_path, mimetype="audio/mpeg", as_attachment=False)
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500
    finally:
        if temp_path and Path(temp_path).exists():
            Path(temp_path).unlink(missing_ok=True)


@app.get("/health")
def health():
    return jsonify({"status": "ok", "model": MODEL_NAME, "device": DEVICE})


if __name__ == "__main__":
    app.run(host=HOST, port=PORT)
