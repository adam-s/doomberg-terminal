import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { type Request, type Response, type Router } from 'express';
import { z } from 'zod';

import { createApiResponse } from '@src/api-docs/openAPIResponseBuilders';
import { ServiceResponse } from '@src/common/models/serviceResponse';
import { handleServiceResponse } from '@src/common/utils/httpHandlers';

export const healthCheckRegistry = new OpenAPIRegistry();
export const healthCheckRouter: Router = express.Router();

healthCheckRegistry.registerPath({
  method: 'get',
  path: '/health-check',
  tags: ['Health Check'],
  responses: createApiResponse(z.null(), 'Success'),
});

healthCheckRouter.get('/', (_req: Request, res: Response) => {
  const serviceResponse = ServiceResponse.success('Service is healthy', null);
  return handleServiceResponse(serviceResponse, res);
});
