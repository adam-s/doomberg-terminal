import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  IOptionsChain,
  IOptionsInstrument,
  IOptionsMarketData,
} from '@shared/services/request.types';

extendZodWithOpenApi(z);

// Request schemas
export const GetOpenInterestSchema = z.object({
  query: z.object({
    date: z.string(),
    symbol: z.string(),
  }),
});

export const StoreOpenInterestSchema = z.object({
  body: z.object({
    date: z.string(),
    symbol: z.string(),
    chain: z.custom<IOptionsChain>(),
    instruments: z.record(z.string(), z.custom<IOptionsInstrument>()),
    marketData: z.record(z.string(), z.custom<IOptionsMarketData>()),
  }),
});

// Response schemas
export const StoreOpenInterestResponseSchema = z.object({
  ok: z.boolean(),
});

export interface RawOpenInterestData {
  chain: IOptionsChain;
  instruments: Record<string, IOptionsInstrument>;
  marketData: Record<string, IOptionsMarketData>;
}

// Type exports
export type GetOpenInterestRequest = z.infer<typeof GetOpenInterestSchema>;
export type StoreOpenInterestRequest = z.infer<typeof StoreOpenInterestSchema>;
export type StoreOpenInterestResponse = z.infer<typeof StoreOpenInterestResponseSchema>;
