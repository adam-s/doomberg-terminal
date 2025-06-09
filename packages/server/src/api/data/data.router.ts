import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { type Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import { createApiResponse } from '@src/api-docs/openAPIResponseBuilders';
import { DataSchema, StoreDataSchema } from '@src/data-layer/data/data.model';
import { validateRequest } from '@src/common/utils/httpHandlers';
import { dataController } from './data.controller';

export const dataRegistry = new OpenAPIRegistry();
export const dataRouter: Router = express.Router();

const mockDataPath = path.join(__dirname, '../../../src/data/mock');

// Schema definitions
const MockChainResponseSchema = z.object({
  chain: z.unknown(),
});

const MockInstrumentsResponseSchema = z.object({
  instruments: z.record(z.string(), z.unknown()),
});

const MockMarketDataResponseSchema = z.object({
  marketData: z.record(z.string(), z.unknown()),
  lastTradePrice: z.unknown(),
  timestamp: z.string(),
  nextDataUrl: z.string().optional(),
});

// Register schemas
dataRegistry.register('Data', DataSchema);
dataRegistry.register('MockChainResponse', MockChainResponseSchema);
dataRegistry.register('MockInstrumentsResponse', MockInstrumentsResponseSchema);
dataRegistry.register('MockMarketDataResponse', MockMarketDataResponseSchema);

// Register endpoints
const registerEndpoints = () => {
  // Regular data endpoint
  dataRegistry.registerPath({
    method: 'post',
    path: '/data',
    tags: ['Data'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: DataSchema,
          },
        },
      },
    },
    responses: createApiResponse(z.null(), 'Success'),
  });

  // Mock data endpoints
  dataRegistry.registerPath({
    method: 'get',
    path: '/data/mock/{symbol}/{folder}/chain',
    tags: ['Mock Data'],
    request: {
      params: z.object({
        symbol: z.string(),
        folder: z.string(),
      }),
    },
    responses: createApiResponse(MockChainResponseSchema, 'Mock chain data'),
  });

  dataRegistry.registerPath({
    method: 'get',
    path: '/data/mock/{symbol}/{folder}/instruments',
    tags: ['Mock Data'],
    request: {
      params: z.object({
        symbol: z.string(),
        folder: z.string(),
      }),
    },
    responses: createApiResponse(MockInstrumentsResponseSchema, 'Mock instruments data'),
  });

  dataRegistry.registerPath({
    method: 'get',
    path: '/data/mock/{symbol}/{folder}/market-data/{index}',
    tags: ['Mock Data'],
    request: {
      params: z.object({
        symbol: z.string(),
        folder: z.string(),
        index: z.string(),
      }),
    },
    responses: createApiResponse(MockMarketDataResponseSchema, 'Mock market data'),
  });
};

// Register all endpoints
registerEndpoints();

// Route handlers
const getMockChainData = async (req: express.Request, res: express.Response) => {
  try {
    const data = await fs.readFile(
      path.join(mockDataPath, req.params.symbol, req.params.folder, 'chain.json'),
      'utf-8',
    );
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(StatusCodes.NOT_FOUND).json({ error: 'Mock chain data not found' });
  }
};

const getMockInstrumentsData = async (req: express.Request, res: express.Response) => {
  try {
    const data = await fs.readFile(
      path.join(mockDataPath, req.params.symbol, req.params.folder, 'instruments.json'),
      'utf-8',
    );
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(StatusCodes.NOT_FOUND).json({ error: 'Mock instrument data not found' });
  }
};

const getMockMarketData = async (req: express.Request, res: express.Response) => {
  try {
    const folderPath = path.join(mockDataPath, req.params.symbol, req.params.folder);
    const data = await fs.readFile(path.join(folderPath, `${req.params.index}.json`), 'utf-8');
    const marketData = JSON.parse(data);

    const nextIndex = parseInt(req.params.index) + 1;
    try {
      await fs.access(path.join(folderPath, `${nextIndex}.json`));
      marketData.nextDataUrl = `/data/mock/${req.params.symbol}/${req.params.folder}/market-data/${nextIndex}`;
    } catch {
      // No next file exists
    }

    res.json(marketData);
  } catch (error) {
    res.status(StatusCodes.NOT_FOUND).json({ error: 'Mock market data not found' });
  }
};

// Register routes
dataRouter.post('/', validateRequest(StoreDataSchema), dataController.storeData);
dataRouter.get('/mock/:symbol/:folder/chain', getMockChainData);
dataRouter.get('/mock/:symbol/:folder/instruments', getMockInstrumentsData);
dataRouter.get('/mock/:symbol/:folder/market-data/:index', getMockMarketData);
