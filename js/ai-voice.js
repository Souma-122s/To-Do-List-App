/**
 * Daylight AI - Voice Activation & Real-Time Speech Typing (like ChatGPT)
 * Supports universal speech-to-text typing across all browsers (Chrome, Edge, Safari, Brave, Firefox).
 * - Instant word-by-word streaming into the chatbox in real time as you speak.
 * - Live audio level meter visualizer (the dot physically pulses green when sound is detected).
 * - Automatically completes when you finish speaking (1.2s natural pause).
 * - Zero buttons needed to stop!
 */

const VOICE_ICONS = {
  speaker: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>',
  stop: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>'
};

let activeSpeakingBtn = null;

function stopSpeaking() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (activeSpeakingBtn) {
    activeSpeakingBtn.classList.remove("is-speaking");
    activeSpeakingBtn.innerHTML = VOICE_ICONS.speaker;
    activeSpeakingBtn.title = "Read aloud";
    activeSpeakingBtn = null;
  }
}

function toggleReadAloud(text, button, showToast = () => {}) {
  if (!("speechSynthesis" in window)) {
    showToast("Voice readout isn't supported in this browser.");
    return;
  }

  if (window.speechSynthesis.speaking && activeSpeakingBtn === button) {
    stopSpeaking();
    return;
  }

  stopSpeaking();

  const cleanSpeechText = text
    .replace(/[`*_#~>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

  if (!cleanSpeechText) return;

  const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const naturalVoice = voices.find((v) =>
    v.lang.startsWith("en") &&
    (v.name.includes("Natural") ||
      v.name.includes("Google") ||
      v.name.includes("Samantha") ||
      v.name.includes("Jenny"))
  );
  if (naturalVoice) utterance.voice = naturalVoice;

  utterance.onstart = () => {
    button.classList.add("is-speaking");
    button.innerHTML = VOICE_ICONS.stop;
    button.title = "Stop readout";
    activeSpeakingBtn = button;
  };

  utterance.onend = utterance.onerror = () => {
    button.classList.remove("is-speaking");
    button.innerHTML = VOICE_ICONS.speaker;
    button.title = "Read aloud";
    if (activeSpeakingBtn === button) activeSpeakingBtn = null;
  };

  window.speechSynthesis.speak(utterance);
}

// Downsample raw PCM Float32 buffers to 16,000 Hz
function downsampleBuffersTo16k(buffers, inputRate) {
  let totalLength = 0;
  for (let i = 0; i < buffers.length; i++) totalLength += buffers[i].length;
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (let i = 0; i < buffers.length; i++) {
    merged.set(buffers[i], offset);
    offset += buffers[i].length;
  }

  if (inputRate === 16000) return merged;

  const targetRate = 16000;
  const ratio = inputRate / targetRate;
  const targetLength = Math.round(totalLength / ratio);
  const result = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i++) {
    const srcIndex = i * ratio;
    const lower = Math.floor(srcIndex);
    const upper = Math.min(lower + 1, totalLength - 1);
    const weight = srcIndex - lower;
    result[i] = merged[lower] * (1 - weight) + merged[upper] * weight;
  }

  return result;
}

// Normalize low-volume audio (e.g. AirPods or Bluetooth headsets) to full, clear volume
function normalizeAudioGain(samples) {
  let maxPeak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxPeak) maxPeak = abs;
  }
  if (maxPeak > 0.0005) {
    const gain = Math.min(30.0, 0.85 / maxPeak);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.max(-1, Math.min(1, samples[i] * gain));
    }
  }
  return samples;
}

// Encode 16-bit Mono PCM WAV from Float32 samples
function encode16kMonoWav(samples) {
  const sampleRate = 16000;
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (16000 * 2)
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: "audio/wav" });
}

function initVoiceChat({ input, updateSendButtonState = () => {}, showToast = () => {}, getCsrfToken = () => "" } = {}) {
  const voiceBtn = document.querySelector("#ai-voice-btn");
  const voiceStatus = document.querySelector("#ai-voice-status");
  const voiceText = document.querySelector("#voice-status-text");

  if (!voiceBtn || !input) return;

  let isRecording = false;
  let activeEngine = null; // 'browser' | 'universal'
  let recognition = null;
  let mediaStream = null;
  let audioContext = null;
  let processorNode = null;
  let analyserNode = null;
  let pcmBuffers = [];
  let vadInterval = null;
  let silenceTimer = null;
  let speechDetected = false;
  let lastSpeechTimestamp = 0;
  let preVoiceText = "";

  // Live Audio Level Visualizer
  let liveAudioStream = null;
  let liveAudioCtx = null;
  let liveAnalyser = null;
  let liveVolumeInterval = null;

  const originalPlaceholder = input.getAttribute("placeholder") || "Ask Daylight anything or plan your tasks…";

  function resizeInput() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    updateSendButtonState();
  }

  function startLiveAudioMeter(stream) {
    stopLiveAudioMeter();
    liveAudioStream = stream;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx || !stream) return;
      liveAudioCtx = new AudioCtx();
      const source = liveAudioCtx.createMediaStreamSource(stream);
      liveAnalyser = liveAudioCtx.createAnalyser();
      liveAnalyser.fftSize = 128;
      source.connect(liveAnalyser);

      const data = new Uint8Array(liveAnalyser.frequencyBinCount);
      liveVolumeInterval = setInterval(() => {
        if (!isRecording) {
          stopLiveAudioMeter();
          return;
        }
        liveAnalyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const volume = sum / data.length;

        // Visual pulse feedback: dot scales and turns green when sound is detected!
        const dot = document.querySelector(".voice-status-dot");
        if (dot) {
          const scale = Math.min(2.0, 0.85 + (volume / 20));
          dot.style.transform = `scale(${scale})`;
          dot.style.backgroundColor = volume > 5 ? "#22c55e" : "#e04f67";
        }

        if (volume > 5 && voiceText && voiceText.textContent.startsWith("Listening")) {
          voiceText.textContent = "Hearing your voice... Speak now 🎙️";
        }
      }, 50);
    } catch (e) {
      console.warn("Audio meter setup skipped:", e);
    }
  }

  function stopLiveAudioMeter() {
    if (liveVolumeInterval) {
      clearInterval(liveVolumeInterval);
      liveVolumeInterval = null;
    }
    if (liveAudioCtx && liveAudioCtx.state !== "closed") {
      try { liveAudioCtx.close(); } catch {}
      liveAudioCtx = null;
    }
    if (liveAudioStream) {
      liveAudioStream.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
      liveAudioStream = null;
    }
    liveAnalyser = null;
    const dot = document.querySelector(".voice-status-dot");
    if (dot) {
      dot.style.transform = "";
      dot.style.backgroundColor = "";
    }
  }

  // Typewriter effect to insert text smoothly into the chatbox
  function typeTextIntoInput(textToType) {
    if (!textToType) return;
    const baseText = preVoiceText;
    let index = 0;
    const speed = Math.max(10, Math.min(25, Math.floor(400 / textToType.length)));

    const typingTimer = setInterval(() => {
      index++;
      input.value = baseText + textToType.slice(0, index);
      resizeInput();
      if (index >= textToType.length) {
        clearInterval(typingTimer);
        input.focus();
        updateSendButtonState();
      }
    }, speed);
  }

  function cleanupVAD() {
    if (vadInterval) {
      clearInterval(vadInterval);
      vadInterval = null;
    }
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function cleanupAudioContext() {
    cleanupVAD();
    stopLiveAudioMeter();
    if (processorNode) {
      try { processorNode.disconnect(); } catch {}
      processorNode = null;
    }
    if (analyserNode) {
      try { analyserNode.disconnect(); } catch {}
      analyserNode = null;
    }
    if (audioContext && audioContext.state !== "closed") {
      try { audioContext.close(); } catch {}
      audioContext = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
      mediaStream = null;
    }
  }

  function resetVoiceUI() {
    isRecording = false;
    stopLiveAudioMeter();
    voiceBtn.classList.remove("is-recording");
    voiceBtn.setAttribute("aria-label", "Start voice typing");
    voiceBtn.title = "Voice typing (Speak to Daylight)";
    if (voiceStatus) voiceStatus.hidden = true;
    input.setAttribute("placeholder", originalPlaceholder);
    updateSendButtonState();
  }

  // --- Browser Native Speech Recognition (Real-Time Live Typing like ChatGPT) ---
  async function startBrowserRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      startUniversalMicrophone();
      return;
    }

    // Explicitly request microphone access first so Chrome triggers the permission prompt
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startLiveAudioMeter(stream);
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        showToast("Microphone permission was not allowed. Click the tune/lock icon in your browser address bar to allow mic access!");
        return;
      }
    }

    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";
      recognition.maxAlternatives = 1;
    } catch {
      startUniversalMicrophone();
      return;
    }

    activeEngine = "browser";
    isRecording = true;
    preVoiceText = input.value.trim();
    if (preVoiceText && !preVoiceText.endsWith(" ")) preVoiceText += " ";

    voiceBtn.classList.add("is-recording");
    voiceBtn.setAttribute("aria-label", "Listening... Speak now");
    voiceBtn.title = "Listening... Typing live as you speak";
    if (voiceStatus) {
      voiceStatus.hidden = false;
      if (voiceText) voiceText.textContent = "Listening... Speak now 🎙️";
    }
    input.setAttribute("placeholder", "Listening... typing live as you speak");

    let finalTranscript = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? " " : "") + item.trim();
        } else {
          interim += item;
        }
      }

      // Live real-time typing into the chatbox as you speak (identical to ChatGPT)
      const spoken = (finalTranscript + (interim ? " " + interim : "")).trim();
      if (spoken) {
        input.value = preVoiceText + spoken;
        resizeInput();
        if (voiceText) voiceText.textContent = `“${spoken.slice(-35)}”`;

        // Automatically finish when you pause for 1.2s (no button tapping required!)
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          stopBrowserRecognition();
        }, 1200);
      }
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      if (event.error === "no-speech") {
        return; // Keep waiting for speech
      }
      if (event.error === "network") {
        try { recognition.stop(); } catch {}
        recognition = null;
        isRecording = false;
        stopLiveAudioMeter();
        startUniversalMicrophone();
        return;
      }
      if (event.error === "not-allowed" || event.error === "permission-denied") {
        resetVoiceUI();
        showToast("Microphone permission was denied. Click the lock/tune icon in your address bar to allow mic access.");
        return;
      }
      resetVoiceUI();
      startUniversalMicrophone();
    };

    recognition.onend = () => {
      if (isRecording && activeEngine === "browser") {
        if (finalTranscript.trim()) {
          resetVoiceUI();
          input.focus();
        } else {
          // Restart recognition so it keeps listening and does not drop out
          try {
            recognition.start();
          } catch {
            resetVoiceUI();
          }
        }
      }
    };

    try {
      recognition.start();
    } catch {
      startUniversalMicrophone();
    }
  }

  function stopBrowserRecognition() {
    if (!isRecording) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    try { recognition?.stop(); } catch {}
    resetVoiceUI();
    input.focus();
  }

  // --- Universal 16kHz PCM WAV Microphone Pipeline (Fallback) ---
  async function startUniversalMicrophone() {
    pcmBuffers = [];
    speechDetected = false;
    lastSpeechTimestamp = 0;
    cleanupAudioContext();

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      startLiveAudioMeter(mediaStream);
    } catch (err) {
      resetVoiceUI();
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        showToast("Microphone permission was blocked. Please allow mic access in your browser address bar.");
      } else {
        showToast("Microphone unavailable: " + err.message);
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      resetVoiceUI();
      showToast("Web Audio is not supported in this browser.");
      return;
    }

    try {
      audioContext = new AudioCtx();
    } catch (e) {
      resetVoiceUI();
      showToast("Could not start audio context: " + e.message);
      return;
    }

    activeEngine = "universal";
    isRecording = true;
    preVoiceText = input.value.trim();
    if (preVoiceText && !preVoiceText.endsWith(" ")) preVoiceText += " ";

    voiceBtn.classList.add("is-recording");
    voiceBtn.setAttribute("aria-label", "Listening... Speak now");
    voiceBtn.title = "Listening... Speak now";
    if (voiceStatus) {
      voiceStatus.hidden = false;
      if (voiceText) voiceText.textContent = "Listening... Speak now 🎙️";
    }
    input.setAttribute("placeholder", "Listening to your voice... speak now");

    const source = audioContext.createMediaStreamSource(mediaStream);
    const nativeSampleRate = audioContext.sampleRate;

    // Analyzer for Voice Activity Detection
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    source.connect(analyserNode);

    // Audio processor to capture raw uncompressed PCM
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    processorNode.onaudioprocess = (e) => {
      if (!isRecording) return;
      const channelData = e.inputBuffer.getChannelData(0);
      pcmBuffers.push(new Float32Array(channelData));
    };

    source.connect(processorNode);
    processorNode.connect(audioContext.destination);

    // Real-time Voice Activity Detection (VAD)
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const startTime = Date.now();
    let minNoise = 4;

    vadInterval = setInterval(() => {
      if (!isRecording) {
        cleanupVAD();
        return;
      }

      analyserNode.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const avg = sum / bufferLength;

      if (avg < minNoise) minNoise = avg;
      const speechThreshold = Math.max(minNoise + 1.2, 2.5);

      if (avg > speechThreshold) {
        speechDetected = true;
        lastSpeechTimestamp = Date.now();
        if (voiceText) voiceText.textContent = "Hearing your voice... 🎙️";
      } else if (speechDetected) {
        // Automatically finish when the user finishes speaking (1.3s silence)
        const silenceDuration = Date.now() - lastSpeechTimestamp;
        if (silenceDuration >= 1300) {
          cleanupVAD();
          stopUniversalMicrophone();
        }
      }

      // Safety timeout after 12 seconds
      const elapsed = Date.now() - startTime;
      if (elapsed > 12000) {
        cleanupVAD();
        stopUniversalMicrophone();
      }
    }, 60);
  }

  async function stopUniversalMicrophone() {
    if (!isRecording) return;
    isRecording = false;
    cleanupVAD();

    const sampleRate = audioContext?.sampleRate || 44100;
    const capturedBuffers = [...pcmBuffers];
    cleanupAudioContext();

    if (capturedBuffers.length === 0) {
      resetVoiceUI();
      return;
    }

    if (voiceText) voiceText.textContent = "Transcribing prompt...";

    try {
      const downsampledPCM = downsampleBuffersTo16k(capturedBuffers, sampleRate);
      if (downsampledPCM.length < 6000) {
        resetVoiceUI();
        showToast("Audio was too short. Speak your prompt.");
        return;
      }

      // Normalize gain: amplifies low-volume microphones/AirPods up to 30x!
      const boostedPCM = normalizeAudioGain(downsampledPCM);
      const wavBlob = encode16kMonoWav(boostedPCM);
      const reader = new FileReader();

      reader.onloadend = async () => {
        try {
          const base64Audio = reader.result;
          const csrf = getCsrfToken();
          const response = await fetch("/api/ai/transcribe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(csrf ? { "X-CSRF-Token": csrf } : {})
            },
            credentials: "same-origin",
            body: JSON.stringify({ audio: base64Audio, mimeType: "audio/wav" })
          });

          if (!response.ok) {
            let errData = {};
            try { errData = await response.json(); } catch {}
            throw new Error(errData.error || `HTTP ${response.status}`);
          }

          const data = await response.json();
          if (data.text) {
            typeTextIntoInput(data.text);
            if (voiceText) voiceText.textContent = "Prompt ready!";
            setTimeout(() => {
              if (voiceStatus) voiceStatus.hidden = true;
            }, 800);
          } else {
            showToast("No voice was detected. Please check your mic in settings.");
            if (voiceStatus) voiceStatus.hidden = true;
          }
        } catch (err) {
          showToast("Voice transcription: " + err.message);
          if (voiceStatus) voiceStatus.hidden = true;
        } finally {
          resetVoiceUI();
          input.focus();
        }
      };

      reader.readAsDataURL(wavBlob);
    } catch (e) {
      console.error("WAV processing error:", e);
      resetVoiceUI();
    }
  }

  // Mic Button Click Toggle
  function handleVoiceClick(e) {
    e.preventDefault();
    if (isRecording) {
      if (activeEngine === "universal") {
        stopUniversalMicrophone();
      } else {
        stopBrowserRecognition();
      }
    } else {
      startBrowserRecognition();
    }
  }

  voiceBtn.addEventListener("click", handleVoiceClick);
}

window.DaylightVoice = {
  VOICE_ICONS,
  toggleReadAloud,
  stopSpeaking,
  initVoiceChat
};
