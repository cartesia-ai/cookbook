import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2]!;
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    out[m[1]!] = value;
  }
  return out;
}

export function readEnvFile(path: string): Record<string, string> {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

export function upsertEnv(path: string, key: string, value: string): void {
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
  const re = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
  const i = lines.findIndex((l) => re.test(l));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  writeFileSync(path, lines.join("\n") + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}
