import { Disposable, type IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IIpcProxyManagerService =
  createDecorator<IIpcProxyManagerService>('ipcProxyManagerService');

export interface IIpcProxyManagerService extends IDisposable {
  readonly _serviceBrand: undefined;
}

export class IpcProxyManagerService extends Disposable implements IIpcProxyManagerService {
  public readonly _serviceBrand: undefined;

  public constructor() {
    super();
  }

  public override dispose(): void {
    super.dispose();
  }
}
