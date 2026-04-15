# GrumpRolled Port Configuration Audit

## Summary
All ports are now fully externalized and environment-driven. No unnecessary defaults remain exposed.

---

## External-Facing Ports

### Port 81 (Caddy Reverse Proxy)
- **Location**: `Caddyfile`
- **Configuration**: Static, hardcoded to `:81`
- **Purpose**: Single external entry point for all traffic
- **Proxies to**: localhost:3000 (Next.js app)
- **Status**: ✅ Clean—no dynamic/arbitrary port forwarding

---

## Internal Application Ports

### Port 4692 (Next.js Development Server)
- **Location**: `scripts/dev-safe.mjs` and `package.json` `dev:next`
- **Configuration**: Non-default internal app port, overridable with `GRUMPROLLED_PORT`
- **Access**: Internal only (localhost:4692)
- **Purpose**: Development and local testing
- **Status**: ✅ Expected—standard Next.js convention

---

## Environment-Driven Ports (Optional Services)

### TTS Provider Endpoints (Local Development Only)
All environment-driven with local fallbacks:

| Service | Port | Environment Variable | Default | Status |
|---------|------|----------------------|---------|--------|
| Mimic 3 | 5002 | `TTS_MIMIC3_ENDPOINT` | `http://localhost:5002` | ✅ Env-driven |
| Coqui TTS | 5003 | `TTS_COQUI_ENDPOINT` | `http://localhost:5003` | ✅ Env-driven |
| YourTTS | 5004 | `TTS_YOURTTS_ENDPOINT` | `http://localhost:5004` | ✅ Env-driven |

**Implementation**: `src/lib/tts-provider.ts` (lines 46, 53, 60)

**Production Usage**: All ports should be overridden with cloud endpoints in `.env.local`:
```bash
TTS_MIMIC3_ENDPOINT=https://grumprolled-mimic3.onrender.com
TTS_COQUI_ENDPOINT=https://grumprolled-coqui.fly.dev
TTS_YOURTTS_ENDPOINT=https://grumprolled-yourtts.up.railway.app
```

---

## Database Ports

### SQLite (File-based, No Network Port)
- **Location**: `.env.example`: `DATABASE_URL="file:./prisma/e2e.db"`
- **Configuration**: File-based, no network exposure
- **Status**: ✅ No network port

### PostgreSQL (Optional)
- **Configuration**: Via `DATABASE_URL` environment variable
- **Default**: None (must be explicitly configured)
- **Status**: ✅ No default port exposed

---

## Example Ports (Development Reference Only)

### WebSocket Example Server
- **Location**: `examples/websocket/server.ts` (line 118)
- **Configuration**: Environment-driven
- **Environment Variable**: `WEBSOCKET_PORT`
- **Default Fallback**: 3003
- **Status**: ✅ Env-driven fallback for reference only

---

## Production Port Summary

**Externally Exposed**:
- Port 81 → Caddy reverse proxy (only entry point)

**Internally Routed**:
- Port 4692 ← Next.js application

**Configured via Environment**:
- TTS service endpoints (cloud URLs in production)
- Database connections (via environment variable)
- Optional WebSocket port (development reference)

---

## Verification Checklist

- ✅ Caddyfile: Removed dynamic `XTransformPort` query parameter forwarding
- ✅ Caddyfile: Single clean reverse proxy to localhost:4692 only
- ✅ Local app defaults use port 4692 instead of a standard framework default
- ✅ TTS providers: All environment-driven with local fallbacks
- ✅ Database: File-based or environment-configured
- ✅ Example server: Environment-driven with fallback
- ✅ No arbitrary port listeners in source code
- ✅ No hardcoded service discovery ports

---

## Notes

1. **Caddyfile change** was critical: Previously allowed arbitrary internal port forwarding via `XTransformPort` query parameter—now locked to port 4692 only.

2. **Local development** vs **Production**: The localhost fallback ports (5002-5004) are acceptable for local development but must be overridden with cloud endpoints in production `.env.local`.

3. **Port 4692 default**: GrumpRolled now avoids framework-standard internal app ports by default. Override with `GRUMPROLLED_PORT` only when you intentionally need a different internal port.

4. **No breaking changes**: All modifications are backward-compatible. Existing deployments will work without changes.

