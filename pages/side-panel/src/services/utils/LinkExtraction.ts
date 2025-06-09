/**
 * Extracts the first hyperlink and its context from HTML.
 */
export interface ParsedLinkExtractionResult {
  href: string | null;
  linkText: string;
  nonLinkText: string;
  rawHtmlLinkContent: string;
}

/**
 * Parses HTML string to find the first <a> and surrounding text.
 */
export function extractLinkAndText(htmlContent: string): ParsedLinkExtractionResult {
  const container = document.createElement('div');
  container.innerHTML = htmlContent;
  const anchor = container.querySelector('a[href]');
  if (!anchor) {
    const text = container.textContent?.trim() ?? '';
    return { href: null, linkText: '', nonLinkText: text, rawHtmlLinkContent: '' };
  }
  const href = anchor.getAttribute('href')!;
  const linkText = anchor.textContent?.trim() ?? '';
  const rawHtmlLinkContent = anchor.innerHTML;
  // Clone, remove <a>, then get non-link text
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelector('a')?.remove();
  const nonLinkText = clone.textContent?.trim() ?? '';
  return { href, linkText, nonLinkText, rawHtmlLinkContent };
}
