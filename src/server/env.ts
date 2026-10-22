import { z } from "zod";

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  FIELD_ENC_KEYS: z.string().transform((v, ctx) => {
    try {
      return z.record(z.string().regex(/^[a-z0-9]+$/i), base64Key).parse(JSON.parse(v));
    } catch {
      ctx.addIssue({ code: "custom", message: "FIELD_ENC_KEYS must be a JSON map of keyId -> base64 key" });
      return z.NEVER;
    }
  }),
  FIELD_ENC_ACTIVE_KEY: z.string(),
  BLIND_INDEX_KEY: base64Key,
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("YARI Academy <academy@yarigroup.co.za>"),

  // File storage: "local" (development, single server) or "s3" (Cloudflare R2 / any S3-compatible).
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".storage"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // ClamAV daemon for virus scanning uploads. Required in production.
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().int().default(3310),
  // Test-only escape hatch for running a production build without ClamAV (E2E). Never set in a real deployment.
  ALLOW_UNSCANNED_UPLOADS: z.enum(["true", "false"]).default("false"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment. Parsed lazily so tests can set process.env first. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  if (!(parsed.data.FIELD_ENC_ACTIVE_KEY in parsed.data.FIELD_ENC_KEYS)) {
    throw new Error("FIELD_ENC_ACTIVE_KEY does not name a key in FIELD_ENC_KEYS");
  }
  if (parsed.data.STORAGE_DRIVER === "s3") {
    for (const k of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
      if (!parsed.data[k]) throw new Error(`${k} is required when STORAGE_DRIVER=s3`);
    }
  }
  if (
    parsed.data.NODE_ENV === "production" &&
    !parsed.data.CLAMAV_HOST &&
    parsed.data.ALLOW_UNSCANNED_UPLOADS !== "true"
  ) {
    throw new Error("CLAMAV_HOST is required in production: uploads must be virus-scanned");
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = undefined;
}
