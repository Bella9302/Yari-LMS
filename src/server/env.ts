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
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = undefined;
}
