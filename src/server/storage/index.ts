import "server-only";
import { env } from "@/server/env";
import type { StorageDriver } from "@/server/storage/driver";
import { LocalStorage } from "@/server/storage/local";
import { S3Storage } from "@/server/storage/s3";

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  if (driver) return driver;
  const e = env();
  driver =
    e.STORAGE_DRIVER === "s3"
      ? new S3Storage(e.S3_BUCKET!, {
          endpoint: e.S3_ENDPOINT!,
          region: e.S3_REGION,
          accessKeyId: e.S3_ACCESS_KEY_ID!,
          secretAccessKey: e.S3_SECRET_ACCESS_KEY!,
        })
      : new LocalStorage(e.STORAGE_LOCAL_DIR);
  return driver;
}
