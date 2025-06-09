import { IContentConfiguration, ContentApp } from '@src/content.app';

const configuration: IContentConfiguration = {};

try {
  const content = new ContentApp(configuration);
  content.start();
} catch (error) {
  console.log(error);
}
