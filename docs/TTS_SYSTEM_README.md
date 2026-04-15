# GrumpRolled TTS Multi-Provider System

## Architecture & Design

GrumpRolled's TTS system now supports **multiple independent TTS providers** with intelligent fallback and caching. Instead of choosing one provider, you can enable multiple providers and let GrumpRolled automatically use the best one based on:

- **Provider health** (responds to health checks)
- **Priority ranking** (configurable order)
- **Response caching** (same text = instant playback)
- **Provider capabilities** (supports your language/voice needs)

```
User Request
     ↓
[TTS Manager Abstract Layer]
     ↓
Cache Hit? → Return cached audio (1ms)
     ↓
Cache Miss → Try Providers in Priority Order:
  1. Mimic 3     (Primary - fastest)
  2. Coqui TTS   (Secondary - best quality)
  3. YourTTS     (Tertiary - zero-shot)
  4. Fallback    (all providers failed - error)
     ↓
Store in Cache
     ↓
Stream to Browser
```

## Supported Providers

### 1. **Mimic 3** (Primary Recommendation)

- **Status**: ✅ Recommended for production
- **Type**: CPU-only, local
- **Latency**: 100-500ms
- **Quality**: Good, customizable
- **Languages**: English
- **Custom Voice**: Yes (train with your data)
- **Cost**: ~$12/mo (Render Hobby)
- **Docker**: `mycroftai/mimic3`
- **Repo**: https://github.com/MycroftAI/mimic-3

**Why use it**:
- Fastest inference
- Lowest resource cost
- Can be customized with your own voice
- Works on CPU

### 2. **Coqui TTS** (High Quality)

- **Status**: ✅ Great for multilingual
- **Type**: GPU optional
- **Latency**: 2-5s (CPU), 500ms (GPU)
- **Quality**: Excellent, very natural
- **Languages**: 8+ (English, Spanish, French, German, Portuguese, Italian, Russian, Arabic)
- **Custom Voice**: No (use speaker embeddings)
- **Cost**: $5-25/mo (Fly.io shared to dedicated)
- **Docker**: `coqui/tts-server`
- **Repo**: https://github.com/coqui-ai/TTS

**Why use it**:
- Superior voice quality
- Multilingual support
- Community-driven, well-maintained
- Good for production if you need quality over speed

### 3. **YourTTS** (Zero-Shot Voice Adaptation)

- **Status**: ✅ Advanced feature
- **Type**: GPU required
- **Latency**: 1-3s
- **Quality**: Excellent
- **Languages**: 6 (Portuguese, English, Spanish, French, Italian, German)
- **Custom Voice**: Yes (zero-shot from reference WAV)
- **Cost**: ~$10/mo (Railway)
- **Docker**: Build from repo (no official image)
- **Repo**: https://github.com/Edresson/YourTTS

**Why use it**:
- Can adapt to arbitrary speaker from sample WAV
- High quality
- Great for cloning voices

### 4. **Bark** (Local/Bonus)

- **Status**: ✅ Built-in (optional)
- **Type**: CPU/GPU hybrid
- **Latency**: 5-30s
- **Quality**: Experimental, expressive
- **Languages**: ~30 (via multilingual tokens)
- **Custom Voice**: No
- **Cost**: $0 (local)
- **Repo**: https://github.com/suno-ai/bark

**Why use it**:
- Free, runs locally
- Experimental/fun voices
- Good for non-critical uses

---

## Quick Start

### 1. Minimal Setup (Mimic 3 Only)

```bash
# 1. Clone and enter workspace
cd c:\Users\gerry\generic_workspace\GrumpRolled

# 2. Install npm dependencies
npm install axios

# 3. Copy env config
cp .env.local.example .env.local

# 4. Start Mimic 3 in Docker
docker run -d --name grump-mimic3 -p 5002:5002 mycroftai/mimic3

# 5. Start GrumpRolled
npm run dev

# 6. Test
curl -X POST http://localhost:3000/api/v1/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello Grumpy!"}' --output speech.wav
```

