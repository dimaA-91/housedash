import { NextResponse } from 'next/server';
import { readBuildId } from '@/lib/build-id';
import { version } from '../../../../package.json';

export const dynamic = 'force-dynamic';

/** What `GET /api/health` answers. */
export interface HealthResponse {
  ok: true;
  /** The release this hub runs, from package.json. */
  version: string;
  /** The Next.js build id, the same string `/api/system/build-id` serves. */
  build: string;
  /** Seconds since the server process started. */
  uptime: number;
}

/**
 * GET /api/health: is the hub up, and what is it running.
 *
 * Intentionally public (no auth) and exempt from the IP allowlist in
 * src/proxy.ts: Docker and the updater probe it to decide whether a new release
 * booted. It says nothing about the household, only the version, the build and the uptime.
 *
 * A 200 means the app booted and is routing requests. The reads below never
 * throw, so a hub that serves this route at all answers 200; a release that
 * must not run on the data it finds has to exit rather than serve errors.
 */
export async function GET() {
  const build = await readBuildId();
  const body: HealthResponse = {
    ok: true,
    version,
    build,
    uptime: Math.round(process.uptime()),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
