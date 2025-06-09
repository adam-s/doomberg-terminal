import type { Request, RequestHandler, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { dataService } from '@src/api/data/data.service';
import { logger } from '@src/server';

class DataController {
  public storeData: RequestHandler = async (req: Request, res: Response) => {
    try {
      const result = await dataService.store(req.body);

      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Data stored successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error in storeData controller:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Internal server error while storing data',
        error: (error as Error).message,
      });
    }
  };
}

export const dataController = new DataController();
