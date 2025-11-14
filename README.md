# 📘 README — listen_client_widget

## 🎤 Overview
**listen_client_widget** is a fully hands-free, browser-based AI voice assistant that connects to:

- **OpenAI Whisper** → Speech-to-Text  
- **MCP Orchestrator** → Stateful intent management (food ordering flow, memory, state)  
- **ElevenLabs** → Natural Text-to-Speech  
- **Advanced Voice Activity Detection (VAD)** → User-only speech detection  
- **Strictness B Mode** → High-precision filtering  
- **Mode 2** → Smart fallback if user voice shifts  
- **iOS-safe audio pipeline**  

This widget can be embedded into **any website**, **mobile browser**, or **web app** using a single `<script>` tag.

The backend is powered by **Flask**, designed specifically for **Railway deployment**, and acts as a “bridge” to:

- Whisper STT  
- MCP Orchestrator  
- ElevenLabs TTS

---

## 🧩 Project Structure

```
listen_client_widget/
│
├── README.md
│
├── backend/
│   ├── app.py                # Flask backend: STT → MCP → TTS pipeline
│   ├── requirements.txt       # Python dependencies
│   ├── Procfile               # Railway process file
│   ├── .env.example           # Environment variable template
│   │
│   ├── templates/
│   │    └── index.html        # Simple test page with embedded widget
│   │
│   └── static/
│        ├── widget.js         # Full voice widget (Advanced VAD + Strict B + Mode 2)
│        └── widget.css        # Widget styling
```

---

## 🚀 Features

### ✔ Hands-Free Voice Interaction  
Automatically listens when the user speaks.  
Automatically stops after the conversation ends (`session_done`).

### ✔ Advanced VAD (Voice Activity Detection)
Prevents false triggers from:

- Background noise  
- Other people talking  
- Environmental sounds  

Includes:

- RMS energy analysis  
- Pitch detection (autocorrelation)  
- Strictness B gating  
- Mode 2 recovery logic  

### ✔ Calibration Wizard (Noise + Voice)
Before starting, the user performs:

1. **Noise Calibration** (2 seconds)  
2. **Voice Calibration** (2 seconds)

A profile is built:

```json
{
  "noiseFloor": ...,
  "voiceMean": ...,
  "pitchMin": ...,
  "pitchMax": ...
}
```

Used by VAD to detect *only the calibrated user*.

### ✔ Whisper → MCP → ElevenLabs Pipeline  
1. Microphone audio recorded in WAV (16 kHz)  
2. Uploaded to backend (`/api/voice`)  
3. Whisper transcribes  
4. MCP Orchestrator produces contextual reply  
5. ElevenLabs generates TTS  
6. Widget plays audio  
7. Session auto-stops if ordering completed

### ✔ Mobile Friendly + iOS Safari Safe  
Includes:

- Audio context unlock  
- Visibility change recovery  
- Safari autoplay constraints handling  
- Automatic resume of suspended contexts  

### ✔ Embeddable Anywhere  
Add this to your page:

```html
<script src="YOUR_BACKEND_URL/static/widget.js" data-backend-url="YOUR_BACKEND_URL"></script>
```

Widget appears as a floating assistant in the browser.

---

## ⚙️ Setup Instructions

### 1. Clone the repo

```
git clone <your-repo-url>
cd listen_client_widget/backend
```

---

## 📦 Install dependencies

```
pip install -r requirements.txt
```

---

## 🔐 Environment Variables

Copy `.env.example` → `.env`:

```
OPENAI_API_KEY=sk-...
ORCHESTRATOR_URL=https://your-orchestrator-url/orchestrate
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

Railway → Variables tab → copy same keys.

---

## ▶️ Run Locally

```
python app.py
```

Then visit:

```
http://localhost:5000/
```

---

## 🛫 Deploy to Railway

1. Create new Railway service  
2. Choose **Deploy from GitHub** or **Upload folder**  
3. Set root directory to:

```
listen_client_widget/backend
```

4. Add environment variables  
5. Railway auto-detects Python  
6. App runs on:

```
https://your-railway-app.up.railway.app/
```

---

## 🗣 Embedding the Widget in Any Webpage

Add:

```html
<script
  src="https://your-railway-instance.up.railway.app/static/widget.js"
  data-backend-url="https://your-railway-instance.up.railway.app"
></script>
```

The voice assistant will appear automatically.

---

## 🧪 Testing

### Test Whisper + MCP + TTS  
Use curl or Postman:

```
POST /api/voice
Content-Type: multipart/form-data
audio: <audio/wav>
```

### Test UI  
Visit `index.html` via `/` route.

---

## 🧠 Architecture

```
User Speech
    ↓ microphone (browser)
VAD (widget.js)
    ↓ 
WAV Buffer (16 kHz)
    ↓
Flask Backend
    ↓ Whisper STT
MCP Orchestrator (state, memory)
    ↓ AI reply text
ElevenLabs TTS
    ↓ base64 audio
Browser Plays Response
```

Hands-free continues until Orchestrator responds:

```json
{ "session_done": true }
```

Then widget stops listening.

---

## 🧹 Future Enhancements

- Wake word ("Hey Blink")  
- Real-time streaming Whisper  
- WebRTC noise suppression  
- Multi-user profiles  
- Conversation history UI  
- Diagnostics dashboard  

---

## ❤️ Support  
If you want:

- NEW wake-word version  
- Auto language detection  
- Desktop app bundle  
- Mobile PWA version  
- Embeddable SDK version  

Just ask!
