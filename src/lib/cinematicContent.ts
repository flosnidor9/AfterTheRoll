export type CinematicContent = {
  contentHtml: string;
  cinematicImage?: { src: string; alt: string };
};

/** Separate photographs from dialogue while preserving their original order. */
export function splitCinematicContent(html: string, baseUrl?: string): CinematicContent[] {
  if (!/<img\b/i.test(html)) return [{ contentHtml: html }];
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const join = (parts: CinematicContent[]): CinematicContent[] => parts.reduce<CinematicContent[]>((result, part) => {
    const previous = result.at(-1);
    if (previous && !previous.cinematicImage && !part.cinematicImage) previous.contentHtml += part.contentHtml;
    else result.push({ ...part });
    return result;
  }, []);

  const visit = (node: Node): CinematicContent[] => {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      const container = doc.createElement('div');
      container.appendChild(node.cloneNode(true));
      return [{ contentHtml: container.innerHTML }];
    }
    const element = node as HTMLElement;
    // Dice icons are part of their result card, not scene photographs.
    if (element.matches('table, [class*="sheet-rolltemplate-"], audio, video')) return [{ contentHtml: element.outerHTML }];
    if (element.matches('img[src]')) {
      const src = element.getAttribute('src')?.trim();
      if (src) {
        try {
          const url = new URL(src, baseUrl ?? window.location.href);
          if (['http:', 'https:', 'blob:'].includes(url.protocol) || /^data:image\//i.test(src)) {
            return [{ contentHtml: '', cinematicImage: { src: url.href, alt: element.getAttribute('alt') || '로그 이미지' } }];
          }
        } catch { /* Keep unsupported images in the sanitized source content. */ }
      }
    }
    if (!element.querySelector('img')) return [{ contentHtml: element.outerHTML }];
    return join(Array.from(element.childNodes).flatMap(visit)).map(part => {
      if (part.cinematicImage) return part;
      const wrapper = element.cloneNode(false) as HTMLElement;
      wrapper.innerHTML = part.contentHtml;
      return { contentHtml: wrapper.outerHTML };
    });
  };

  const parts = join(Array.from(doc.body.childNodes).flatMap(visit));
  if (!parts.some(part => part.cinematicImage)) return [{ contentHtml: html }];
  return parts.filter(part => {
    if (part.cinematicImage) return true;
    const content = doc.createElement('div');
    content.innerHTML = part.contentHtml;
    return Boolean(content.textContent?.trim() || content.querySelector('audio, video, iframe, table, hr'));
  });
}
