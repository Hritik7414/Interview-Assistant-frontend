import { describe, expect, it, vi } from 'vitest';
import { ApiError, InterviewApiService } from '@/services/interview-api.service';
import { CAPABILITIES, summary } from '../../helpers/fakes';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('InterviewApiService', () => {
  it('validates and returns typed responses', async () => {
    const fetchImpl = vi.fn(async () => json(CAPABILITIES));
    const api = new InterviewApiService({ baseUrl: 'http://api', fetchImpl });
    expect(await api.getCapabilities()).toEqual(CAPABILITIES);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api/api/v1/capabilities',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('posts JSON when creating an interview', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      json({ interview: summary() }, 201),
    );
    const api = new InterviewApiService({ baseUrl: 'http://api', fetchImpl });
    const interview = await api.createInterview({ mode: 'demo', context: { resume: 'R' } });
    expect(interview.id).toBe(summary().id);
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ mode: 'demo', context: { resume: 'R' } });
  });

  it('maps API error bodies to ApiError', async () => {
    const api = new InterviewApiService({
      baseUrl: 'http://api',
      fetchImpl: async () =>
        json({ error: { code: 'LIVE_MODE_UNAVAILABLE', message: 'No key' } }, 409),
    });
    await expect(api.createInterview({ mode: 'live' })).rejects.toMatchObject({
      code: 'LIVE_MODE_UNAVAILABLE',
      message: 'No key',
      status: 409,
    });
  });

  it('reports network failures and unexpected payloads', async () => {
    const offline = new InterviewApiService({
      baseUrl: 'http://api',
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });
    await expect(offline.getCapabilities()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    const broken = new InterviewApiService({
      baseUrl: 'http://api',
      fetchImpl: async () => json({ nope: true }),
    });
    const error = await broken.getCapabilities().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INTERNAL_ERROR');
  });
});
