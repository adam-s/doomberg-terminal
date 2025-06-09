import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from '@shared/services/log.service';
import { IApplicationService } from './application.service';

export interface IRemoteService {
  _serviceBrand: undefined;
  start: () => Promise<void>;
}

export const IRemoteService = createDecorator<IRemoteService>('remoteService');

export class RemoteServerService extends Disposable implements IRemoteService {
  declare readonly _serviceBrand: undefined;

  constructor(
    @ILogService private readonly logService: ILogService,
    @IApplicationService private readonly applicationService: IApplicationService,
  ) {
    super();
    this._registerListeners();
  }

  _registerListeners() {}

  async start() {}
}
