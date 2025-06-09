import { ISidePanelConfiguration, SidePanelApp } from '@src/side-panel/side-panel.app';
const configuration: ISidePanelConfiguration = {};
import './index.css';

declare global {
  // eslint-disable-next-line no-var
  var logger: (message: unknown) => void;
}
globalThis.logger = (message: unknown) =>
  chrome.runtime
    .sendMessage({ type: 'doomberg:console.log', message })
    .catch(error => console.log('send message to console.log error: ', error));

try {
  const sidePanel = new SidePanelApp(configuration);
  sidePanel.start();
} catch (error) {
  console.log(error);
}
