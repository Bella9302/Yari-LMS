// Deterministic test configuration. Keys here are for tests only.
(process.env as Record<string, string>).NODE_ENV ??= "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://yari:yari@localhost:5432/yari_test";
process.env.APP_URL ??= "http://localhost:3000";
process.env.FIELD_ENC_KEYS = JSON.stringify({
  ktest1: Buffer.alloc(32, 1).toString("base64"),
  ktest2: Buffer.alloc(32, 2).toString("base64"),
});
process.env.FIELD_ENC_ACTIVE_KEY = "ktest1";
process.env.BLIND_INDEX_KEY = Buffer.alloc(32, 9).toString("base64");
delete process.env.RESEND_API_KEY;
