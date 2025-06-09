import { IContentInjectedConfiguration, ContentInjectedApp } from '@src/content-injected.app';

const configuration: IContentInjectedConfiguration = {};

let content: ContentInjectedApp | undefined;

const loader = () => {
  content?.dispose();
  content = new ContentInjectedApp(configuration);
  content.start();
};

// Listen for reload messages from side panel
chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'DOOMBERG_SIDE_PANEL_RELOAD') {
    console.log('Content Injected script received reload message from side panel');
    try {
      loader();
    } catch (error) {
      console.log(error);
    }
  }
});

try {
  loader();
} catch (error) {
  console.log(error);
}
