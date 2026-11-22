import type { TrpgUploadDraft } from '@/lib/trpgUpload';

// Include local attachments before encrypting, so a locked log never creates
// separate public image URLs. External URLs retain their original permissions.
export function inlineLogMedia(draft: TrpgUploadDraft) {
  let sourceHtml = draft.sourceHtml;
  const urls = new Map<string, string>();
  for (const file of draft.mediaFiles ?? []) {
    const extension = file.name.split('.').at(-1)?.toLowerCase();
    const mime = ({ jpg: 'jpeg', jpeg: 'jpeg', png: 'png', apng: 'png', gif: 'gif', webp: 'webp' } as Record<string, string>)[extension || ''];
    if (!mime) throw new Error('로그 첨부 이미지는 PNG/JPEG/GIF/WebP만 사용할 수 있습니다.');
    urls.set(`media/${file.name}`, `data:image/${mime};base64,${file.content}`);
  }
  for (const [path, value] of urls) sourceHtml = sourceHtml.replaceAll(path, value);
  return { ...draft, sourceHtml, mediaFiles: undefined, cast: draft.cast.map(entry => ({ ...entry, iconSrc: urls.get(entry.iconSrc) ?? entry.iconSrc })) };
}
