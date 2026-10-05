import fs from 'fs';
import path from 'path';
import bundledCharacterArchive from '@/content/characters.json';
import { TRPG_ASSET_PREFIX, TRPG_PUBLIC_ROOT } from '@/lib/trpgSource';

export type CharacterCrop = { x: number; y: number; zoom: number };
export type CharacterLink = { name: string; url: string };
export type CharacterCopyright = { name: string; url?: string };
export type CharacterSticker = {
  src: string;
  /** Detail-card sticker scale. Older entries without this use the default. */
  size?: number;
};

export type CharacterStat = { label: string; value: string };

export type CocCharacterData = {
  characteristics: CharacterStat[];
};

export type ShinobigamiCharacterData = {
  rank?: string;
  faction?: string;
  subfaction?: string;
  setting?: string;
  ninpo: string[];
  secretArt?: { name: string; type: string };
};

export type InsaneCharacterData = {
  color?: string;
  abilities: string[];
};

export type Character = {
  id: string;
  name: string;
  alias?: string;
  catchphrase?: string;
  color?: string;
  age?: string;
  gender?: string;
  heightWeight?: string;
  occupation?: string;
  species?: string;
  personality?: string;
  /** Rule selected from the play-list rule options. */
  rule?: string;
  coc?: CocCharacterData;
  shinobigami?: ShinobigamiCharacterData;
  insane?: InsaneCharacterData;
  linkItems?: CharacterLink[];
  copyright?: CharacterCopyright;
  stickers?: CharacterSticker[];
  portrait: { original: string; cropped: string; crop: CharacterCrop };
  links: Record<string, string | undefined>;
  sessionKeys: string[];
  createdAt: string;
  updatedAt: string;
};

const CHARACTER_ARCHIVE_PATH = path.join(TRPG_PUBLIC_ROOT, 'characters', 'characters.json');
const CHARACTER_IMAGE_PATH_PREFIX = '/images/characters/';
const DEPLOYED_CHARACTER_IMAGE_PATH_PREFIX = `${process.env.NEXT_PUBLIC_BASE_PATH ?? '/AfterTheRoll'}${CHARACTER_IMAGE_PATH_PREFIX}`;

type CharacterArchive = { characters?: Character[] };

function toCharacterAssetUrl(value: string) {
  const prefix = value.startsWith(CHARACTER_IMAGE_PATH_PREFIX)
    ? CHARACTER_IMAGE_PATH_PREFIX
    : value.startsWith(DEPLOYED_CHARACTER_IMAGE_PATH_PREFIX)
      ? DEPLOYED_CHARACTER_IMAGE_PATH_PREFIX
      : null;
  if (!prefix) return value;
  return `${TRPG_ASSET_PREFIX}/characters/${value.slice(prefix.length)}`;
}

export function getCharacters(): Character[] {
  // The deploy workflow deliberately stages the public character index in
  // src/content. The live archive remains the source only while developing,
  // so production static exports do not depend on a file outside the bundle.
  try {
    const archive: CharacterArchive = process.env.NODE_ENV === 'development'
      ? JSON.parse(fs.readFileSync(CHARACTER_ARCHIVE_PATH, 'utf8'))
      : bundledCharacterArchive;
    if (!Array.isArray(archive.characters)) return [];

    return (archive.characters as Character[]).map((character) => ({
      ...character,
      portrait: {
        ...character.portrait,
        original: toCharacterAssetUrl(character.portrait.original),
        cropped: toCharacterAssetUrl(character.portrait.cropped),
      },
      stickers: character.stickers?.map((sticker) => ({ ...sticker, src: toCharacterAssetUrl(sticker.src) })),
    }));
  } catch {
    return [];
  }
}
