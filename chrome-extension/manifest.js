import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('../package.json', 'utf8'));

const isFirefox = process.env.__FIREFOX__ === 'true';

const sidePanelConfig = {
  side_panel: {
    default_path: 'side-panel/index.html',
  },
  permissions: !isFirefox ? ['sidePanel'] : [],
};

const permissions = [
  'scripting',
  'tabs',
  'storage',
  'webNavigation',
  'declarativeNetRequest',
  'webRequest',
  'tabGroups',
  'alarms',
  'clipboardWrite',
  'activeTab',
];

/**
 * After changing, please reload the extension at `chrome://extensions`
 * @type {chrome.runtime.ManifestV3}
 */
const manifest = Object.assign(
  {
    manifest_version: 3,
    default_locale: 'en',
    /**
     * if you want to support multiple languages, you can use the following reference
     * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization
     */
    name: '__MSG_extensionName__',
    version: packageJson.version,
    description: '__MSG_extensionDescription__',
    permissions: permissions.concat(sidePanelConfig.permissions),
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    background: {
      service_worker: 'background.iife.js',
      type: 'module',
    },
    action: {
      // default_popup: 'popup/index.html',
      default_icon: 'icon-34.png',
    },
    icons: {
      128: 'icon-128.png',
    },
    content_scripts: [
      {
        matches: [
          'https://robinhood.com/',
          'https://robinhood.com/options/*',
          'https://robinhood.com/stocks/*',
        ],
        js: ['content/index.iife.js'],
        all_frames: false,
      },
      {
        matches: [
          'https://robinhood.com/',
          'https://robinhood.com/options/*',
          'https://robinhood.com/stocks/*',
        ],
        js: ['content-main/index.iife.js'],
        all_frames: false,
        runAt: 'document_start',
        world: 'MAIN',
      },
      {
        matches: ['<all_urls>'],
        js: ['content-injected/index.iife.js'],
        all_frames: false,
        runAt: 'document_start',
      },
    ],
    web_accessible_resources: [
      {
        resources: ['*.js', '*.css', '*.svg', 'icon-128.png', 'icon-34.png'],
        matches: ['*://*/*'],
      },
    ],
    host_permissions: [
      '*://*.robinhood.com/*',
      '*://*.truthsocial.com/*',
      '*://*.chatgpt.com/*',
      '*://*.investing.com/*',
    ],
    declarative_net_request: {
      rule_resources: [
        {
          id: 'block-rb',
          enabled: true,
          path: 'declarative-net-request.json',
        },
      ],
    },
  },
  !isFirefox && { side_panel: { ...sidePanelConfig.side_panel } },
);

export default manifest;
