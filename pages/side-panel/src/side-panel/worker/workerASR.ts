import { AsrWorkerApp } from './asr/asrWorker.app';

const app = new AsrWorkerApp();
app.start().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('AsrWorkerApp failed to start:', error);
});
