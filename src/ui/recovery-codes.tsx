"use client";

import { useState } from "react";
import { Button } from "@/ui/button";

export function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");
  return (
    <div>
      <ul className="border-line bg-surface grid grid-cols-2 gap-x-6 gap-y-2 border p-5 font-mono text-[0.95rem] tracking-wider">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy codes"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text + "\n"], { type: "text/plain" }));
            const a = Object.assign(document.createElement("a"), {
              href: url,
              download: "yari-recovery-codes.txt",
            });
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download
        </Button>
      </div>
    </div>
  );
}
