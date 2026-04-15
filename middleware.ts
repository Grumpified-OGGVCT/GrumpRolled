import { NextRequest, NextResponse } from 'next/server';

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
}

function canonicalMiddleware(request: NextRequest) {
  const canonicalHost = (process.env.CANONICAL_HOST || '').trim().toLowerCase();
  const enforceHttps = String(process.env.CANONICAL_HTTPS || 'true').toLowerCase() !== 'false';

  if (!canonicalHost) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  const currentHost = (request.headers.get('host') || url.host).toLowerCase();
  const currentHostname = currentHost.split(':')[0];

  if (isLocalHost(currentHostname)) {
    return NextResponse.next();
  }

  const shouldRedirectHost = currentHostname !== canonicalHost;
  const shouldRedirectProto = enforceHttps && url.protocol !== 'https:';

  if (!shouldRedirectHost && !shouldRedirectProto) {
    return NextResponse.next();
  }

  url.host = canonicalHost;
  if (enforceHttps) {
    url.protocol = 'https:';
  }

  return NextResponse.redirect(url, 308);
}

export default canonicalMiddleware;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
