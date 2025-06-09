import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from '@shared/services/log.service';
import { IApplicationService } from './application.service';
import { IRequestService } from '@shared/services/request.service';

export interface IDataService {
  _serviceBrand: undefined;
  start: () => Promise<void>;
}

export const IDataService = createDecorator<IDataService>('dataService');

export class DataService extends Disposable implements IDataService {
  declare readonly _serviceBrand: undefined;

  constructor(
    @IRequestService private readonly requestService: IRequestService,
    @ILogService private readonly logService: ILogService,
    @IApplicationService private readonly applicationService: IApplicationService,
  ) {
    super();
    this._registerListeners();
  }

  _registerListeners() {}
  async start() {
    this.requestService
      .fetchOptionsChains('AAPL')
      .then(() => console.log('options chains'))
      .catch(() => console.error('options chains error'));
  }

  // This will allow for graceful shutdown of the server. Not needed yet.
  // override dispose(): void {}
}
