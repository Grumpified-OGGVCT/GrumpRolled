# GrumpRolled TTS Multi-Provider Deployment Guide

## Overview

This guide walks you through deploying **all three TTS providers** (Mimic 3, Coqui, YourTTS) simultaneously so GrumpRolled can leverage the best option for each request with automatic fallback.

## Architecture

```
GrumpRolled (Next.js)
    ↓
  /api/v1/tts/speak (multi-provider endpoint)
    ↓
  [Mimic 3 health? NO → try Coqui]
  [Coqui health? NO → try YourTTS]
  [YourTTS health? NO → error]
    ↓
  Return audio + provider metadata
```

---

## Option 1: Local Docker Compose (Development)

### 1.1  Create `docker-compose.tts.yml`

```yaml
version: '3.9'

services:
  # Mimic 3 (Rank 1 – CPU-only, fastest)
  mimic3:
    image: mycroftai/mimic3:latest
    container_name: grumprolled-mimic3
    ports:
      - "5002:5002"
    volumes:
      - ./tts-models/mimic3:/model
    command: python serve.py --model-path /model/mimic3_my_speaker.pt --host 0.0.0.0 --port 5002
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5002/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  # Coqui TTS (Rank 2 – GPU optional, multilingual)
  coqui:
    image: coqui/tts-server:latest
    container_name: grumprolled-coqui
    ports:
      - "5003:5003"
    environment:
      - CUDA_VISIBLE_DEVICES=0  # Set to empty string if no GPU
    command: tts_server --model_name tts_models/en/vctk/vits --port 5003 --use_cuda false
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5003/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    # Uncomment if you have a GPU
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]

  # YourTTS (Rank 3 – GPU, zero-shot adaptation)
  yourtts:
    image: yourtts:latest  # Assumes you built locally
    container_name: grumprolled-yourtts
    ports:
      - "5004:5004"
    environment:
      - CUDA_VISIBLE_DEVICES=0
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5004/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    # Uncomment if you have a GPU
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]

networks:
  default:
    name: grumprolled-tts
```

### 1.2  Start all providers

```bash
docker-compose -f docker-compose.tts.yml up -d

# Verify all are healthy
docker-compose -f docker-compose.tts.yml ps
```

### 1.3  Update `.env.local`

```bash
# All providers enabled locally
TTS_MIMIC3_ENDPOINT=http://localhost:5002
TTS_MIMIC3_ENABLED=true

TTS_COQUI_ENDPOINT=http://localhost:5003
TTS_COQUI_ENABLED=true

TTS_YOURTTS_ENDPOINT=http://localhost:5004
TTS_YOURTTS_ENABLED=true

# Cache settings
TTS_CACHE_RESPONSES=true
TTS_CACHE_TTL=3600
```

### 1.4  Test

```bash
# Check health
curl http://localhost:3000/api/v1/tts/health

# Synthesize (tries Mimic 3 first, falls back on failure)
curl -X POST http://localhost:3000/api/v1/tts/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Why is your code like a haunted house?","speaker":"my_speaker"}'
```

---

## Option 2: Cloud Deployment (Production)

### Strategy: Distribute providers across cheap cloud VMs

| Provider | Recommended Host | Free Tier | Why | Setup Time |
|----------|-----------------|-----------|-----|----------|
| **Mimic 3** | Render | 750 hrs CPU/mo | CPU-only, no GPU needed | 5 min |
| **Coqui TTS** | Fly.io | 3 vCPU hrs + 256 MB RAM free | GPU available (optional) | 10 min |
| **YourTTS** | Railway | 500 hrs/mo free | GPU optional | 15 min |

### 2.1  Deploy Mimic 3 on Render

**1. Create a `Dockerfile.mimic3` in repo root:**

```dockerfile
FROM mycroftai/mimic3:latest

WORKDIR /app

# Copy trained model
COPY tts-models/mimic3 /model

EXPOSE 5002

CMD ["python", "serve.py", "--model-path", "/model/mimic3_my_speaker.pt", "--host", "0.0.0.0", "--port", "5002"]
```

**2. Push to GitHub**

```bash
git add Dockerfile.mimic3 tts-models/mimic3/
git commit -m "add: Mimic 3 deployment"
git push origin main
```

**3. Create Render Web Service:**

- Go to https://dashboard.render.com
- **New** → **Web Service**
- Connect your GitHub repo
- **Name:** `grumprolled-mimic3`
- **Runtime:** Docker
- **Docker Build Context:** `.`
- **Dockerfile Path:** `Dockerfile.mimic3`
- **Exposed Port:** `5002`
- **Free tier** (750 hrs/month)
- Deploy

**4. Get public endpoint** (e.g., `https://grumprolled-mimic3.onrender.com`)

### 2.2  Deploy Coqui on Fly.io

**1. Install Fly CLI:**

```bash
curl -L https://fly.io/install.sh | sh
flyctl auth login
```

**2. Create `Dockerfile.coqui`:**

