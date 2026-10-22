import "server-only";
import type { Readable } from "node:stream";

export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface StorageDriver {
  /** Where the browser should PUT the file bytes. */
  createUploadTarget(
    key: string,
    opts: { assetId: string; contentType: string; bytes: number },
  ): Promise<UploadTarget>;
  /** Size of the stored object, or null if it doesn't exist. */
  size(key: string): Promise<number | null>;
  /** Reads the object (optionally a byte range, inclusive end). */
  read(key: string, range?: { start: number; end: number }): Promise<Readable>;
  /**
   * A short-lived URL the browser can fetch the object from, or null when the
   * app must stream it itself (local driver).
   */
  directDownloadUrl(
    key: string,
    opts: { filename: string; contentType: string; inline: boolean },
  ): Promise<string | null>;
  /** Server-side copy (used to snapshot an upload before it is checked and served). */
  copy(fromKey: string, toKey: string): Promise<void>;
  delete(key: string): Promise<void>;
}
