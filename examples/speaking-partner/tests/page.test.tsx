// @vitest-environment jsdom
import "./setup-dom";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Page from "../app/page";

const saved = { ...process.env };
beforeEach(() => {
  delete process.env.CARTESIA_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.VERCEL;
  delete process.env.LLM_MODEL;
});
afterEach(() => {
  process.env = { ...saved };
});

describe("the page", () => {
  it("shows setup help when there is no key", () => {
    expect(renderToString(Page())).toContain("CARTESIA_API_KEY");
  });

  it("renders the app and never puts a key in the HTML or the flight props", () => {
    process.env.CARTESIA_API_KEY = "sentinel-cartesia-key-0001";
    process.env.ANTHROPIC_API_KEY = "sentinel-anthropic-key-0002";
    process.env.LLM_MODEL = "anthropic/claude-x";
    const html = renderToString(Page());
    expect(html).toContain("Speaking partner");
    expect(html).not.toContain("sentinel-");
    const props = (Page() as { props: Record<string, unknown> }).props;
    expect(props).toEqual({ correctionsEnabled: true });
  });
});
