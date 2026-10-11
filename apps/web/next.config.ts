import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The browser only ever calls same-origin /api/*; Next proxies it to the Fastify API. That keeps
// session cookies first-party and lets Google's OAuth redirect land on the public site.
// Read at build time (Netlify / Docker build args).
if (process.env.NETLIFY === 'true' && !process.env.API_URL) {
  throw new Error('Set API_URL (your Render API URL) in the Netlify site environment variables.');
}
const apiUrl = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@meetqueue/core'],
  // Docker uses the standalone server; Netlify's adapter handles its own output.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  experimental: {
    // Render's free tier can take ~50s to wake; don't give up on the proxied request early.
    proxyTimeout: 90_000,
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // Manage links carry a secret token in the URL: never leak it via Referer.
        source: '/manage/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
    ];
  },
};

export default nextConfig;
