import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InterviewProvider } from '@/components/shared/interview-provider';
import { DashboardView } from '@/mvc/views/dashboard/dashboard-view';
import { ApiError } from '@/services/interview-api.service';
import { createTestApp, events } from '../helpers/fakes';

function renderDashboard() {
  const ctx = createTestApp();
  const user = userEvent.setup();
  render(
    <InterviewProvider app={ctx.app}>
      <DashboardView />
    </InterviewProvider>,
  );
  return { ...ctx, user };
}

async function startSession(ctx: ReturnType<typeof renderDashboard>) {
  await ctx.user.click(await screen.findByRole('button', { name: 'Start listening' }));
  await screen.findByRole('button', { name: 'Stop listening' });
  await waitFor(() =>
    expect(screen.getAllByRole('status').some((el) => el.textContent === 'Listening')).toBe(true),
  );
}

describe('Dashboard', () => {
  it('renders every panel with helpful empty states', async () => {
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'Cue' })).toBeInTheDocument();
    for (const name of [
      'Session controls',
      'Candidate context',
      'Detected question',
      'Suggested answer',
      'Live transcript',
      'Latency diagnostics',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('Waiting for a question')).toBeInTheDocument();
    expect(screen.getByText('No answer yet')).toBeInTheDocument();
    expect(screen.getByText('Transcript is empty')).toBeInTheDocument();
    expect(await screen.findByText('Server online')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Live' })).toBeDisabled();
  });

  it('starts and stops listening', async () => {
    const ctx = renderDashboard();
    await startSession(ctx);
    expect(ctx.api.createInterview).toHaveBeenCalledOnce();
    expect(ctx.audio.start).toHaveBeenCalledOnce();
    expect(screen.getByRole('radio', { name: 'Demo' })).toBeDisabled();

    await ctx.user.click(screen.getByRole('button', { name: 'Stop listening' }));
    expect(await screen.findByRole('button', { name: 'Start listening' })).toBeEnabled();
    expect(ctx.socket.sentOfType('session.stop')).toHaveLength(1);
    expect(ctx.audio.stop).toHaveBeenCalled();
  });

  it('renders interim and final transcript lines', async () => {
    const ctx = renderDashboard();
    await startSession(ctx);
    act(() => ctx.socket.emit(events.segment('transcript.partial', 'how would', 'seg-1')));
    const log = screen.getByRole('log', { name: 'Transcript' });
    expect(within(log).getByText('how would')).toHaveClass('italic');

    act(() =>
      ctx.socket.emit(events.segment('transcript.final', 'How would you design a cache?', 'seg-1')),
    );
    expect(within(log).getByText('How would you design a cache?')).toBeInTheDocument();
    expect(within(log).queryByText('how would')).not.toBeInTheDocument();
    expect(screen.getByText('6 words')).toBeInTheDocument();
  });

  it('shows the detected question and streams the answer token by token', async () => {
    const ctx = renderDashboard();
    await startSession(ctx);
    act(() => {
      ctx.socket.emit(events.question('How would you design a cache?'));
      ctx.socket.emit(events.status('thinking'));
      ctx.socket.emit(events.answerStarted());
    });
    expect(screen.getByTestId('active-question')).toHaveTextContent(
      'How would you design a cache?',
    );
    expect(screen.getByLabelText('Generating answer')).toBeInTheDocument();

    const answer = screen.getByTestId('answer-content');
    act(() => ctx.socket.emit(events.delta('- Start with ', 0)));
    expect(answer).toHaveTextContent('Start with');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();

    act(() => ctx.socket.emit(events.delta('read-through caching.\n- Add [metric]', 1)));
    expect(answer).toHaveTextContent('Start with read-through caching.');
    expect(within(answer).getAllByRole('listitem')).toHaveLength(2);
    expect(within(answer).getByText('[metric]').tagName).toBe('MARK');

    act(() =>
      ctx.socket.emit(
        events.answerCompleted('- Start with read-through caching.\n- Add [metric] alerts.'),
      ),
    );
    expect(answer).toHaveTextContent('Add [metric] alerts.');
    expect(screen.getByRole('button', { name: 'Copy answer' })).toBeInTheDocument();
    expect(screen.getByText('Simulated answer')).toBeInTheDocument();
    expect(screen.getByText(/First token 290 ms/)).toBeInTheDocument();
  });

  it('lets the user cancel a streaming answer', async () => {
    const ctx = renderDashboard();
    await startSession(ctx);
    act(() => {
      ctx.socket.emit(events.question('Why this role?'));
      ctx.socket.emit(events.answerStarted());
      ctx.socket.emit(events.delta('- Because', 0));
    });
    await ctx.user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(ctx.socket.sentOfType('answer.cancel')).toHaveLength(1);
    act(() => ctx.socket.emit(events.answerCompleted('- Because', 'cancelled')));
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('shows latency diagnostics pushed by the server', async () => {
    const ctx = renderDashboard();
    await startSession(ctx);
    const stats = { count: 3, last: 320, avg: 300, p50: 300, p95: 2_400, min: 280, max: 2_400 };
    act(() =>
      ctx.socket.emit({
        ...events.status('listening'),
        payload: {
          state: 'listening',
          metrics: {
            audioIngestion: null,
            transcription: null,
            questionDetection: null,
            llmFirstToken: stats,
            answerTotal: null,
            endToEnd: null,
          },
        },
      }),
    );
    const row = screen.getByRole('row', { name: /LLM first token/ });
    expect(row).toHaveTextContent('320 ms');
    expect(row).toHaveTextContent('2.40 s');
    expect(within(row).getByLabelText('Rating: poor')).toBeInTheDocument();
  });

  it('shows an error when the server cannot be reached and allows dismissing it', async () => {
    const ctx = renderDashboard();
    ctx.api.createInterview.mockRejectedValueOnce(
      new ApiError('NETWORK_ERROR', 'Cannot reach the server at http://localhost:4000', 0),
    );
    await ctx.user.click(await screen.findByRole('button', { name: 'Start listening' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Server unreachable');
    expect(screen.getAllByRole('status').some((el) => el.textContent === 'Error')).toBe(true);
    await ctx.user.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start listening' })).toBeEnabled();
  });

  it('warns when the backend is offline at load time', async () => {
    const ctx = createTestApp();
    ctx.api.getCapabilities.mockRejectedValueOnce(new Error('Cannot reach the server'));
    render(
      <InterviewProvider app={ctx.app}>
        <DashboardView />
      </InterviewProvider>,
    );
    expect(await screen.findByText('Backend not reachable')).toBeInTheDocument();
    expect(screen.getByText('Server unreachable')).toBeInTheDocument();
  });

  it('flags context that exceeds the limit and blocks starting', async () => {
    const ctx = renderDashboard();
    const resume = screen.getByPlaceholderText(/Paste your resume/);
    fireEvent.change(resume, { target: { value: 'x'.repeat(20_001) } });
    expect(resume).toHaveAttribute('aria-invalid', 'true');
    await ctx.user.click(screen.getByRole('button', { name: 'Start listening' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your context');
    expect(ctx.api.createInterview).not.toHaveBeenCalled();
  });
});
