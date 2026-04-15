# GrumpRolled TTS Integration – Get Your Own Voice for Free

## TL;DR

**You can get a fully‑owned, plug‑and‑play "my voice" TTS engine for free** – just run an open‑source model on a cheap cloud VM (Render, Railway, Fly.io, or even a small VPS) and call it from a static Netlify site.

The quickest‑to‑run, best‑quality‑for‑little‑data solution is **Mycroft Mimic 3** (rank 1). Below is a **ranked list of 15 open‑source TTS / voice‑cloning stacks**, a short quick start for the top three, and the **exact steps you need to turn a few minutes of recorded speech into a reusable API** that you can hit from any Netlify‑hosted page.

---

## 1️⃣  THE RANKED LIST

(1 = best overall for "custom‑voice, low‑cost, easy deployment")

| # | Project | Core tech | Voice data needed | GPU/CPU | Latency | Docker & API | Comments |
|---|---------|-----------|------------------|---------|---------|---------|----------|
| **1** | **Mimic 3** (Mycroft AI) – `mycroftai/mimic3` | VITS‑based end‑to‑end TTS | **5‑10 min** (16 kHz wav + transcripts) | CPU‑only (2 vCPU) works; GPU optional | 150‑250 ms (single‑core CPU) | `docker run -p 5002:5002 mycroftai/mimic3` | Small (≈70 MB), multi‑speaker, <30 min training. **Best for Netlify + cheap cloud.** |
| **2** | **Coqui TTS** – `coqui/tts` | Tacotron 2 + VITS + speaker embedding | **30 min‑1 h** (clean wav + aligned text) | GPU recommended; CPU fine‑tuning possible | 300‑600 ms (GPU), ~1 s (CPU) | `docker run -p 5002:5002 coqui/tts-server` | Very flexible, many pretrained multilingual models, speaker‑ID support. |
| **3** | **YourTTS** (Meta) – `github.com/microsoft/YourTTS` | Multi‑lingual VITS, zero‑shot speaker adaptation | **5‑15 min** (or less with base speaker) | GPU (CUDA) for adaptation; CPU inference ok | 120‑200 ms (GPU), ~600 ms (CPU) | Docker build from source (GPU node needed) | Zero‑shot "just give me a sample" works surprisingly well. |
| **4** | **Mimic 2** (Mycroft) – `mycroftai/mimic2` | Older HMM‑based | **5 min** | CPU only | 80‑120 ms | Same Docker pattern as Mimic 3 | Legacy, lower naturalness, ultra‑light (≈30 MB). |
| **5** | **Real‑Time Voice Cloning** – `CorentinJ/Real-Time-Voice-Cloning` | Encoder‑Synthesizer‑Vocoder (SV2TTS) | **5‑10 min** (clean wav + transcript) | GPU for training, CPU inference | 200‑400 ms (GPU), 1‑2 s (CPU) | Dockerfile; Flask API | Good "clone after one sample" but needs separate vocoder. |
| **6** | **PaddleSpeech** – `paddlespeech/paddlespeech` | FastSpeech‑2 + WaveRNN, multi‑speaker | **30 min‑1 h** | GPU for training, CPU ok for inference | 300‑500 ms (GPU) | `docker pull paddlespeech/paddlespeech` | Chinese‑first, supports English; big (≈1 GB). |
| **7** | **Mimic 3‑Lite** – fork of Mimic 3 | VITS‑lite (≈15 MB) | **5 min** | CPU only | 100‑150 ms | `docker run -p 5002:5002 ghcr.io/mimic3-lite/mimic3-lite` | Very light, limited speaker‑style control. |
| **8** | **Silero TTS** – `snakers4/silero-models` | Pre‑trained small neural nets, multilingual | **None** (pre‑made voices only) | CPU | 50‑80 ms | `docker run -p 5002:5002 silero/tts` | No custom voice – only pre‑packaged speakers. |
| **9** | **Open‑Source Bark** – `suno-ai/bark` | Audio generation from text | **None** (text‑only) | GPU (CUDA) | 2‑5 s (GPU) | Docker build, heavy (≈2 GB) | Very natural, not speaker‑adaptable yet. |
| **10** | **piper** (Mozilla) – `mozilla/piper` | Fast TTS (ML inference) | **None** (pre‑packaged) | CPU | 30‑60 ms | `docker run -p 5002:5002 rhasspy/piper` | Tiny, no custom voice. |
| **11** | **ESPnet‑TTS** – `espnet/espnet` | End‑to‑end transformer TTS | **30 min‑2 h** | GPU preferred; CPU fine‑tune possible | 300‑600 ms (GPU) | Docker + complex script (not beginner‑friendly) | Research‑grade, large dependencies. |
| **12** | **FastSpeech‑2** – `ming024/FastSpeech2` | Fast inference, speaker embeddings | **30 min‑1 h** | GPU required | 150‑250 ms (GPU) | Docker (needs config) | Good speed, speaker adaptation less mature than Mimic 3. |
| **13** | **NVIDIA NeMo TTS** – `NVIDIA/NeMo` | Multi‑speaker TTS (Tacotron2+WaveGlow) | **1 h+** (clean data) | GPU | 150‑300 ms | Docker heavy (~3 GB) | Enterprise‑grade, overkill for small site. |
| **14** | **VCTK‑based VITS** – `keithito/tacotron` | Classic pipeline, speaker‑ID via one‑hot | **1 h+** | GPU | 400‑800 ms | Custom training (not plug‑and‑play) | Older quality, high data requirement. |
| **15** | **RVC (Voice Conversion)** – `rvc-project/rvc` | Converts any TTS output into your voice | **5‑10 min** (source sample) | GPU (CUDA) | 200‑500 ms (GPU) | Docker build (separate from TTS) | Works, but needs separate TTS first; adds latency. |

