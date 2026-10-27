export function resolveRoll20AssetUrl(
  value: string,
  htmlUrl: string | undefined,
  origin = typeof window === 'undefined' ? undefined : window.location.origin,
): string {
  // A missing portrait must stay empty so playback can inherit the last one.
  // Resolving an empty URL would otherwise return the log HTML itself.
  if (!value.trim()) return '';
  if (!htmlUrl) return value;

  const baseUrl = new URL(htmlUrl, origin);
  const mediaMatch = value.match(/^\/images\/afterTheRoll\/.+?\/media\/(.+)$/i);

  // Some exports retain a corrupted folder name; use the log's own folder.
  if (mediaMatch) return new URL(`media/${mediaMatch[1]}`, baseUrl).toString();

  if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(value)) return value;
  return new URL(value, baseUrl).toString();
}
