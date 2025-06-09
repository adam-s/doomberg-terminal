import { env } from '@src/common/utils/envConfig';
import { app, logger } from '@src/server';
import { ServerApp } from './server.app';

const server = app.listen(env.PORT, () => {
  const { NODE_ENV, HOST, PORT } = env;
  logger.info(`Server (${NODE_ENV}) running on port http://${HOST}:${PORT}`);
});

const serverApp = new ServerApp({ server, logger });
serverApp.start();

const onCloseSignal = () => {
  logger.info('sigint received, shutting down');
  serverApp.close();
  server.close(() => {
    logger.info('server closed');
    process.exit();
  });
  setTimeout(() => process.exit(1), 10000).unref(); // Force shutdown after 10s
};

process.on('SIGINT', onCloseSignal);
process.on('SIGTERM', onCloseSignal);