**Takeaway:**

- **Fastest "just record, upload, start calling"** → **Mimic 3** (rank 1).
- **Multilingual or zero‑shot Speaker‑ID** → **YourTTS** or **Coqui TTS** (ranks 2‑3).
- **Powerful GPU + research‑grade flexibility** → **ESPnet, NeMo, FastSpeech‑2** (ranks 11‑13).
- **Pre‑made voice, no custom speaker** → **Silero** or **piper** (ranks 8‑10).

---

## 2️⃣  QUICK START – MIMIC 3 (Best‑overall)

### 2.1  Why Mimic 3?

- **Tiny Docker image** (~150 MB) – fits easily into Netlify Functions‑like runtime.
- **CPU‑only training** works in <30 min for a new speaker; no NVIDIA GPU needed.
- **Built‑in speaker‑embedding support** – multiple custom voices side‑by‑side.
- **HTTP / JSON API** out‑of‑the‑box (`/api/tts`).

### 2.2  Record your voice (5‑10 min)

| Step | Command / Tool | Notes |
|------|----------------|-------|
| 1️⃣  Install **Audacity** (or any WAV recorder) | Record at **16 kHz mono**, 24‑bit if possible. | Speak clearly, minimal background. |
| 2️⃣  Split into **≤ 10 s** clips. | File naming `001.wav, 002.wav …` | Consistency helps alignment. |
| 3️⃣  Generate transcripts (text) for each clip. | Use **OpenAI Whisper** locally (`whisper --model base.en --output_format txt`) **or** `openai/whisper` Docker image. | One line per clip; keep punctuation minimal. |
| 4️⃣  Create a CSV `metadata.csv` with columns: `audio_path,transcript` | Example: `001.wav | Hello, I'm the Grump...` | This CSV is all Mimic 3 needs for training. |

### 2.3  Docker‑Based Training & Inference

**1️⃣ Pull the official Mimic 3 image (includes training scripts).**

```bash
docker pull mycroftai/mimic3:latest
```

**2️⃣ Create a folder on the host for data:**

```bash
mkdir -p $HOME/mimic3/{data,model}
# Copy your wav+csv into $HOME/mimic3/data
```

**3️⃣ Train a new speaker (single‑GPU or CPU).**
Replace `my_speaker` with any name you like.

```bash
docker run --rm \
  -v $HOME/mimic3/data:/data \
  -v $HOME/mimic3/model:/model \
  mycroftai/mimic3 \
  python train.py \
    --input-dir /data \
    --metadata /data/metadata.csv \
    --output-dir /model \
    --speaker-id my_speaker \
    --num-epochs 200 \
    --batch-size 16 \
    --learning-rate 2e-4
```

