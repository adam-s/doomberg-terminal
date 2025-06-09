// Utility to extract the first link and surrounding text from HTML content
// Adheres to Airbnb style guide and project TypeScript standards

import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';
import { TabService } from '../services/TabService';
import { ScriptInjectorService } from '../services/ScriptInjectorService';

export interface ParsedLinkExtractionResult {
  href: string | null;
  linkText: string;
  nonLinkText: string;
  rawHtmlLinkContent: string;
}

export interface ExternalContentResult {
  contentToAnalyze: string;
  wasProcessedAsExternal: boolean;
  externalUrl?: string;
}

/**
 * Parses HTML content to extract the first anchor tag's href, visible text, and non-link text.
 * @param htmlContent - The HTML string to parse.
 * @returns ParsedLinkExtractionResult
 */
export function extractLinkAndText(htmlContent: string): ParsedLinkExtractionResult {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  const firstAnchor = tempDiv.querySelector('a');

  if (firstAnchor && firstAnchor.hasAttribute('href')) {
    const linkHref = firstAnchor.getAttribute('href');
    const linkText = (firstAnchor.textContent || '').replace(/\s+/g, ' ').trim();
    const rawHtmlLinkContent = firstAnchor.innerHTML;
    // Remove the anchor to get non-link text
    const clonedDiv = tempDiv.cloneNode(true) as HTMLDivElement;
    const anchorInClone = clonedDiv.querySelector('a');
    if (anchorInClone) {
      anchorInClone.remove();
    }
    const nonLinkText = (clonedDiv.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      href: linkHref,
      linkText,
      nonLinkText,
      rawHtmlLinkContent,
    };
  }
  // No anchor with href found
  const allText = (tempDiv.textContent || '').replace(/\s+/g, ' ').trim();
  return {
    href: null,
    linkText: '',
    nonLinkText: allText,
    rawHtmlLinkContent: '',
  };
}

// This function will be executed in the target tab's context
const getPageSourceWhenLoaded = async (): Promise<string> => {
  if (document.readyState === 'complete') {
    // Optional: short delay for any final dynamic content rendering.
    // MV3's promise handling for injected scripts is robust, so this might not be strictly necessary.
    await new Promise(resolve => setTimeout(resolve, 100)); // Reduced delay
    return document.documentElement.outerHTML;
  }
  const value = await new Promise<string>(resolve => {
    window.addEventListener(
      'load',
      async () => {
        // Optional: short delay after load event for any final dynamic content.
        await new Promise(innerResolve => setTimeout(innerResolve, 100)); // Reduced delay
        resolve(document.documentElement.outerHTML);
      },
      { once: true },
    );
  });

  return value;
};

function isInternalLink(linkHref: string, internalDomains: string[]): boolean {
  try {
    const url = new URL(linkHref, self.location.origin);
    return internalDomains.some(domain => url.hostname.includes(domain));
  } catch {
    return false;
  }
}

export async function identifyAndFetchExternalContent(
  originalHtmlContent: string,
  statusId: string,
  tabService: TabService,
  scriptInjector: ScriptInjectorService,
  internalDomains?: string[],
): Promise<ExternalContentResult> {
  const domains = internalDomains ?? [];
  const { href: linkHref, nonLinkText } = extractLinkAndText(originalHtmlContent);

  if (linkHref && !isInternalLink(linkHref, domains) && nonLinkText.length < 20) {
    let externalTabId: number | undefined;
    try {
      const absoluteLinkHref = new URL(linkHref, self.location.origin).href;
      externalTabId = await tabService.openTab(absoluteLinkHref, false);

      // Pass the async function directly. ScriptInjectorService is assumed to handle it.
      const fetchedPageHtml = await scriptInjector.executeScript<
        [], // Arguments for the function (none in this case)
        string // The expected resolved type of the promise returned by the function
      >(externalTabId, getPageSourceWhenLoaded, []);
      if (externalTabId) {
        await tabService.closeTab(externalTabId);
        externalTabId = undefined;
      }

      if (typeof fetchedPageHtml === 'string' && fetchedPageHtml.trim() !== '') {
        const markdownContent = convertHtmlToMarkdown(fetchedPageHtml);
        if (markdownContent.trim() !== '') {
          return {
            contentToAnalyze: markdownContent,
            wasProcessedAsExternal: true,
            externalUrl: linkHref,
          };
        }
      }
    } catch (error: unknown) {
      if (externalTabId) {
        try {
          await tabService.closeTab(externalTabId);
        } catch {
          // ignore
        }
      }
    }
    return {
      contentToAnalyze: originalHtmlContent,
      wasProcessedAsExternal: false,
      externalUrl: linkHref,
    };
  }
  return {
    contentToAnalyze: originalHtmlContent,
    wasProcessedAsExternal: false,
    externalUrl: linkHref || undefined,
  };
}
