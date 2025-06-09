import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { type Router } from 'express';
import { z } from 'zod';

import { createApiResponse } from '@src/api-docs/openAPIResponseBuilders';
import { validateRequest } from '@src/common/utils/httpHandlers';
import { openInterestController } from './openInterest.controller';
import {
  GetOpenInterestSchema,
  StoreOpenInterestSchema,
  StoreOpenInterestResponseSchema,
  RawOpenInterestData,
} from '../../data-layer/openInterest/openInterest.model';

export const openInterestRegistry = new OpenAPIRegistry();
export const openInterestRouter: Router = express.Router();

// Register paths
openInterestRegistry.registerPath({
  method: 'get',
  path: '/open-interest',
  tags: ['OpenInterest'],
  request: {
    query: GetOpenInterestSchema.shape.query,
  },
  responses: createApiResponse(z.custom<RawOpenInterestData>().nullable(), 'Success'),
});

openInterestRegistry.registerPath({
  method: 'post',
  path: '/open-interest',
  tags: ['OpenInterest'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: StoreOpenInterestSchema.shape.body,
        },
      },
    },
  },
  responses: createApiResponse(StoreOpenInterestResponseSchema, 'Success'),
});

// Routes
openInterestRouter.get(
  '/',
  validateRequest(GetOpenInterestSchema),
  openInterestController.getRawData,
);
openInterestRouter.post(
  '/',
  validateRequest(StoreOpenInterestSchema),
  openInterestController.storeRawData,
);