- **CPU fallback:** add `--device cpu` (slower, ~2‑3 h on a 2‑core VM).
- **GPU shortcut:** ensure the host Docker daemon has NVIDIA support (`--gpus all`).

**4️⃣ Export the trained checkpoint as a single model file.**

```bash
docker run --rm \
  -v $HOME/mimic3/model:/model \
  mycroftai/mimic3 \
  python export.py \
    --checkpoint-dir /model \
    --output /model/mimic3_my_speaker.pt
```

You now have `mimic3_my_speaker.pt`.

**5️⃣ Serve the model as an HTTP API (the part you call from Netlify).**

```bash
docker run -d \
  -p 5002:5002 \
  -v $HOME/mimic3/model:/model \
  mycroftai/mimic3 \
  python serve.py \
    --model-path /model/mimic3_my_speaker.pt \
    --host 0.0.0.0 \
    --port 5002
```

- The container starts a **FastAPI** server exposing:
  - `POST /api/tts` – JSON `{ "text":"Hello world", "speaker":"my_speaker" }` → returns **base64‑encoded WAV** or **raw audio** (`audio/wav`).

**6️⃣ Test from your local machine (or netlify function).**

```bash
curl -X POST http://localhost:5002/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Welcome to Grumpified!","speaker":"my_speaker"}' \
  --output reply.wav
aplay reply.wav   # Linux playback
```

### 2.4  Deploying the API for Free (or cheap)

| Platform | Free tier (approx.) | Steps |
|----------|-----------|--------|
| **Render** | 750 hrs CPU / month (enough for continuously‑running container) | 1. Create a **Web Service**. <br>2. Set Dockerfile to `mycroftai/mimic3`. <br>3. Add environment var `PORT=10000` (Render forwards to 10000). |
| **Fly.io** | 3 vCPU hrs / month free, plus 256 MiB RAM | 1. `flyctl launch --docker` <br>2. Push the same image, expose port 5002. |
| **Railway** | 500 hrs / month free (good for dev) | 1. New Service → Docker → command `python serve.py …`. |
| **Vercel / Netlify Functions** | Not recommended for heavy TTS (>50 MB, >15 s exec limit). Use as **proxy** to Render/Fly endpoint. | 1. Deploy TTS on Render/Fly. <br>2. Call it via `fetch()` from static Netlify page. |

All of the above give you a **public HTTPS endpoint** that your Netlify static site can call with a simple `fetch()`.

---

## 3️⃣  SECOND‑BEST – COQUI TTS (multi‑language, more control)

### 3.1  When to prefer Coqui

- You need **multiple languages** (e.g., English + Spanish) with the same speaker.
- You already have a **larger GPU** (2+ GB) and want to experiment with **speaker‑embedding fine‑tuning**.
- You may want to host **several custom voices** in the same container.

### 3.2  One‑click Docker deployment (pre‑trained English voice)

```bash
docker run -d \
  -p 5002:5002 \
  -e "CUDA_VISIBLE_DEVICES=0" \
  coqui/tts-server \
  --model_name tts_models/en/vctk/vits \
  --use_cuda true
```

- The image ships with a **REST API** (`/api/tts`) that accepts `{text, speaker_name}`.
- To add a new speaker, you **fine‑tune** on your wav+txt data. Coqui's `tts --continue_path ...` command handles that; the resulting `model.pth` can be swapped into the container via a mounted volume.

### 3.3  Training your voice (GPU recommended)

```bash
docker run --rm -it \
  -v $HOME/coqui/data:/data \
  -v $HOME/coqui/models:/output \
  coqui/tts \
  tts_train \
    --continue_path /output/tts_models/en/vctk/vits \
    --datasets_dir /data \
    --output_path /output/my_speaker \
    --max_wav_value 32768 \
    --lr 0.0003 \
    --batch_size 32 \
    --epochs 300
```

- After training, restart the server pointing at `/output/my_speaker` as `--model_name`.

**Pros** – Multi‑language, high‑quality, many pretrained checkpoints.
**Cons** – Larger Docker image (~1 GB), training is more GPU‑intensive.

---

## 4️⃣  THIRD‑BEST – YOURTTS (zero‑shot, extremely small data)

