import { InterviewProvider } from '@/components/shared/interview-provider';
import { getPublicServerUrl } from '@/lib/runtime-config';
import { DashboardView } from '@/mvc/views/dashboard/dashboard-view';

// Read the backend URL at request time so one build works in every environment.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <InterviewProvider serverUrl={getPublicServerUrl()}>
      <DashboardView />
    </InterviewProvider>
  );
}
