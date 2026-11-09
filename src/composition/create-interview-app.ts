import { WS_PATH } from '@shared';
import { toWebSocketUrl } from '@/lib/runtime-config';
import { createControllers, type Controllers } from '@/mvc/controllers';
import { BrowserAudioService, type AudioCapture } from '@/services/audio.service';
import { InterviewApiService, type InterviewApi } from '@/services/interview-api.service';
import { WebSocketService, type RealtimeSocket } from '@/services/websocket.service';
import {
  createInterviewStore,
  type InterviewStore,
  type InterviewStoreState,
} from '@/store/interview.store';

export interface InterviewAppServices {
  api: InterviewApi;
  socket: RealtimeSocket;
  audio: AudioCapture;
}

export interface InterviewApp {
  store: InterviewStore;
  controllers: Controllers;
  init(): Promise<void>;
  dispose(): void;
}

export interface InterviewAppConfig {
  serverUrl: string;
  /** Override services (tests inject fakes). */
  services?: Partial<InterviewAppServices>;
  initialState?: Partial<InterviewStoreState>;
}

/**
 * Frontend composition root: the only place that instantiates concrete services.
 * Views receive the result through React context and never construct services.
 */
export function createInterviewApp(config: InterviewAppConfig): InterviewApp {
  const store = createInterviewStore(config.initialState);
  const services: InterviewAppServices = {
    api: config.services?.api ?? new InterviewApiService({ baseUrl: config.serverUrl }),
    socket:
      config.services?.socket ??
      new WebSocketService({ url: toWebSocketUrl(config.serverUrl, WS_PATH) }),
    audio: config.services?.audio ?? new BrowserAudioService(),
  };
  const controllers = createControllers({ store, ...services });
  return {
    store,
    controllers,
    init: () => controllers.interview.init(),
    dispose: () => controllers.interview.dispose(),
  };
}