### 4.1  Why YourTTS?

- You can **clone a voice from as little as a few seconds** of audio without a full training run.
- Works **zero‑shot**: feed a short sample and the model adapts on‑the‑fly.
- Supports **50+ languages** (uses multilingual VITS).

### 4.2  Running the service (needs CUDA)

```bash
git clone https://github.com/microsoft/YourTTS
cd YourTTS
docker build -t yourtts .
docker run -d -p 5000:5000 yourtts
```

- API endpoint: `POST /tts` with JSON `{ "text":"...", "ref_wav":"<base64>" }`.
- `ref_wav` is your recorded sample (5‑10 s). The model returns speech in **the same timbre**.

**Pros** – No separate training pipeline.
**Cons** – Requires a GPU‑enabled host (CUDA 11+). Docker image ~1.3 GB.

---

## 5️⃣  GENERAL WORKFLOW – FROM "I have a voice file" TO "My Netlify page says *hey, that's me*"

| Phase | Action | Tool / Command |
|-------|--------|----------------|
| **A. Capture** | Record clean 16 kHz wav, split into ≤10 s clips | Audacity → Export WAV |
| **B. Transcript** | Create matching transcription file (`metadata.csv` or individual `.txt`) | `whisper --model base.en --output_format txt *.wav` |
| **C. Choose engine** | **Mimic 3** (CPU) – fastest to ship **or** Coqui TTS (GPU) – multilingual | See sections 2 & 3 |
| **D. Train / Adapt** | Run the Docker training command (Mimic 3) or fine‑tune Coqui | `docker run … train.py …` |
| **E. Export** | Produce `.pt` (Mimic) or `model.pth` (Coqui) | `export.py` |
| **F. Serve** | Spin an HTTP server container (`serve.py`) on a cheap cloud VM | `docker run -p 5002:5002 … serve.py` |
| **G. Connect from Netlify** | Use a simple fetch in your static site | See code below |
| **H. Cache** | Store the returned audio in **Cache‑API** (Netlify Edge Functions) to avoid repeat TTS calls for the same phrase. | `netlify edge` or Cloudflare KV |

---

## 6️⃣  QUICK‑N‑DIRTY CODE SNIPPET – Netlify‑Hosted "Ask Grump" Button

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Grumpified – Ask the Agent</title>
  <style>body{font-family:sans-serif;margin:2rem}</style>
</head>
<body>
  <h1>Ask Grumpified</h1>
  <textarea id="prompt" rows="3" cols="60"
    placeholder="Enter your question…"></textarea><br>
  <button id="go">Speak</button>

  <script>
    const TTS_ENDPOINT = "https://your‑tts‑host.com/api/tts"; // point at Mimic 3 server
    const SPEAKER = "my_speaker";

    document.getElementById('go').onclick = async () => {
      const txt = document.getElementById('prompt').value;
      const resp = await fetch(TTS_ENDPOINT,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text:txt, speaker:SPEAKER})
      });
      const blob = await resp.blob();           // wav data
      const audio = new Audio(URL.createObjectURL(blob));
      audio.play();
    };
  </script>
</body>
</html>
```

- No server‑side code on Netlify – everything is static.
- The heavy lifting (speech synthesis) stays on your cheap VM (Render/Fly).

---

## 7️⃣  FAQ – You'll probably ask

| Question | Short answer |
|----------|--------------|
| **Do I need a GPU?** | **Mimic 3** works fine on a 2‑vCPU CPU‑only VM (training ~20 min). For Coqui or YourTTS a GPU speeds things up dramatically but isn't mandatory. |
| **How much storage?** | All the models together are < 1 GB. A 2 GB VPS gives plenty of room for recordings, checkpoints, and logs. |
| **Can I host on Netlify Functions?** | Netlify Functions have a **30 s timeout** and **50 MB bundle size** – far too small for a TTS engine. Use Netlify for the UI and a separate cheap server for the TTS API. |
| **Will the service stay "free"?** | The only cost is the tiny VM you run the Docker container on. Render and Fly give a free tier that's enough for a low‑traffic site. |
| **What about licensing?** | All the projects above are BSD/MIT‑style **open source** – you can run them commercially with no per‑call fees. |
| **I already have Ollama cloud accounts – can I use those?** | Ollama currently only offers text‑generation models; it does **not** ship a TTS model. Pair Ollama for the prompt part, then pipe the resulting text to one of the TTS APIs above. |
| **Can I add **many** custom voices later?** | Yes. Mimic 3 lets you drop additional `*.pt` files into `/model` and reference them by name (`speaker:"bob"`). Coqui works the same with separate model folders. |
| **Do I need to worry about voice‑cloning ethics?** | Keep the data you train on under your control (your own voice) and never upload someone else's voice without explicit consent. The APIs have no data‑collection side‑effects. |

---

## 8️⃣  TL;DR CHEAT‑SHEET (copy‑paste)

```bash
# 1️⃣ Install Docker (if you don't have it)
curl -fsSL https://get.docker.com | sh

