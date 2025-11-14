/* --------------------------------------------------------------
   listen_client_widget — Full Single-File Version
   Advanced VAD + Strictness B + Mode 2 + Hands-free + iOS Safe
-------------------------------------------------------------- */

(function () {
  if (window.__listen_client_widget_loaded__) {
    console.warn("listen_client_widget already initialized.");
    return;
  }
  window.__listen_client_widget_loaded__ = true;

  // ------------------------------------------------------------
  // Create UI
  // ------------------------------------------------------------
  const root = document.createElement("div");
  root.className = "lcw-root";
  root.innerHTML = `
    <div class="lcw-card">
      <div class="lcw-title">Voice Assistant</div>
      <div class="lcw-subtitle">Hands-Free Enabled Widget</div>

      <div class="lcw-row" style="margin-top:12px;">
        <button class="lcw-btn" id="lcw-calibrate">Calibrate</button>

        <label class="lcw-toggle-label">
          <input type="checkbox" id="lcw-hf" />
          Hands-Free
        </label>
      </div>

      <div id="lcw-status" class="lcw-status-pill lcw-status-idle">
        <div class="lcw-dot"></div>
        <span>Idle</span>
      </div>

      <div class="lcw-log-label">Log</div>
      <div id="lcw-log" class="lcw-log"></div>

      <audio id="lcw-audio" class="lcw-audio" controls></audio>
    </div>
  `;
  document.body.appendChild(root);

  // UI references
  const logEl = document.getElementById("lcw-log");
  const hfToggle = document.getElementById("lcw-hf");
  const calibrateBtn = document.getElementById("lcw-calibrate");
  const audioEl = document.getElementById("lcw-audio");
  const statusEl = document.getElementById("lcw-status");

  function log(msg) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setStatus(type, text) {
    statusEl.className =
      "lcw-status-pill lcw-status-" +
      {
        idle: "idle",
        calibrating: "calibrating",
        listening: "listening",
        processing: "processing",
        speaking: "speaking",
      }[type];

    statusEl.querySelector("span").textContent = text;
  }

  // ------------------------------------------------------------
  // Backend URL from script tag
  // ------------------------------------------------------------
  const scriptTag = document.currentScript || document.querySelector('script[src*="widget.js"]');
  let backendBase = scriptTag?.dataset?.backendUrl || "";
  if (!backendBase) {
    backendBase = ""; // same domain
  }

  // ------------------------------------------------------------
  // Audio setup
  // ------------------------------------------------------------
  let audioCtx = null;
  let sourceNode = null;
  let processorNode = null;

  let handsFree = false;
  let isProcessing = false;
  let recordingSpeech = false;

  let speechBuffers = [];

  // Calibration
  let calibrationPhase = 0;
  let noiseSamples = [];
  let voiceSamples = [];

  let userProfile = null;

  async function ensureAudio() {
    if (audioCtx) return;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000,
    });

    await audioCtx.resume().catch(() => {});
    await unlockAudioContextIfNeeded();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });

    sourceNode = audioCtx.createMediaStreamSource(stream);
    processorNode = audioCtx.createScriptProcessor(2048, 1, 1);

    processorNode.onaudioprocess = handleAudioFrame;

    sourceNode.connect(processorNode);
    processorNode.connect(audioCtx.destination);
  }

  function teardownAudio() {
    try {
      processorNode?.disconnect();
      sourceNode?.disconnect();
      audioCtx?.close();
    } catch {}
    audioCtx = null;
    sourceNode = null;
    processorNode = null;
  }

  function unlockAudioContextIfNeeded() {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  // ------------------------------------------------------------
  // Calibration
  // ------------------------------------------------------------
  function startCalibration() {
    noiseSamples = [];
    voiceSamples = [];
    userProfile = {
      noiseFloor: 0,
      voiceMean: 0,
      pitchMin: 9999,
      pitchMax: 0,
    };

    calibrationPhase = 1;
    setStatus("calibrating", "Calibrating (Noise)…");
    log("🔧 Calibration Step 1/2: capturing room noise for 2 seconds…");

    ensureAudio();

    setTimeout(() => {
      calibrationPhase = 2;
      log("🔧 Calibration Step 2/2: please speak normally for 2 seconds…");
      setStatus("calibrating", "Calibrating (Voice)…");

      setTimeout(() => finishCalibration(), 2000);
    }, 2000);
  }

  function finishCalibration() {
    calibrationPhase = 0;

    // Noise floor
    const noiseVals = noiseSamples.map(s => s.rms);
    const noiseFloor = noiseVals.reduce((a, b) => a + b, 0) / Math.max(1, noiseVals.length);

    // Voice RMS
    const voiceRMSVals = voiceSamples.map(s => s.rms);
    const voiceMean = voiceRMSVals.reduce((a, b) => a + b, 0) / Math.max(1, voiceRMSVals.length);

    userProfile.noiseFloor = noiseFloor;
    userProfile.voiceMean = voiceMean;

    if (userProfile.pitchMin === 9999) {
      userProfile.pitchMin = 0;
      userProfile.pitchMax = 0;
    }

    log("Calibration complete:");
    log(JSON.stringify(userProfile, null, 2));
    setStatus("idle", "Idle");
  }

  // ------------------------------------------------------------
  // RMS + Pitch detection
  // ------------------------------------------------------------
  function computeRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i];
      sum += v * v;
    }
    return Math.sqrt(sum / samples.length);
  }

  function autoCorrelatePitch(buffer, sampleRate) {
    let SIZE = buffer.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      let val = buffer[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return 0;

    let r1 = 0,
      r2 = SIZE - 1;
    const thres = 0.2;

    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buffer[i]) < thres) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buffer[SIZE - i]) < thres) {
        r2 = SIZE - i;
        break;
      }
    }

    buffer = buffer.slice(r1, r2);
    SIZE = buffer.length;

    let c = new Array(SIZE).fill(0);

    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE - i; j++) {
        c[i] = c[i] + buffer[j] * buffer[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1,
      maxpos = -1;

    for (let i = d; i < SIZE; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    if (maxpos <= 0) return 0;

    const T0 = maxpos;
    const freq = sampleRate / T0;
    if (freq < 50 || freq > 500) return 0;

    return freq;
  }

  // ------------------------------------------------------------
  // Strictness B + Mode 2 VAD
  // ------------------------------------------------------------
  function detectUserSpeech(rms, pitch, profile) {
    const rmsGate = rms > profile.noiseFloor * 2.5;
    const rmsCeiling = rms < profile.voiceMean * 5;

    if (!rmsGate || !rmsCeiling) return false;

    if (!pitch || pitch === 0) {
      return rms > profile.noiseFloor * 4;
    }

    const pMin = profile.pitchMin;
    const pMax = profile.pitchMax;

    if (pMin === 0 && pMax === 0) return rmsGate;

    const middle = (pMin + pMax) / 2;
    const tolerance = middle * 0.2;

    const withinPitch =
      pitch > middle - tolerance && pitch < middle + tolerance;

    if (!withinPitch) {
      if (rms > profile.voiceMean * 3.5) {
        return true;
      }
      return false;
    }

    return true;
  }

  // ------------------------------------------------------------
  // Audio frame handler
  // ------------------------------------------------------------
  function handleAudioFrame(event) {
    const input = event.inputBuffer.getChannelData(0);
    const rms = computeRMS(input);
    const pitch = autoCorrelatePitch(input, 16000);

    if (calibrationPhase === 1) {
      noiseSamples.push({ rms, pitch });
      return;
    }
    if (calibrationPhase === 2) {
      voiceSamples.push({ rms, pitch });
      if (pitch > 50 && pitch < 400) {
        userProfile.pitchMin = Math.min(userProfile.pitchMin, pitch);
        userProfile.pitchMax = Math.max(userProfile.pitchMax, pitch);
      }
      return;
    }

    if (!handsFree || !userProfile || isProcessing) return;

    const isSpeech = detectUserSpeech(rms, pitch, userProfile);

    if (isSpeech && !recordingSpeech) {
      recordingSpeech = true;
      speechBuffers = [];
      setStatus("listening", "Listening…");
    }

    if (recordingSpeech) {
      speechBuffers.push(new Float32Array(input));

      if (!isSpeech) {
        recordingSpeech = false;
        finalizeUtterance();
      }
    }
  }

  // ------------------------------------------------------------
  // Merge & Encode WAV
  // ------------------------------------------------------------
  function mergeFloat32(chunks) {
    let total = 0;
    chunks.forEach(c => (total += c.length));

    const merged = new Float32Array(total);
    let offset = 0;
    chunks.forEach(c => {
      merged.set(c, offset);
      offset += c.length;
    });
    return merged;
  }

  function floatToWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    function writeStr(off, str) {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(off + i, str.charCodeAt(i));
      }
    }

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    return buffer;
  }

  // ------------------------------------------------------------
  // Finalize utterance → backend
  // ------------------------------------------------------------
  async function finalizeUtterance() {
    if (!speechBuffers.length || isProcessing) return;

    isProcessing = true;
    setStatus("processing", "Processing…");

    try {
      const merged = mergeFloat32(speechBuffers);
      const wav = floatToWav(merged, 16000);
      const blob = new Blob([wav], { type: "audio/wav" });

      const form = new FormData();
      form.append("audio", blob, "speech.wav");

      log("Uploading speech…");

      const res = await fetch(`${backendBase}/api/voice`, {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      handleBackendResponse(data);

    } catch (err) {
      log("❌ upload error: " + err);
      setStatus("idle", "Error");
    }

    isProcessing = false;
  }

  // ------------------------------------------------------------
  // Handle backend response
  // ------------------------------------------------------------
  function handleBackendResponse(data) {
    const {
      user_text,
      reply_text,
      audio_base64,
      audio_mime,
      session_done,
    } = data;

    log("User → " + user_text);
    log("AI → " + reply_text);

    if (audio_base64) {
      setStatus("speaking", "Speaking…");

      const src = `data:${audio_mime};base64,${audio_base64}`;
      audioEl.src = src;
      audioEl.play().catch(e => log("TTS play error: " + e));

      audioEl.onended = () => {
        if (session_done) {
          log("Session done — stopping hands-free");
          stopHandsFree();
        } else {
          setStatus("listening", "Listening…");
        }
      };
    } else {
      if (session_done) {
        stopHandsFree();
      } else {
        setStatus("listening", "Listening…");
      }
    }
  }

  // ------------------------------------------------------------
  // Hands-free
  // ------------------------------------------------------------
  async function startHandsFree() {
    if (!userProfile) {
      log("⚠️ Calibrate first.");
      hfToggle.checked = false;
      return;
    }

    handsFree = true;
    log("Hands-free ON");
    setStatus("listening", "Listening…");

    await ensureAudio();
  }

  function stopHandsFree() {
    handsFree = false;
    hfToggle.checked = false;
    recordingSpeech = false;
    speechBuffers = [];
    log("Hands-free OFF");
    setStatus("idle", "Idle");
    teardownAudio();
  }

  // ------------------------------------------------------------
  // UI events
  // ------------------------------------------------------------
  calibrateBtn.addEventListener("click", () => {
    log("Starting calibration…");
    startCalibration();
  });

  hfToggle.addEventListener("change", () => {
    if (hfToggle.checked) startHandsFree();
    else stopHandsFree();
  });

  // ------------------------------------------------------------
  // iOS audio fixes
  // ------------------------------------------------------------
  audioEl.addEventListener("play", unlockAudioContextIfNeeded);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      unlockAudioContextIfNeeded();
      if (handsFree) ensureAudio();
    }
  });

  // ------------------------------------------------------------
  // Global export
  // ------------------------------------------------------------
  window.listenClientWidget = {
    start: startHandsFree,
    stop: stopHandsFree,
    recalibrate: startCalibration,
  };

})();
