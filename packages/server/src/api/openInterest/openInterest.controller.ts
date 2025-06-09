import { type Request, type Response } from 'express';
import { openInterestService } from './openInterest.service';
import {
  type GetOpenInterestRequest,
  type StoreOpenInterestRequest,
} from '../../data-layer/openInterest/openInterest.model';

class OpenInterestController {
  public storeRawData = async (
    req: Request<unknown, unknown, StoreOpenInterestRequest['body']>,
    res: Response,
  ) => {
    const { date, symbol, chain, instruments, marketData } = req.body;
    await openInterestService.storeRawData(date, symbol, { chain, instruments, marketData });
    res.json({ ok: true });
  };

  public getRawData = async (
    req: Request<unknown, unknown, unknown, GetOpenInterestRequest['query']>,
    res: Response,
  ) => {
    const { date, symbol } = req.query;
    const data = await openInterestService.getRawData(date, symbol);
    res.json(data);
  };
}

export const openInterestController = new OpenInterestController();
