import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IRouterService {
  _serviceBrand: undefined;
}

export const IRouterService = createDecorator<IRouterService>('routerService');

export class RouterService extends Disposable implements IRouterService {
  declare readonly _serviceBrand: undefined;
  constructor() {
    super();
  }
}
