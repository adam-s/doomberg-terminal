// StockDataAccessObject.ts

import { BaseDataAccessObject } from '@shared/storage/dexie/dataAccessObject/BaseDataAccessObject';
import { DatabasePlugin } from '@shared/storage/dexie/dataAccessObject/DatabasePlugin';
import { Dexie, type Table } from 'dexie';

export const stockSchema = {
  1: '++id, ticker',
};

export interface IStockModel {
  id: string;
  ticker: string;
}

export class StockDataAccessObject extends BaseDataAccessObject<IStockModel, string> {
  constructor(db: Dexie) {
    super(db.table('stocks'), 'stocks');
  }

  get table(): Table<IStockModel, string> {
    return this._table;
  }

  static plugin: DatabasePlugin<IStockModel, string> = {
    tableName: 'stocks',
    schema: stockSchema,
    modelClass: class StockModel implements IStockModel {
      id!: string;
      ticker!: string;
    },
    daoClass: StockDataAccessObject,
  };
}
