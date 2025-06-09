import { HttpLogger } from 'pino-http';
import { Server as HTTPServer } from 'http';
import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IApplicationService {
  _serviceBrand: undefined;
  start: () => Promise<void>;
}

export const IApplicationService = createDecorator<IApplicationService>('applicationService');

export class ApplicationService extends Disposable implements IApplicationService {
  declare readonly _serviceBrand: undefined;

  constructor(
    readonly server: HTTPServer,
    readonly logger: HttpLogger['logger'],
  ) {
    super();
    this._registerListeners();
  }

  _registerListeners() {}

  async start() {}
}
