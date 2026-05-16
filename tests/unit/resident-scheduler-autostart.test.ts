import { describe, expect, it } from 'vitest';

import { shouldAutostartResidentScheduler } from '@/instrumentation';

describe('resident scheduler autostart safety', () => {
  it('does not autostart in local dev by default', () => {
    expect(
      shouldAutostartResidentScheduler({
        NEXT_RUNTIME: 'nodejs',
        NODE_ENV: 'development',
      }),
    ).toBe(false);
  });

  it('requires explicit opt-in even in production', () => {
    expect(
      shouldAutostartResidentScheduler({
        NEXT_RUNTIME: 'nodejs',
        NODE_ENV: 'production',
      }),
    ).toBe(false);

    expect(
      shouldAutostartResidentScheduler({
        NEXT_RUNTIME: 'nodejs',
        NODE_ENV: 'production',
        RESIDENT_SCHEDULER_AUTOSTART: 'true',
      }),
    ).toBe(true);
  });

  it('requires an extra development override before dev can autostart', () => {
    expect(
      shouldAutostartResidentScheduler({
        NEXT_RUNTIME: 'nodejs',
        NODE_ENV: 'development',
        RESIDENT_SCHEDULER_AUTOSTART: 'true',
      }),
    ).toBe(false);

    expect(
      shouldAutostartResidentScheduler({
        NEXT_RUNTIME: 'nodejs',
        NODE_ENV: 'development',
        RESIDENT_SCHEDULER_AUTOSTART: 'true',
        RESIDENT_SCHEDULER_ALLOW_DEV: 'true',
      }),
    ).toBe(true);
  });
});
