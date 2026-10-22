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

  // File storage: "local" (development) or "s3" (Amazon S3; any S3-compatible store via S3_ENDPOINT).
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".storage"),
  S3_ENDPOINT: z.string().url().optional(),
  // Cape Town keeps files in South Africa (an opt-in AWS region: enable it on the account first).
  S3_REGION: z.string().default("af-south-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // ClamAV daemon for virus scanning uploads. Required in production.
  CLAMAV_HOST: z.string().optional(),
  /**
   * How many reverse proxies we run in front of the app (e.g. 1 for Caddy/nginx, 2 for a CDN +
   * nginx). The client IP is the X-Forwarded-For entry that many places from the right; entries
   * further left are supplied by the client and can't be trusted. 0 = no proxy: ignore the header.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  CLAMAV_PORT: z.coerce.number().int().default(3310),
  // Test-only escape hatch for running a production build without ClamAV (E2E). Never set in a real deployment.
  ALLOW_UNSCANNED_UPLOADS: z.enum(["true", "false"]).default("false"),
  /**
   * A demonstration server (client presentations): shows a "demo, fictional data" banner,
   * logs emails instead of sending them, and allows the demo seed. Never on the live site.
   */
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
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
    if (!parsed.data.S3_BUCKET) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
    // Keys are optional: on AWS the server's IAM role is preferred. If one is set, both must be.
    if (Boolean(parsed.data.S3_ACCESS_KEY_ID) !== Boolean(parsed.data.S3_SECRET_ACCESS_KEY)) {
      throw new Error("Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither (to use the IAM role)");
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