### 2. Full Stack (All Providers)

See [TTS_MULTI_PROVIDER_DEPLOYMENT.md](./TTS_MULTI_PROVIDER_DEPLOYMENT.md) for detailed cloud deployment.

---

## Configuration

### Environment Variables

```env
# Provider Endpoints (required: at least one)
TTS_MIMIC3_ENDPOINT=http://localhost:5002
TTS_COQUI_ENDPOINT=http://localhost:5003
TTS_YOURTTS_ENDPOINT=http://localhost:5004

# Provider Status
TTS_MIMIC3_ENABLED=true
TTS_COQUI_ENABLED=false
TTS_YOURTTS_ENABLED=false

# Timeouts (milliseconds)
TTS_MIMIC3_TIMEOUT=5000
TTS_COQUI_TIMEOUT=8000
TTS_YOURTTS_TIMEOUT=10000

# Caching
TTS_CACHE_RESPONSES=true
TTS_CACHE_TTL=3600  # 1 hour

# Bark (optional local provider)
NEXT_PUBLIC_BARK_ENABLED=true
BARK_SPEAKER_DEFAULT=grump
BARK_TTL_HOURS=24

# YourTTS Reference Audio (base64 encoded, optional)
YOURTTS_REF_WAV=<base64_string>
```

### Code: TypeScript Configuration

```typescript
import { createTTSManagerFromEnv, TTSManager, TTSProviderConfig } from '@/lib/tts/multi-provider';

// Auto-configured from environment
const manager = createTTSManagerFromEnv();

// Or manual configuration
const configs: TTSProviderConfig[] = [
  {
    name: 'mimic3',
    endpoint: 'http://localhost:5002',
    enabled: true,
    priority: 1,
    timeout: 5000,
    supportsCustomVoice: true,
    maxLength: 5000,
  },
  {
    name: 'coqui',
    endpoint: 'http://localhost:5003',
    enabled: false,
    priority: 2,
    timeout: 8000,
    supportsLanguages: ['en', 'es', 'fr'],
    maxLength: 10000,
  },
];

const manager = new TTSManager(configs, {
  enableCache: true,
  cacheTTL: 3600,
  cacheDir: './.tts-cache',
});
```

---

## API Endpoints

### POST /api/v1/tts/synthesize

Synthesize text to speech with optional provider selection.

**Request:**
```json
{
  "text": "Hello, Grumpy!",
  "voice": "default",
  "language": "en",
  "speaker": "0",
  "speed": 1.0,
  "provider": "mimic3"
}
```

**Response:**
- Status: 200 OK
- Body: Audio stream (WAV)
- Headers:
  - `X-TTS-Provider`: Which provider was used
  - `X-TTS-Cached`: true/false if cached
  - `Content-Type: audio/wav`

### GET /api/v1/tts/health

Get health status of all configured providers.

**Response:**
```json
{
  "success": true,
  "providers": {
    "mimic3": true,
    "coqui": false,
    "yourtts": false
  },
  "details": [
    {
      "name": "mimic3",
      "healthy": true,
      "latency": 45,
      "lastCheck": "2026-03-30T15:42:00.000Z"
    }
  ],
  "timestamp": "2026-03-30T15:42:00.000Z"
}
```

### GET /api/v1/tts/providers

List all configured providers and their capabilities.

**Response:**
```json
{
  "providers": [
    {
      "name": "mimic3",
      "enabled": true,
      "priority": 1,
      "endpoint": "http://localhost:5002",
      "supportsCustomVoice": true,
      "supportsLanguages": ["en"],
      "maxLength": 5000
    }
  ],
  "count": 1
}
```

### PUT /api/v1/tts/providers/:name/enable
### PUT /api/v1/tts/providers/:name/disable

Enable or disable a provider at runtime.

**Response:**
```json
{
  "success": true,
  "message": "Provider mimic3 enabled"
}
```

### DELETE /api/v1/tts/cache

Clear all cached audio responses.

