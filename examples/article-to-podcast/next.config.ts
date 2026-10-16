import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["jsdom"],
  agentRules: false,
};

export default config;
