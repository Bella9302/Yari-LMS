import net from "node:net";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanStream } from "@/server/storage/clamav";

// A tiny fake clamd that speaks INSTREAM and flags the EICAR test string.
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
let server: net.Server;
let port = 0;

beforeAll(async () => {
  server = net.createServer((socket) => {
    let buf = Buffer.alloc(0);
    let data = Buffer.alloc(0);
    let headerDone = false;
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!headerDone) {
        const nul = buf.indexOf(0);
        if (nul === -1) return;
        expect(buf.subarray(0, nul).toString()).toBe("zINSTREAM");
        buf = buf.subarray(nul + 1);
        headerDone = true;
      }
      while (buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (len === 0) {
          socket.end(
            data.toString().includes("EICAR") ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0",
          );
          return;
        }
        if (buf.length < 4 + len) return;
        data = Buffer.concat([data, buf.subarray(4, 4 + len)]);
        buf = buf.subarray(4 + len);
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as net.AddressInfo).port;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("clamd INSTREAM client", () => {
  it("reports clean files", async () => {
    expect(
      await scanStream(Readable.from([Buffer.from("hello"), Buffer.from(" world")]), {
        host: "127.0.0.1",
        port,
      }),
    ).toEqual({
      clean: true,
    });
  });

  it("reports infected files with the signature", async () => {
    expect(await scanStream(Readable.from([Buffer.from(EICAR)]), { host: "127.0.0.1", port })).toEqual({
      clean: false,
      signature: "Eicar-Test-Signature",
    });
  });

  it("fails (rather than passing the file) when the scanner is unreachable", async () => {
    await expect(
      scanStream(Readable.from([Buffer.from("x")]), { host: "127.0.0.1", port: 1 }),
    ).rejects.toThrow();
  });
});