**Response:**
```json
{
  "success": true,
  "message": "TTS cache cleared"
}
```

---

## Client-Side Usage (React)

### Hook: `useMultiProviderTTS`

```typescript
import { useMultiProviderTTS, useTTSHealth } from '@/hooks/useMultiProviderTTS';

export function VoiceButton() {
  const { speak, isLoading, isPlaying, error, provider } = useMultiProviderTTS();
  const { health } = useTTSHealth();

  return (
    <>
      <button 
        onClick={() => speak("Hello, Grumpy!")}
        disabled={isLoading}
      >
        {isLoading ? 'Synthesizing...' : 'Speak'}
      </button>
      
      {isPlaying && <p>Playing with {provider}...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      
      <div>
        Providers: {health && Object.entries(health).map(([name, healthy]) => (
          <span key={name} style={{ marginRight: '1rem' }}>
            {name}: {healthy ? '✓' : '✗'}
          </span>
        ))}
      </div>
    </>
  );
}
```

### Hook: `useTTSHealth`

```typescript
const { health, loading, error, refetch } = useTTSHealth();

// Refetch health every 30 seconds
useEffect(() => {
  const interval = setInterval(refetch, 30000);
  return () => clearInterval(interval);
}, [refetch]);
```

### Hook: `useTTSProviders`

```typescript
const { providers, setProviderEnabled } = useTTSProviders();

// Toggle provider
<button onClick={() => setProviderEnabled('coqui', !isCoquiEnabled)}>
  Toggle Coqui
</button>
```

### Hook: `useTTSCache`

```typescript
const { clearCache, clearing } = useTTSCache();

<button onClick={clearCache} disabled={clearing}>
  Clear Cache
</button>
```

---

## Provider Selection Strategy

### For Different Use Cases

**Fast Response (< 1 second)**
- Use: Mimic 3 (cached)
- Fallback: Bark (local)
- Avoid: Coqui, YourTTS

**Best Quality**
- Use: Coqui (multilingual) or YourTTS (custom voice)
- Fallback: Mimic 3
- Accept: 2-5s latency

**Multilingual**
- Priority: Coqui (8 languages)
- Fallback: YourTTS (6 languages)
- Note: Mimic 3 English only

**Custom/Cloned Voice**
- Only option: YourTTS (with reference WAV)
- Alternative: Mimic 3 (with training)
- Not recommended: Coqui (no voice cloning)

**Low Cost**
- Use: Bark (free, local)
- Fallback: Mimic 3 ($12/mo)
- Avoid: YourTTS (requires GPU, ~$20/mo)

### Priority Configuration Example

```typescript
// Speed-first
const speedFirst = [
  { name: 'mimic3', priority: 1 },    // Fastest
  { name: 'bark', priority: 2 },      // Free, local
  { name: 'yourtts', priority: 3 },   // Medium speed
  { name: 'coqui', priority: 4 },     // Slowest
];

// Quality-first
const qualityFirst = [
  { name: 'yourtts', priority: 1 },   // Best quality
  { name: 'coqui', priority: 2 },     // Excellent quality
  { name: 'mimic3', priority: 3 },    // Good quality
  { name: 'bark', priority: 4 },      // Experimental
];

// Cost-optimized
const costOptimized = [
  { name: 'bark', priority: 1 },      // Free
  { name: 'mimic3', priority: 2 },    // Cheapest paid
  { name: 'coqui', priority: 3 },     // Shared instance
  { name: 'yourtts', priority: 4 },   // Dedicated GPU
];
```

---

## Deployment Checklist

### Local Development ✓

- [ ] Install Docker
- [ ] Copy `.env.local.example` to `.env.local`
- [ ] Start Mimic 3: `docker run -p 5002:5002 mycroftai/mimic3`
- [ ] Install npm deps: `npm install`
- [ ] Test health: `curl http://localhost:3000/api/v1/tts/health`
- [ ] Test synthesis: POST to `/api/v1/tts/synthesize`

### Local Multi-Provider ✓

