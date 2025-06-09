import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from '@shared/services/log.service';
import { ISettingsService } from '@shared/services/settings.service';
import { DocumentMessage, DocumentResponse } from '@shared/utils/message';
import { checkSidePanelStatus, sendErrorResponse } from '../utils/utils';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';

export interface ISidePanelVisibilityService {
  _serviceBrand: undefined;
  start: () => Promise<void>;
}

export const ISidePanelVisibilityService =
  createDecorator<ISidePanelVisibilityService>('shutdownService');

export class SidePanelVisibilityService extends Disposable implements ISidePanelVisibilityService {
  declare readonly _serviceBrand: undefined;

  constructor(
    @ILogService private readonly logService: ILogService,
    @ISettingsService private readonly settingsService: ISettingsService,
  ) {
    super();
    this._registerListeners();
    this._verifyPanelStatus();
  }

  private async _verifyPanelStatus() {
    const openPanels = await this.settingsService.getOpenSidePanels();
    for (const windowId of openPanels) {
      const isActuallyOpen = await checkSidePanelStatus(windowId);
      if (!isActuallyOpen) {
        await this.settingsService.setSidePanelStatus(false, windowId);
      }
    }
  }

  _registerListeners() {
    chrome.runtime.onMessage.addListener(
      (
        message: DocumentMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: DocumentResponse) => void,
      ) => {
        if (!message?.type) {
          sendErrorResponse('Invalid message format', sendResponse);
          return false;
        }

        switch (message.type) {
          case 'doomberg:sidePanelVisibilityChange': {
            const { windowId } = message;
            checkSidePanelStatus(windowId).then(isOpen => {
              console.log(isOpen ? 'side panel open' : 'side panel closed');
              this.settingsService.setSidePanelStatus(isOpen, windowId);
            });
            return false;
          }

          default:
            return false;
        }
      },
    );
  }

  async start() {}
}
registerSingleton(ISidePanelVisibilityService, SidePanelVisibilityService, InstantiationType.Eager);