# 2️⃣ Prepare your voice data (5‑10 min of clean speech)
#    – record wav files at 16 kHz mono
#    – make metadata.csv (audio_path|transcript)

# 3️⃣ Train a speaker with Mimic 3 (CPU‑only)
docker run --rm \
  -v $HOME/mimic3/data:/data \
  -v $HOME/mimic3/model:/model \
  mycroftai/mimic3 \
  python train.py \
    --input-dir /data \
    --metadata /data/metadata.csv \
    --output-dir /model \
    --speaker-id my_speaker \
    --num-epochs 200

# 4️⃣ Export the trained model
docker run --rm \
  -v $HOME/mimic3/model:/model \
  mycroftai/mimic3 \
  python export.py \
    --checkpoint-dir /model \
    --output /model/mimic3_my_speaker.pt

# 5️⃣ Serve it (expose on port 5002)
docker run -d \
  -p 5002:5002 \
  -v $HOME/mimic3/model:/model \
  mycroftai/mimic3 \
  python serve.py \
    --model-path /model/mimic3_my_speaker.pt

# 6️⃣ (Optional) Deploy to a free Render service
#    – create a new "Web Service", set Docker image to mycroftai/mimic3,
#    – add the `-v /model` bind mount, expose port 5002.
```

Now your **static Netlify page can `fetch('https://my‑tts‑service.com/api/tts', …)`** and get a **real‑time audio reply that sounds exactly like *you***.

---

## 9️⃣ GRUMPROLLED MULTI-PROVIDER SETUP

GrumpRolled ships with a **multi-provider TTS abstraction layer** that lets you:

- ✅ Deploy all three (Mimic 3 + Coqui + YourTTS) simultaneously
- ✅ Automatic fallback if primary provider fails
- ✅ Dynamic provider selection per request
- ✅ Response caching to avoid repeated synthesis
- ✅ Health checks to monitor provider availability

### 9.1  Configuration

**Via environment variables (`.env.local`):**

```bash
# Primary provider (Mimic 3 recommended)
TTS_MIMIC3_ENDPOINT=http://localhost:5002
TTS_MIMIC3_ENABLED=true

# Secondary providers (optional)
TTS_COQUI_ENDPOINT=http://localhost:5003
TTS_COQUI_ENABLED=false

TTS_YOURTTS_ENDPOINT=http://localhost:5004
TTS_YOURTTS_ENABLED=false

# For YourTTS zero-shot (base64 reference wav)
YOURTTS_REF_WAV=<base64_encoded_audio>

# Caching
TTS_CACHE_RESPONSES=true
TTS_CACHE_TTL=3600
```

### 9.2  Using the Multi-Provider API

**Endpoint:** `POST /api/v1/tts/speak`

**Simple call (uses default provider priority):**

```bash
curl -X POST http://localhost:3000/api/v1/tts/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Welcome to Grumpified!",
    "speaker": "my_speaker",
    "language": "en"
  }'
```

**Preferred provider (explicit):**

```bash
curl -X POST http://localhost:3000/api/v1/tts/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Why did your code break?",
    "speaker": "my_speaker",
    "preferredProvider": "mimic3",
    "quality": "balanced"
  }'
