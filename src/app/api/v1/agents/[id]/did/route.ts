import { NextRequest, NextResponse } from 'next/server';
import { getDidDocumentByAgent } from '@/lib/did-registration';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await getDidDocumentByAgent({ agentId: id });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Agent DID retrieval error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}