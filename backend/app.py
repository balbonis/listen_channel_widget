import os
import base64
import httpx
from tempfile import NamedTemporaryFile
from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
ELEVENLABS_MODEL_ID = os.getenv("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")

client = OpenAI(api_key=OPENAI_API_KEY)

app = Flask(__name__)


def log(msg):
    print(f"[listen_client_widget] {msg}", flush=True)


# ------------------------------- Whisper STT
def transcribe_audio(path):
    try:
        log(f"Transcribing: {path}")
        with open(path, "rb") as f:
            result = client.audio.transcriptions.create(
                file=f,
                model="whisper-1",
                language="en"
            )
        text = result.text or ""
        log(f"Whisper result → '{text}'")
        return text
    except Exception as e:
        log(f"❌ Whisper error: {e}")
        return ""


# ------------------------------- MCP Orchestrator
def contact_orchestrator(text):
    payload = {
        "user_id": "listen-user",
        "session_id": "listen-user:web",
        "channel": "web",
        "text": text,
    }

    log(f"Sending to Orchestrator → {payload}")

    try:
        r = httpx.post(ORCHESTRATOR_URL, json=payload, timeout=30)
        r.raise_for_status()
        data = r.json()
        log(f"MCP Response → {data}")
        return data
    except Exception as e:
        log(f"❌ MCP error: {e}")
        return {"reply_text": "I encountered an issue", "session_done": False}


# ------------------------------- ElevenLabs TTS
def synthesize_speech(text):
    log(f"Generating TTS for: {text}")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": ELEVENLABS_MODEL_ID,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }

    try:
        r = httpx.post(url, headers=headers, json=payload, timeout=60)
        r.raise_for_status()
        audio_b64 = base64.b64encode(r.content).decode("utf-8")
        return audio_b64, "audio/mpeg"
    except Exception as e:
        log(f"❌ TTS error: {e}")
        return None, None


# ------------------------------- Routes
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/voice", methods=["POST"])
def api_voice():
    if "audio" not in request.files:
        log("❌ No audio")
        return jsonify({"error": "no_audio"}), 400

    audio_file = request.files["audio"]
    log(f"Received audio upload: {audio_file.filename}")

    with NamedTemporaryFile(delete=False) as tmp:
        audio_file.save(tmp.name)
        tmp_path = tmp.name

    try:
        text = transcribe_audio(tmp_path)
        if not text:
            return jsonify({"error": "empty_transcript"}), 200

        orchestrator = contact_orchestrator(text)
        reply_text = orchestrator.get("reply_text", "")
        session_done = orchestrator.get("session_done", False)

        audio_b64, mime = synthesize_speech(reply_text)

        res = {
            "user_text": text,
            "reply_text": reply_text,
            "audio_base64": audio_b64,
            "audio_mime": mime,
            "session_done": session_done,
        }

        log(f"Final Response → {res}")
        return jsonify(res)

    except Exception as e:
        log(f"❌ Handler Error: {e}")
        return jsonify({"error": "server_error"}), 500

    finally:
        try:
            os.remove(tmp_path)
        except:
            pass


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
