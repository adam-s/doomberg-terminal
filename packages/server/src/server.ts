import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pino from 'pino-http';

import { openAPIRouter } from '@src/api-docs/openAPIRouter';
import { healthCheckRouter } from '@src/api/healthCheck/healthCheck.router';
import { userRouter } from '@src/api/user/user.router';
import { dataRouter } from '@src/api/data/data.router';
import { openInterestRouter } from './api/openInterest/openInterest.router';
import errorHandler from '@src/common/middleware/errorHandler';
// import rateLimiter from '@src/common/middleware/rateLimiter';
import requestLogger from '@src/common/middleware/requestLogger';
// import { env } from '@src/common/utils/envConfig';

const app: Express = express();

const logger = pino().logger;

// Set the application to trust the reverse proxy
app.set('trust proxy', true);
// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: (o, cb) => cb(null, !o || /^(chrome-extension:\/\/|http:\/\/localhost)/.test(o)),
    credentials: true,
  }),
);
app.use(helmet());
// app.use(rateLimiter);

// Request logging
app.use(requestLogger);

// Routes
app.use('/health-check', healthCheckRouter);
app.use('/users', userRouter);
app.use('/data', dataRouter);
app.use('/open-interest', openInterestRouter);

// Swagger UI
app.use(openAPIRouter);

// Error handlers
app.use(errorHandler());

export { app, logger };
