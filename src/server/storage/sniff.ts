// Checks a file's leading bytes match its declared type, so a renamed executable can't pose as a PDF.

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const ZIP = [0x50, 0x4b, 0x03, 0x04];

const CHECKS: Record<string, (head: Buffer) => boolean> = {
  "application/pdf": (h) => startsWith(h, ascii("%PDF-")),
  "image/png": (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": (h) => startsWith(h, [0xff, 0xd8, 0xff]),
  "image/webp": (h) => startsWith(h, ascii("RIFF")) && startsWith(h, ascii("WEBP"), 8),
  "video/mp4": (h) => startsWith(h, ascii("ftyp"), 4),
  "video/webm": (h) => startsWith(h, [0x1a, 0x45, 0xdf, 0xa3]),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (h) => startsWith(h, ZIP),
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (h) => startsWith(h, ZIP),
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": (h) => startsWith(h, ZIP),
  "text/csv": isText,
  "text/plain": isText,
};

function isText(head: Buffer): boolean {
  if (head.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(trimPartialUtf8(head));
    return true;
  } catch {
    return false;
  }
}

// The sample may cut a multi-byte character in half; drop an incomplete trailing sequence.
function trimPartialUtf8(buf: Buffer): Buffer {
  for (let i = Math.max(0, buf.length - 3); i < buf.length; i++) {
    const b = buf[i]!;
    const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
    if (need > 1 && i + need > buf.length) return buf.subarray(0, i);
  }
  return buf;
}

export function contentMatchesType(mime: string, head: Buffer): boolean {
  const check = CHECKS[mime];
  return Boolean(check && head.length > 0 && check(head));
}

export const SNIFF_BYTES = 4096;
