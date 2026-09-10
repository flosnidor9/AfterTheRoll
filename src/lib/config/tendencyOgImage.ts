import { OG_IMAGE_URLS } from '@/lib/config/site';

const TENDENCY_DOCUMENT_PATH = 'profile_config/tendency';
const FIRESTORE_API_ROOT = 'https://firestore.googleapis.com/v1';

type FirestoreTendencyDocument = {
  fields?: {
    handle?: {
      stringValue?: string;
    };
  };
};

function normalizeTwitterHandle(handle: string) {
  return handle
    .trim()
    .replace(/^@+/, '')
    .replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '')
    .split(/[/?#]/)[0];
}

/**
 * Reads the public tendency profile while generating the static site, so the
 * social-preview avatar follows the profile's configured X handle.
 */
export async function getTendencyOgImageUrl() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!projectId || !apiKey) return OG_IMAGE_URLS.afterTheRoll;

  try {
    const response = await fetch(
      `${FIRESTORE_API_ROOT}/projects/${projectId}/databases/(default)/documents/${TENDENCY_DOCUMENT_PATH}?key=${apiKey}`,
      { cache: 'force-cache' },
    );

    if (!response.ok) return OG_IMAGE_URLS.afterTheRoll;

    const document = (await response.json()) as FirestoreTendencyDocument;
    const handle = normalizeTwitterHandle(document.fields?.handle?.stringValue ?? '');

    return handle ? `https://unavatar.io/x/${encodeURIComponent(handle)}` : OG_IMAGE_URLS.afterTheRoll;
  } catch {
    return OG_IMAGE_URLS.afterTheRoll;
  }
}
