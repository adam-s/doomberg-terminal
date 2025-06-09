import { WorkerApp } from './computation/workerApp';

const app = new WorkerApp();
app.start().catch((err: Error) => {
  console.error('WorkerApp failed to start:', err);
});
