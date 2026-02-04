import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { McpServerStatus, McpTransportType } from "./types.js";

/** Resolve the path to ~/.claude.json */
function resolveClaudeConfigPath(): string {
  return join(homedir(), ".claude.json");
}

/** Detect transport type from a raw server config entry */
function detectTransport(
  config: Record<string, unknown>,
): McpTransportType {
  if (typeof config.type === "string") {
    const t = config.type.toLowerCase();
    if (t === "http" || t === "sse") {
      return t;
    }
  }
  if (typeof config.url === "string") {
    return "http";
  }
  return "stdio";
}

/** Extract env key names (never values) from a server config */
function extractEnvKeys(config: Record<string, unknown>): string[] {
  const env = config.env;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    return Object.keys(env as Record<string, unknown>).sort();
  }
  return [];
}

/** Normalize a single server entry into McpServerStatus */
function parseServerEntry(
  name: string,
  raw: Record<string, unknown>,
): McpServerStatus {
  const transport = detectTransport(raw);
  const entry: McpServerStatus = {
    name,
    transport,
    envKeys: extractEnvKeys(raw),
    status: "configured",
  };

  if (transport === "stdio") {
    entry.command = typeof raw.command === "string" ? raw.command : undefined;
  } else {
    entry.url = typeof raw.url === "string" ? raw.url : undefined;
  }

  return entry;
}

/**
 * Read ~/.claude.json and return parsed MCP server statuses.
 * Returns [] on missing file, missing key, or malformed JSON.
 */
export async function readMcpServerStatuses(): Promise<McpServerStatus[]> {
  try {
    const configPath = resolveClaudeConfigPath();
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);

    if (!parsed || typeof parsed !== "object") {
      return [];
    }

    const mcpServers = parsed.mcpServers;
    if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
      return [];
    }

    const servers: McpServerStatus[] = [];
    for (const [name, raw] of Object.entries(mcpServers)) {
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        servers.push(parseServerEntry(name, raw as Record<string, unknown>));
      }
    }

    return servers.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
