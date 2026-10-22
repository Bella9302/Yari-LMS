// Prints fresh secrets for .env. Run: npm run keys:generate
import { randomBytes } from "node:crypto";

const keyId = `k${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
const key = randomBytes(32).toString("base64");

console.log(`FIELD_ENC_KEYS='${JSON.stringify({ [keyId]: key })}'`);
console.log(`FIELD_ENC_ACTIVE_KEY=${keyId}`);
console.log(`BLIND_INDEX_KEY=${randomBytes(32).toString("base64")}`);
