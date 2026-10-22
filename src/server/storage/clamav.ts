import "server-only";
import net from "node:net";
import type { Readable } from "node:stream";

export type ScanResult = { clean: true } | { clean: false; signature: string };

/**
 * Streams a file to clamd using the INSTREAM protocol:
 * "zINSTREAM\0", then chunks of [uint32 big-endian length][bytes], then a zero-length chunk.
 */
export function scanStream(
  input: Readable,
  opts: { host: string; port: number; timeoutMs?: number },
): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: opts.host, port: opts.port });
    socket.setTimeout(opts.timeoutMs ?? 120_000);
    let reply = "";
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      input.destroy();
      socket.destroy();
      reject(err);
    };

    socket.on("timeout", () => fail(new Error("Virus scanner timed out")));
    socket.on("error", fail);
    socket.on("data", (chunk) => (reply += chunk.toString("utf8")));
    socket.on("end", () => {
      if (settled) return;
      settled = true;
      const text = reply.replace(/\0/g, "").trim();
      if (/:\s*OK$/.test(text)) return resolve({ clean: true });
      const found = text.match(/:\s*(.+)\s+FOUND$/);
      if (found) return resolve({ clean: false, signature: found[1]! });
      reject(new Error(`Unexpected scanner reply: ${text.slice(0, 200)}`));
    });

    socket.on("connect", async () => {
      try {
        socket.write("zINSTREAM\0");
        for await (const chunk of input) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(buf.length);
          if (!socket.write(Buffer.concat([len, buf]))) await new Promise((r) => socket.once("drain", r));
        }
        socket.end(Buffer.alloc(4));
      } catch (err) {
        fail(err as Error);
      }
    });
  });
}
