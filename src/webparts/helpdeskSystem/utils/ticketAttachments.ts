export const attachmentAccept = '.pdf,.doc,.docx,.mp4,.jpeg,.jpg,.webp,.png';
export function validateTicketAttachments(files: Array<{ name: string; size: number }>): void {
  if (files.length > 10) throw new Error('You can attach up to 10 files.');
  const names = new Set<string>();
  files.forEach(file => {
    if (file.name.length > 255 || file.name !== file.name.trim() || file.name.endsWith('.')) throw new Error(`${file.name}: use a filename of up to 255 characters without leading/trailing spaces or a trailing dot.`);
    if (!/\.(pdf|docx?|mp4|jpe?g|webp|png)$/i.test(file.name)) throw new Error(`${file.name}: use PDF, Word, MP4, JPEG, JPG, WebP, or PNG.`);
    if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name}: each file must be 5 MB or smaller.`);
    if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error(`${file.name}: empty or invalid files cannot be uploaded.`);
    // eslint-disable-next-line no-control-regex -- Control characters must be rejected in uploaded file names.
    if (/[\x00-\x1f"*:<>?\/\\|]/.test(file.name)) throw new Error(`${file.name}: rename this file to remove unsupported characters.`);
    const name = file.name.toLowerCase();
    if (names.has(name)) throw new Error(`A file named ${file.name} has already been selected.`);
    names.add(name);
  });
}
