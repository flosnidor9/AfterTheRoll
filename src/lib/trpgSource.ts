import path from 'path';

const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const LOCAL_TRPG_PUBLIC_ROOT = path.join(PUBLIC_ROOT, 'trpg-logs');
const DEPLOYED_TRPG_PUBLIC_ROOT = PUBLIC_ROOT;

/**
 * In development this is a directory junction to the sibling Trpg-Logs
 * repository. Production builds keep using the files staged by the deploy
 * workflow, so static export remains self-contained.
 */
export const TRPG_PUBLIC_ROOT = process.env.NODE_ENV === 'development'
  ? LOCAL_TRPG_PUBLIC_ROOT
  : DEPLOYED_TRPG_PUBLIC_ROOT;

export const TRPG_IMAGES_ROOT = path.join(TRPG_PUBLIC_ROOT, 'images');
export const TRPG_ARCHIVE_ROOT = path.join(TRPG_IMAGES_ROOT, 'afterTheRoll');

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '/AfterTheRoll';

export const TRPG_ASSET_PREFIX = process.env.NODE_ENV === 'development'
  ? '/trpg-logs/images'
  : `${BASE_PATH}/images`;

export function trpgAssetUrl(...segments: string[]) {
  return `${TRPG_ASSET_PREFIX}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}
