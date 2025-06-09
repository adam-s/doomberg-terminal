import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Server } from '@shared/ipc/server';
import { createPortWorker2SidePanel } from '../ipc/createPortWorker2SidePanel';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { TextToTextService, TEXT_TO_TEXT_SERVICE_ID } from './textToText.service';

export class TextToTextWorkerApp extends Disposable {
  private static readonly CLASS_NAME = 'TextToTextWorkerApp';
  private readonly disposables: DisposableStore;
  private readonly server: Server;

  public constructor() {
    super();
    this.disposables = this._register(new DisposableStore());
    const onConn = createPortWorker2SidePanel();
    this.server = this.disposables.add(new Server(onConn));
  }

  public async start(): Promise<void> {
    const textToTextService = new TextToTextService();
    const textToTextChannel = ProxyChannel.fromService(textToTextService, this.disposables);
    this.server.registerChannel(TEXT_TO_TEXT_SERVICE_ID, textToTextChannel);
    // eslint-disable-next-line no-console
    console.log(`${TextToTextWorkerApp.CLASS_NAME} started`);
  }

  public override dispose(): void {
    super.dispose();
    // eslint-disable-next-line no-console
    console.log(`${TextToTextWorkerApp.CLASS_NAME} disposed`);
  }
}
