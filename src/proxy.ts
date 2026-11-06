import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readFileSync, statSync } from 'fs';
import path from 'path';
import { CLIENT_IP_HEADER } from '@/lib/client-ip';
import { getDataRoot } from '@/lib/data-root';
import { isIpAllowed } from '@/lib/ip-allowlist';
import { isDisallowedCrossOriginWrite, parseAllowedOrigins } from '@/lib/same-origin';

/* ─── Cached auth config ─────────────────────── */

interface AuthConfig {
  enabled: boolean;
  ipAllowlist: string[];
  ipRestrictAccess: boolean;
}

let authConfigCache: { value: AuthConfig; signature: string } | null = null;
let unreadableStats = 0;

/**
 * Identity of auth.json on disk. Every writer replaces the file (the store's
 * tmp + rename, the reset script's rename) or rewrites it in place, so any
 * change moves at least one of inode, size and mtime. A stat that fails for a
 * reason other than "no file" gets a one-off signature: the cache never
 * answers for a file it could not look at.
 */
function authFileSignature(filePath: string): string {
  try {
    const st = statSync(filePath, { throwIfNoEntry: false });
    return st ? `${st.ino}:${st.size}:${st.mtimeMs}` : 'missing';
  } catch {
    return `unreadable:${++unreadableStats}`;
  }
}

/**
 * Read auth config from data/auth.json, cached against the file's identity
 * rather than a clock. The auth-state reader in src/lib/auth.ts keeps its own
 * cache of the same file; a timed cache on each meant the two could disagree
 * for up to 5s after a write, and this gate kept answering 401 to cookie-less
 * writes after the password had already been turned off.
 * Reads synchronously: the gate runs on every request, and after the first
 * read the common case is one stat call against the cached signature.
 * Returns auth-enabled flag plus IP allowlist state for access restriction.
 */
function getAuthConfig(): AuthConfig {
  const filePath = path.join(getDataRoot(), 'data', 'auth.json');
  const signature = authFileSignature(filePath);
  if (authConfigCache && authConfigCache.signature === signature) {
    return authConfigCache.value;
  }

  let enabled = false;
  let ipAllowlist: string[] = [];
  let ipRestrictAccess = false;
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    enabled = data.passwordHash !== null && data.passwordHash !== undefined;
    if (Array.isArray(data.ipAllowlist)) {
      ipAllowlist = data.ipAllowlist.filter((e: unknown): e is string => typeof e === 'string');
    }
    if (typeof data.ipRestrictAccess === 'boolean') {
      ipRestrictAccess = data.ipRestrictAccess;
    }
  } catch (e: unknown) {
    // ENOENT = file doesn't exist → auth disabled (default state)
    // Any other error (corrupt JSON, permission denied) → fail closed
    if (e && typeof e === 'object' && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT') {
      enabled = false;
    } else {
      enabled = true;
    }
  }

  const value: AuthConfig = { enabled, ipAllowlist, ipRestrictAccess };
  authConfigCache = { value, signature };
  return value;
}

/* ─── IP allowlist helpers ───────────────────── */

/**
 * Client IP for the access-restriction gate. Mirrors getClientIP in
 * api-utils.ts: reads only the server-stamped `x-hs-client-ip` header
 * (written from the TCP peer by the instrumentation patch in
 * `lib/server-ip-patch.ts`), never the spoofable `X-Forwarded-For` /
 * `X-Real-IP`. Missing header fails closed as 'unknown' (never allowlisted).
 */
function extractIp(request: NextRequest): string {
  return request.headers.get(CLIENT_IP_HEADER) || 'unknown';
}

/* ─── Route classification ───────────────────── */

/**
 * Public auth routes that must always be reachable (even without a session cookie).
 */
