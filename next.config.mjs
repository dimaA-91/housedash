import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { availableParallelism } from 'node:os';
/** @type {import('next').NextConfig} */
const config = {
  output: process.env.HOUSEDASH_STANDALONE === '1' ? 'standalone' : undefined,
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  agentRules: false,
  serverExternalPackages: ['node-ical'],
  experimental: { workerThreads: false, cpus: Math.min(8, availableParallelism()), proxyClientMaxBodySize: '205mb' },
  async redirects() {
    return ['editor', 'display', 'remote', 'chores'].map(page => ({ source: `/${page}/:path*`, destination: '/family', permanent: false }));
  },
  async headers() {
    const development = process.env.NODE_ENV !== 'production';
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Content-Security-Policy', value: ["default-src 'self'", `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`,
        "style-src 'self' 'unsafe-inline'", "img-src 'self' blob: https: http: data:", "media-src 'self' blob: https: http: data:",
        "connect-src 'self' https: http://localhost:*", "font-src 'self' data:", "frame-src 'none'", "object-src 'none'", "base-uri 'self'"].join('; ') },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
    ] }];
  },
};
export default config;
