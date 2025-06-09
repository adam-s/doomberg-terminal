import { IContentMainConfiguration, ContentMainApp } from '@src/contentMain.app';

const configuration: IContentMainConfiguration = {};

try {
  const content = new ContentMainApp(configuration);
  content.start();
} catch (error) {
  console.log(error);
}