- [ ] Start Mimic 3 (port 5002)
- [ ] Start Coqui (port 5003, optional GPU)
- [ ] Start YourTTS (port 5004, requires GPU)
- [ ] Update `.env.local` with all endpoints
- [ ] Enable desired providers (`TTS_*_ENABLED=true`)
- [ ] Test fallback: Kill one provider, verify next is used

### Cloud Deployment ✓

- [ ] Deploy Mimic 3 to Render
- [ ] Deploy Coqui to Fly.io
- [ ] Deploy YourTTS to Railway
- [ ] Update production `.env` with cloud endpoints
- [ ] Set timeouts for cloud latency (increase to 8-15s)
- [ ] Set up health check cron (every 5 min)
- [ ] Test all endpoints from production domain
- [ ] Monitor error rates and fallback frequency

---

## Performance Characteristics

| Provider | Latency (P50) | Latency (P95) | Memory | GPU | Quality |
|----------|---------------|---------------|--------|-----|---------|
| Bark Local | 5-15s | 20-30s | 2GB | Optional | Good |
| Mimic 3 | 100-500ms | 1s | 500MB | No | Good |
| Coqui (CPU) | 2-5s | 10s | 1GB | No | Excellent |
| Coqui (GPU) | 300-750ms | 2s | 2GB | 1x | Excellent |
| YourTTS | 1-3s | 8s | 4GB | Yes | Best |

---

## Troubleshooting

### "No TTS providers are enabled"

```bash
# Check .env.local
grep "TTS.*ENABLED" .env.local

# At least one must be true
TTS_MIMIC3_ENABLED=true  # ← need at least one `true`
```

### "All TTS providers failed"

```bash
# Check each provider's endpoint
curl http://localhost:5002/health
curl http://localhost:5003/health
curl http://localhost:5004/health

# If endpoints are wrong, update .env.local
# If endpoints respond with 404, provider service isn't running
```

### Provider timeout/slow responses

```env
# Increase timeouts for your infrastructure
TTS_MIMIC3_TIMEOUT=10000   # was 5000
TTS_COQUI_TIMEOUT=15000    # was 8000
TTS_YOURTTS_TIMEOUT=15000  # was 10000
```

### Cache disk space growing

```bash
# Clear cache
curl -X DELETE http://localhost:3000/api/v1/tts/cache

# Or reduce TTL
TTS_CACHE_TTL=1800  # 30 min instead of 1 hour
```

### One provider keeps failing

```bash
# Disable it
curl -X PUT http://localhost:3000/api/v1/tts/providers/coqui/disable

# It will be skipped in the fallback chain
```

---

## File Structure

```
src/
├── lib/tts/
│   └── multi-provider.ts       ← Core TTSManager class
├── app/api/v1/tts/
│   └── route.ts                ← API endpoints
├── hooks/
│   └── useMultiProviderTTS.ts  ← React hooks
│
docs/
├── TTS_INTEGRATION_GUIDE.md         ← Single provider guide
├── TTS_MULTI_PROVIDER_DEPLOYMENT.md ← Full deployment
└── TTS_SYSTEM_README.md             ← You are here
│
tests/
├── test_multi_provider_tts.py  ← Integration tests
│
.env.local.example              ← Config template
```

---

## Next Steps

1. **Quick Start**: Follow the "Minimal Setup (Mimic 3 Only)" section above
2. **Integration**: Use `useMultiProviderTTS` hook in your components
3. **Monitoring**: Call `/api/v1/tts/health` periodically to detect failures
4. **Scaling**: When ready, deploy all three providers to cloud
5. **Optimization**: Monitor provider usage and adjust priority based on real data

---

## References

- Mimic 3: https://github.com/MycroftAI/mimic-3
- Coqui TTS: https://github.com/coqui-ai/TTS
- YourTTS: https://github.com/Edresson/YourTTS
- Bark: https://github.com/suno-ai/bark
- Model Context Protocol (MCP): https://modelcontextprotocol.io
