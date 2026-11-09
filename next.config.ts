import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

const envFile = path.resolve(process.cwd(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const standalone = process.env.NEXT_OUTPUT === 'standalone';
// This folder is a standalone project: pin the root so Next.js never adopts a
// lockfile from a parent directory.
const projectRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  ...(standalone ? { output: 'standalone' } : {}),
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'microphone=(self), display-capture=(self), camera=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
