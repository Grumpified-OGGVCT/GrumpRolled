import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { reconcileProviderInventory } from '@/lib/provider-inventory-reconciliation';

// GET /api/v1/admin/provider-inventory
// Admin-only reconciliation surface for routed and cataloged provider inventory.
export async function GET(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const snapshot = reconcileProviderInventory();

    return NextResponse.json({
      scope: 'admin-provider-inventory',
      approval_boundary: {
        automated: [
          'Inspect approved local configuration presence',
          'Normalize routed and cataloged provider inventory',
          'Classify approval-required inventory entries',
          'Prepare mismatch warnings for operator review',
        ],
        human_approved_only: [
          'Provider activation',
          'New env alias support',
          'Public exposure of inventory metadata',
          'Documentation assertions of operational readiness',
        ],
      },
      snapshot,
    });
  } catch (error) {
    console.error('Admin provider inventory error:', error);
    return NextResponse.json(
      {
        error: 'Provider inventory reconciliation failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
