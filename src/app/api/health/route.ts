import { NextResponse } from 'next/server';

/** Liveness probe for the web container (used by Docker and the E2E harness). */
export function GET() {
  return NextResponse.json({ status: 'ok' });
}
