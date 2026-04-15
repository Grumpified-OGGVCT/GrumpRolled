#!/usr/bin/env python3
"""
TTS Multi-Provider Integration Tests
Tests the TTSManager with all three providers
"""

import asyncio
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from lib.tts.multi_provider import TTSManager, TTSProviderConfig, TTSRequest


async def test_provider_health():
    """Test provider health checks"""
    configs = [
        TTSProviderConfig(
            name="mimic3",
            endpoint="http://localhost:5002",
            enabled=True,
            priority=1,
            timeout=5000,
        ),
        TTSProviderConfig(
            name="coqui",
            endpoint="http://localhost:5003",
            enabled=False,
            priority=2,
            timeout=8000,
        ),
    ]

    manager = TTSManager(configs)

    print("Testing provider health...")
    health = await manager.getAllHealthStatus()

    for h in health:
        status = "✓" if h.healthy else "✗"
        latency = f"{h.latency}ms" if h.latency else "N/A"
        print(f"  {status} {h.name}: {latency}")

    return any(h.healthy for h in health)


async def test_synthesize():
    """Test TTS synthesis"""
    configs = [
        TTSProviderConfig(
            name="mimic3",
            endpoint="http://localhost:5002",
            enabled=True,
            priority=1,
            timeout=5000,
        ),
    ]

    manager = TTSManager(configs)

    print("\nTesting TTS synthesis...")
    try:
        request = TTSRequest(text="Hello Grumpy, this is a test!")
        response = await manager.synthesize(request)

        print(f"  Provider: {response.provider}")
        print(f"  Audio size: {len(response.audio)} bytes")
        print(f"  Cached: {response.cached}")
        print(f"  MIME: {response.mimeType}")

        return True
    except Exception as e:
        print(f"  Error: {e}")
        return False


async def test_provider_fallback():
    """Test automatic provider fallback"""
    configs = [
        # All disabled - will test fallback
        TTSProviderConfig(
            name="mimic3",
            endpoint="http://localhost:9999",  # invalid
            enabled=True,
            priority=1,
            timeout=1000,
        ),
        TTSProviderConfig(
            name="coqui",
            endpoint="http://localhost:5003",
            enabled=True,
            priority=2,
            timeout=5000,
        ),
    ]

    manager = TTSManager(configs)

    print("\nTesting provider fallback...")
    try:
        request = TTSRequest(text="Testing fallback")
        # This should fail with Mimic 3 and try Coqui
        # (only works if Coqui is actually running)
        response = await manager.synthesize(request)
        print(f"  Fallback successful: {response.provider}")
        return True
    except Exception as e:
        print(f"  Fallback chain exhausted (expected if no providers running): {e}")
        return False


async def main():
    print("=" * 60)
    print("GrumpRolled TTS Multi-Provider Tests")
    print("=" * 60)

    results = {
        "Health Checks": await test_provider_health(),
        "Synthesis": await test_synthesize(),
        "Fallback": await test_provider_fallback(),
    }

    print("\n" + "=" * 60)
    print("Test Results:")
    print("=" * 60)
    for test_name, passed in results.items():
        status = "PASS" if passed else "FAIL"
        print(f"  {test_name}: {status}")

    all_passed = all(results.values())
    print("\n" + ("All tests passed! ✓" if all_passed else "Some tests failed"))
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
