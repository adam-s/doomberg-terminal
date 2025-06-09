import type { Request } from 'express';
import { rateLimit } from 'express-rate-limit';

import { env } from '@src/common/utils/envConfig';

const rateLimiter = rateLimit({
  legacyHeaders: true,
  limit: env.COMMON_RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  windowMs: env.COMMON_RATE_LIMIT_WINDOW_MS, // Now using 1000ms directly from env
  keyGenerator: (req: Request) => req.ip as string,
});

export default rateLimiter;
