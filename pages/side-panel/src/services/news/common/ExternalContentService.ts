import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';
import { TabService } from '../../utils/TabService';
import { IScriptInjectorService } from '../../utils/ScriptInjectorService';
import { extractLinkAndText } from '../../utils/LinkExtraction';

/**
 * Result of fetching and optionally converting external content
 */
export interface ExternalContentResult {
  contentToAnalyze: string;
  wasProcessedAsExternal: boolean;
  externalUrl?: string;
}

/**
 * Simple page source fetcher to run inside the target tab.
 */
const getPageSourceWhenLoaded = async (): Promise<string> => {
  if (document.readyState === 'complete') {
    await new Promise(res => setTimeout(res, 100));
    return document.documentElement.outerHTML;
  }
  return new Promise<string>(resolve => {
    window.addEventListener(
      'load',
      async () => {
        await new Promise(r => setTimeout(r, 100));
        resolve(document.documentElement.outerHTML);
      },
      { once: true },
    );
  });
};

/**
 * Determines if a URL is internal based on a whitelist of domains.
 */
function isInternalLink(urlStr: string, internalDomains: string[]): boolean {
  try {
    const url = new URL(urlStr, location.origin);
    return internalDomains.some(domain => url.hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Identifies the first external link in HTML and fetches its content.
 */
export async function identifyAndFetchExternalContent(
  originalHtml: string,
  tabService: TabService,
  scriptInjector: IScriptInjectorService,
  statusId: string,
  internalDomains: string[] = ['truthsocial.com'],
): Promise<ExternalContentResult> {
  const { href, nonLinkText } = extractLinkAndText(originalHtml);
  if (!href || isInternalLink(href, internalDomains) || nonLinkText.length > 20) {
    return {
      contentToAnalyze: originalHtml,
      wasProcessedAsExternal: false,
      externalUrl: href ?? undefined,
    };
  }

  let externalTabId: number | undefined;
  try {
    externalTabId = await tabService.openTab(new URL(href, location.origin).href, false);
    const fetchedHtml = await scriptInjector.executeScript<[], string>(
      externalTabId,
      getPageSourceWhenLoaded,
      [],
    );
    if (fetchedHtml?.trim()) {
      const md = convertHtmlToMarkdown(fetchedHtml);
      if (md.trim()) {
        return { contentToAnalyze: md, wasProcessedAsExternal: true, externalUrl: href };
      }
    }
  } catch {
    // swallow errors
  } finally {
    if (externalTabId !== undefined) {
      await tabService.closeTab(externalTabId);
    }
  }

  return { contentToAnalyze: originalHtml, wasProcessedAsExternal: false, externalUrl: href };
}
