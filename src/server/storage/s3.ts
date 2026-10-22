import "server-only";
import { Readable } from "node:stream";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageDriver } from "@/server/storage/driver";

/**
 * Amazon S3 (or any S3-compatible store). Browsers upload and download via short-lived presigned URLs,
 * so file bytes never pass through the app server. The bucket must allow CORS PUT from the app's origin.
 */
export class S3Storage implements StorageDriver {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    opts: { endpoint?: string; region: string; accessKeyId?: string; secretAccessKey?: string },
  ) {
    this.client = new S3Client({
      region: opts.region,
      // Omitted for AWS itself; set for other S3-compatible stores.
      ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
      // Without explicit keys the SDK uses the default chain (e.g. the EC2 instance's IAM role).
      ...(opts.accessKeyId && opts.secretAccessKey
        ? { credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey } }
        : {}),
    });
  }

  async createUploadTarget(key: string, opts: { contentType: string; bytes: number }) {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: opts.contentType,
        ContentLength: opts.bytes,
      }),
      // Short-lived: the URL only needs to last while the browser sends the file.
      { expiresIn: 10 * 60 },
    );
    return { url, method: "PUT" as const, headers: { "Content-Type": opts.contentType } };
  }

  async copy(fromKey: string, toKey: string) {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: toKey,
        CopySource: `${this.bucket}/${fromKey.split("/").map(encodeURIComponent).join("/")}`,
      }),
    );
  }

  async size(key: string) {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return head.ContentLength ?? null;
    } catch {
      return null;
    }
  }

  async read(key: string, range?: { start: number; end: number }) {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      }),
    );
    return res.Body as Readable;
  }

  async directDownloadUrl(key: string, opts: { filename: string; contentType: string; inline: boolean }) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: opts.contentType,
        ResponseContentDisposition: contentDisposition(opts.filename, opts.inline),
      }),
      { expiresIn: 5 * 60 },
    );
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export function contentDisposition(filename: string, inline: boolean) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
