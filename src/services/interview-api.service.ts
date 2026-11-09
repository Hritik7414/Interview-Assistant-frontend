import {
  API_PREFIX,
  ApiErrorResponseSchema,
  CapabilitiesSchema,
  InterviewResponseSchema,
  type CapabilitiesDTO,
  type CreateInterviewRequest,
  type InterviewContextPatch,
  type InterviewSummaryDTO,
} from '@shared';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** REST operations the controllers depend on (implemented over fetch below). */
export interface InterviewApi {
  getCapabilities(): Promise<CapabilitiesDTO>;
  createInterview(request: CreateInterviewRequest): Promise<InterviewSummaryDTO>;
  updateContext(interviewId: string, patch: InterviewContextPatch): Promise<InterviewSummaryDTO>;
  deleteInterview(interviewId: string): Promise<void>;
}

export interface InterviewApiOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Typed REST client. Every response is validated against the shared Zod schemas. */
export class InterviewApiService implements InterviewApi {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: InterviewApiOptions) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  getCapabilities(): Promise<CapabilitiesDTO> {
    return this.request(`${API_PREFIX}/capabilities`, { method: 'GET' }, CapabilitiesSchema);
  }

  async createInterview(request: CreateInterviewRequest): Promise<InterviewSummaryDTO> {
    const body = await this.request(
      `${API_PREFIX}/interviews`,
      { method: 'POST', body: JSON.stringify(request) },
      InterviewResponseSchema,
    );
    return body.interview;
  }

  async updateContext(
    interviewId: string,
    patch: InterviewContextPatch,
  ): Promise<InterviewSummaryDTO> {
    const body = await this.request(
      `${API_PREFIX}/interviews/${encodeURIComponent(interviewId)}/context`,
      { method: 'PATCH', body: JSON.stringify(patch) },
      InterviewResponseSchema,
    );
    return body.interview;
  }

  async deleteInterview(interviewId: string): Promise<void> {
    await this.request(
      `${API_PREFIX}/interviews/${encodeURIComponent(interviewId)}`,
      { method: 'DELETE' },
      null,
    );
  }

  private async request<TSchema extends z.ZodType>(
    path: string,
    init: RequestInit,
    schema: TSchema | null,
  ): Promise<z.output<TSchema>> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        ...init,
        headers: init.body ? { 'content-type': 'application/json' } : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ApiError('NETWORK_ERROR', `Cannot reach the server at ${this.options.baseUrl}`, 0);
    }

    if (!response.ok) {
      const parsed = ApiErrorResponseSchema.safeParse(await response.json().catch(() => null));
      throw parsed.success
        ? new ApiError(parsed.data.error.code, parsed.data.error.message, response.status)
        : new ApiError(
            'INTERNAL_ERROR',
            `Request failed with HTTP ${response.status}`,
            response.status,
          );
    }
    if (schema === null || response.status === 204) return undefined as z.output<TSchema>;

    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ApiError(
        'INTERNAL_ERROR',
        'The server returned an unexpected response',
        response.status,
      );
    }
    return parsed.data;
  }
}
