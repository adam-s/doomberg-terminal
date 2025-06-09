import { TextToTextWorkerApp } from './textToText.ts/textToTextWorker.app';

function main(): void {
  const app = new TextToTextWorkerApp();
  app.start().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start TextToTextWorkerApp:', error);
  });
}

main();