const PUBLIC_AUTH_ROUTES = ['/api/auth/login', '/api/auth/logout', '/api/auth/status'];
function isPublicAuthRoute(pathname: string): boolean { return PUBLIC_AUTH_ROUTES.includes(pathname); }
function isProtectedRoute(pathname: string, method: string): boolean {
  if (pathname === '/family') return true;
  if (!pathname.startsWith('/api/')) return false;
  if (isPublicAuthRoute(pathname) || pathname === '/api/health') return false;
  // These two routes enforce scoped resource-token authorization themselves.
  if (method === 'GET' && (pathname === '/api/family/calendar/feed.ics' || pathname === '/api/backgrounds/serve')) return false;
  return true;
}

// Parsed once per process; the env var cannot change at runtime.
const allowedOrigins = parseAllowedOrigins(process.env.HS_ALLOWED_ORIGINS);

/* ─── Proxy ──────────────────────────────────── */

/**
 * Next.js 16 proxy.
 *
 * Three responsibilities:
 * 1. IP access restriction — blocks non-allowlisted IPs from all routes
 *    except /login, /api/auth/status and /api/health (when enabled via
 *    settings).
 * 2. Cross-origin write rejection on /api/* — the one gate that runs even
 *    with auth disabled, because it defends against attackers who are not on
 *    the LAN at all and so are not covered by the trusted-network assumption.
 * 3. Cookie-presence auth gate — enforces session cookie on protected routes
 *    (only when auth is enabled). Real validation happens in requireSession()
 *    inside route handlers.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  const config = getAuthConfig();

  // ─── IP access restriction ─────────────────
  // Runs before auth checks so non-allowlisted IPs can't even reach the login page
  // via a protected route. /login and /api/auth/status are always exempt so the
  // login page can render its "IP restricted" note. /api/health is exempt
  // because the upgrade pipeline probes it from the Pi's own loopback address,
  // which an allowlist rarely names, to decide whether a new release booted;
  // it answers only the version, build, schema and uptime.
  if (config.ipRestrictAccess && config.ipAllowlist.length > 0) {
    if (pathname !== '/login' && pathname !== '/api/auth/status' && pathname !== '/api/health') {
      const clientIp = extractIp(request);
      if (!isIpAllowed(clientIp, config.ipAllowlist)) {
        if (pathname.startsWith('/api/')) {
          return Response.json(
            { error: 'Access denied', reason: 'ip_restricted' },
            { status: 403 },
          );
        }
        // Page routes → redirect to /login (where the note explains the situation)
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  // ─── Cross-origin write gate ────────────────
  // Deliberately BEFORE the `config.enabled` early-return below: a
  // password-less install is exactly the one that needs this. "Trusted LAN" is
  // an accepted trade-off for people on the network; it says nothing about a
  // web page someone in the house happens to open, which can drive their
  // browser into issuing writes here without a preflight.
  if (
    pathname.startsWith('/api/') &&
    isDisallowedCrossOriginWrite({
      method,
      origin: request.headers.get('origin'),
      host: request.headers.get('host'),
      forwardedHost: request.headers.get('x-forwarded-host'),
      allowedOrigins,
    })
  ) {
    return Response.json(
      { error: 'Access denied', reason: 'cross_origin' },
      { status: 403 },
    );
  }

  // ─── Auth cookie gate ───────────────────────
  // If auth is not enabled, let everything through
  if (!config.enabled) return NextResponse.next();

  if (!isProtectedRoute(pathname, method)) return NextResponse.next();

  // Cheap credential-presence check (no signature validation here — real
  // validation happens in requireSession / requireDisplayAuth in route handlers).
  // Accept session cookie, Bearer token, or ?token= query param.
  const session = request.cookies.get('hs-session');
  if (session?.value) return NextResponse.next();
  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) return NextResponse.next();
  if (request.nextUrl.searchParams.has('token')) return NextResponse.next();

  // No cookie on protected route
  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Page route — redirect to login (preserve query string so settings
  // params like ?section= / ?page= survive)
  const loginUrl = new URL('/login', request.url);
  const from = pathname + request.nextUrl.search;
  loginUrl.searchParams.set('from', from);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // IP restriction needs to cover ALL routes, not just auth-protected ones,
    // so we use a broad matcher that excludes only static assets.
    '/((?!_next/static|_next/image|favicon\\.ico|manifest|icons/|\\.well-known).*)',
  ],
};
