import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnv, upsertEnv } from "../scripts/lib/env-file.ts";

function tmp() {
  return join(mkdtempSync(join(tmpdir(), "vc-env-")), ".env.local");
}

describe("upsertEnv", () => {
  it("creates the file with mode 0600", () => {
    const p = tmp();
    upsertEnv(p, "CARTESIA_AGENT_ID", "agent_1");
    expect(readFileSync(p, "utf8")).toBe("CARTESIA_AGENT_ID=agent_1\n");
    expect(statSync(p).mode & 0o777).toBe(0o600);
  });

  it("replaces a key and keeps comments and other keys", () => {
    const p = tmp();
    writeFileSync(p, "# keys\nSOME_SETTING=abc\nCARTESIA_AGENT_ID=old\n\nOTHER=1\n", { mode: 0o644 });
    upsertEnv(p, "CARTESIA_AGENT_ID", "new");
    expect(readFileSync(p, "utf8")).toBe("# keys\nSOME_SETTING=abc\nCARTESIA_AGENT_ID=new\n\nOTHER=1\n");
    expect(statSync(p).mode & 0o777).toBe(0o600);
  });

  it("appends when the key is missing, without a double newline", () => {
    const p = tmp();
    writeFileSync(p, "A=1\n");
    upsertEnv(p, "B", "2");
    expect(readFileSync(p, "utf8")).toBe("A=1\nB=2\n");
  });

  it("does not match a key that only starts with the same letters", () => {
    const p = tmp();
    writeFileSync(p, "CARTESIA_AGENT_ID_OLD=x\n");
    upsertEnv(p, "CARTESIA_AGENT_ID", "y");
    expect(readFileSync(p, "utf8")).toBe("CARTESIA_AGENT_ID_OLD=x\nCARTESIA_AGENT_ID=y\n");
  });
});

describe("parseEnv", () => {
  it("reads values, strips quotes, skips comments", () => {
    expect(parseEnv("# c\nA=1\nB=\"two\"\nexport C='3'\n\nD=\n")).toEqual({ A: "1", B: "two", C: "3", D: "" });
  });
});