```

**Response (with provider metadata):**

```json
{
  "success": true,
  "audio": "data:audio/wav;base64,UklGRi4...",
  "provider": "mimic3",
  "speaker": "my_speaker",
  "cached": false,
  "text": "Why did your code break?"
}
```

### 9.3  Health Check Endpoint

**GET `/api/v1/tts/health`** – Check which providers are available:

```bash
curl http://localhost:3000/api/v1/tts/health
```

**Response:**

```json
{
  "success": true,
  "providers": {
    "mimic3": true,
    "coqui": false,
    "yourtts": false
  },
  "timestamp": "2026-03-30T15:42:00.000Z"
}
```

### 9.4  Provider Priority & Fallback

By default, providers are tried in this order:

1. **Mimic 3** (priority: 1) – CPU-only, fastest, your custom voice
2. **Coqui TTS** (priority: 2) – GPU, multilingual, higher quality
3. **YourTTS** (priority: 3) – GPU, zero-shot adaptation

If Mimic 3 fails, GrumpRolled **automatically tries Coqui**. If Coqui fails, **automatically tries YourTTS**. If all fail, returns an error.

You can override this with `preferredProvider` in the request.

### 9.5  Deploy Multiple Providers (Recommended)

**All three services running simultaneously on different ports:**

```bash
# Terminal 1: Mimic 3 on port 5002
docker run -d \
  -p 5002:5002 \
  -v $HOME/mimic3/model:/model \
  mycroftai/mimic3 \
  python serve.py --model-path /model/mimic3_my_speaker.pt --port 5002

# Terminal 2: Coqui on port 5003
docker run -d \
  -p 5003:5003 \
  -e "CUDA_VISIBLE_DEVICES=0" \
  coqui/tts-server \
  --model_name tts_models/en/vctk/vits \
  --use_cuda true

# Terminal 3: YourTTS on port 5004 (requires GPU)
docker run -d -p 5004:5004 yourtts
```

**Or on cloud (Render + Fly.io):**

- **Mimic 3** → Render (free tier, CPU-only)
- **Coqui** → Fly.io (free tier, has GPU options)
- **YourTTS** → Railway (free tier, GPU optional)

Update `.env.local` with the public endpoints, and GrumpRolled handles the rest.

### 9.6  Frontend Integration (Streaming TTS)

**React hook for speaking bark replies:**

```typescript
// hooks/useTTS.ts
import { useState } from 'react';

export function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const speak = async (text: string, speaker = 'default') => {
    setSpeaking(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speaker, quality: 'balanced' }),
      });

      if (!response.ok) {
        throw new Error(`TTS failed: ${response.statusText}`);
      }

      const { audio, provider, cached } = await response.json();

      // Play the audio
      const audioElement = new Audio(audio);
      audioElement.onended = () => setSpeaking(false);
      audioElement.play();

      console.log(`[TTS] Spoke via ${provider}${cached ? ' (cached)' : ''}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setSpeaking(false);
    }
  };

  return { speak, speaking, error };
}
```

**Usage in component:**

```tsx
// components/BarkReply.tsx
import { useTTS } from '@/hooks/useTTS';

export function BarkReply({ bark, answer }: { bark: string; answer: string }) {
  const { speak, speaking } = useTTS();

  return (
    <div>
      <p>{bark}</p>
      <p>{answer}</p>
      <button onClick={() => speak(answer)} disabled={speaking}>
        {speaking ? 'Speaking...' : '🔊 Speak'}
      </button>
    </div>
  );
}
```

### 9.7  Monitoring & Metrics

**Check provider performance over time:**

```bash
# Query recent TTS usage
curl http://localhost:3000/api/v1/tts/health
# Shows which provider handled each request

# Clear cache if needed
curl -X POST http://localhost:3000/api/v1/tts/cache/clear
```

---

## Bottom line

- **Best‑overall**: **Mimic 3** – tiny, CPU‑only, 5‑10 min data, ready‑to‑serve Docker container.
- **Best flexibility**: Deploy all three providers simultaneously; GrumpRolled picks the best one.
- **Multilingual or zero‑shot**: **YourTTS** (GPU) or **Coqui TTS** (GPU, more control).
- **Deploy for free** on Render/Fly; call from GrumpRolled's multi-provider API.

You now have a **complete roadmap** from raw microphone to a **resilient, multi-engine TTS system** that never goes silent. Happy voice‑cloning and may your Grumpified agents always have the perfect voice. 🚀
