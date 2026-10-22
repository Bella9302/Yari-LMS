import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { StorageDriver } from "@/server/storage/driver";
import { signUpload } from "@/server/storage/signing";

export class TooLargeError extends Error {}

/** Files on the app server's disk. For development and single-server installs. */
export class LocalStorage implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async createUploadTarget(_key: string, opts: { assetId: string; contentType: string }) {
    const exp = Date.now() + 30 * 60 * 1000;
    return {
      url: `/api/uploads/${opts.assetId}?exp=${exp}&sig=${signUpload(opts.assetId, exp)}`,
      method: "PUT" as const,
      headers: { "Content-Type": opts.contentType },
    };
  }

  /** Used by the local upload route. Stops (and deletes the partial file) past `maxBytes`. */
  async write(key: string, body: Readable, maxBytes: number) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    let seen = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        seen += chunk.length;
        if (seen > maxBytes) cb(new TooLargeError("File is larger than declared"));
        else cb(null, chunk);
      },
    });
    try {
      await pipeline(body, limiter, createWriteStream(file));
    } catch (err) {
      await rm(file, { force: true });
      throw err;
    }
    return seen;
  }

  async size(key: string) {
    try {
      return (await stat(this.resolve(key))).size;
    } catch {
      return null;
    }
  }

  async read(key: string, range?: { start: number; end: number }) {
    return createReadStream(this.resolve(key), range);
  }

  async directDownloadUrl() {
    return null;
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}
