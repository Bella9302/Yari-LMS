// Environment shared by the E2E seed and the Next.js server under test. Test-only keys.
export const E2E_ENV = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://yari:yari@localhost:5432/yari_e2e",
  APP_URL: "http://localhost:3100",
  FIELD_ENC_KEYS: JSON.stringify({ ktest1: Buffer.alloc(32, 1).toString("base64") }),
  FIELD_ENC_ACTIVE_KEY: "ktest1",
  BLIND_INDEX_KEY: Buffer.alloc(32, 9).toString("base64"),
  RESEND_API_KEY: "",
};