```dockerfile
FROM coqui/tts-server:latest

EXPOSE 5003

CMD ["tts_server", "--model_name", "tts_models/en/vctk/vits", "--port", "5003", "--use_cuda", "false"]
```

**3. Launch on Fly.io:**

```bash
flyctl launch --name grumprolled-coqui --dockerfile Dockerfile.coqui --vm-type shared-cpu-1x --vm-memory 512
flyctl deploy
```

**4. Get public endpoint** (e.g., `https://grumprolled-coqui.fly.dev`)

### 2.3  Deploy YourTTS on Railway

**1. Build YourTTS locally (if not cached in Docker Hub):**

```bash
git clone https://github.com/microsoft/YourTTS
cd YourTTS
docker build -t yourtts:latest .
docker tag yourtts:latest <your-registry>/yourtts:latest
docker push <your-registry>/yourtts:latest
```

**2. Connect GitHub to Railway:**

- Go to https://railway.app
- Create new project
- Connect your repo
- Create new service from Dockerfile
- Set Dockerfile: `Dockerfile.yourtts`
- Deploy

**3. Get public endpoint** (e.g., `https://grumprolled-yourtts.up.railway.app`)

### 2.4  Update `.env.local` with cloud endpoints

```bash
# Cloud providers
TTS_MIMIC3_ENDPOINT=https://grumprolled-mimic3.onrender.com
TTS_MIMIC3_ENABLED=true

TTS_COQUI_ENDPOINT=https://grumprolled-coqui.fly.dev
TTS_COQUI_ENABLED=true

TTS_YOURTTS_ENDPOINT=https://grumprolled-yourtts.up.railway.app
TTS_YOURTTS_ENABLED=true

TTS_CACHE_RESPONSES=true
TTS_CACHE_TTL=3600
```

### 2.5  Test cloud deployment

```bash
# Check health (all three providers)
curl https://your-grumprolled-instance.vercel.app/api/v1/tts/health

# Synthesize with automatic fallback
curl -X POST https://your-grumprolled-instance.vercel.app/api/v1/tts/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Your deployment is live on three planets!","speaker":"my_speaker"}'
```

---

## Smoke Tests

Run these to verify all providers are wired correctly:

### Test 1: Health Check

```bash
curl http://localhost:3000/api/v1/tts/health
# Expected: { "providers": { "mimic3": true, "coqui": true, "yourtts": true } }
```

### Test 2: Mimic 3 Direct

```bash
curl -X POST http://localhost:5002/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Test","speaker":"my_speaker"}' \
  --output test_mimic3.wav
aplay test_mimic3.wav
```

### Test 3: Coqui Direct

```bash
curl -X POST http://localhost:5003/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Test","speaker_name":"default","language":"en"}' \
  --output test_coqui.wav
aplay test_coqui.wav
```

### Test 4: GrumpRolled Multi-Provider Fallback

```bash
# Disable Mimic 3, verify Coqui is tried
# Update docker-compose, restart mimic3 container, then:

curl -X POST http://localhost:3000/api/v1/tts/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Testing fallback!","speaker":"default"}' \
  | jq '.provider'
# Expected: "coqui" (because mimic3 is down)
```

### Test 5: Cache Validation

```bash
# First call (slow)
time curl -X POST http://localhost:3000/api/v1/tts/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Cache me!","speaker":"default"}'

# Second call (instant from cache)
time curl -X POST http://localhost:3000/api/v1/tts/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Cache me!","speaker":"default"}'
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Health check returns all false | Verify endpoints in .env.local, check Docker containers running |
| Mimic 3 fails but has no fallback | Ensure `TTS_COQUI_ENABLED=true` and endpoint is reachable |
| Coqui out of memory (OOM) | Reduce batch size or disable Coqui in .env.local |
| YourTTS slow on CPU | Disable on CPU-only hosts; keep GPU for YourTTS |
| Cache growing too large | Reduce `TTS_CACHE_TTL` or disable `TTS_CACHE_RESPONSES` |

---

## Cost Estimate (Free Tier)

| Provider | Platform | Free tier | Estimated cost for 1M requests/mo |
|----------|----------|-----------|-----------------------------------|
| **Mimic 3** | Render | 750 hrs/mo | **$0** (Render = 750 hrs free) |
| **Coqui TTS** | Fly.io | 3 vCPU hrs free | **$0** (3 vCPU hrs covers ~100k calls) |
| **YourTTS** | Railway | 500 hrs/mo | **$0** (within free tier) |
| **Total** | - | - | **$0** (fully free) |

If you exceed free tiers: Render = $7/mo, Fly = $2/mo, Railway = $5/mo → ~$15/mo for all three.

---

## Next Steps

1. ✅ Deploy Mimic 3 locally (fastest, covers 80% of use cases)
2. ✅ Test multi-provider fallback with docker-compose
3. ✅ Push to cloud (Render + Fly.io + Railway)
4. ✅ Update `.env.local` with cloud endpoints
5. ✅ Monitor health endpoint in production
6. ✅ (Optional) Implement request logging to track which provider each call used

Enjoy your **resilient, multi-engine TTS system**! 🎙️
