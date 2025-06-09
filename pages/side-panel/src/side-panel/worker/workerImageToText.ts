import { ImageToTextWorkerApp } from './imageToText/imageToTextWorker.app';

const app = new ImageToTextWorkerApp();
app.start().catch((err: Error) => {
  // eslint-disable-next-line no-console
  console.error('ImageToTextWorkerApp failed to start:', err);
});
