/**
 * Pure utility functions for manipulating the mcpServers section
 * of a ~/.claude.json config string.
 */

export type McpServerEntry = Record<string, unknown>;

/**
 * Parse the mcpServers object from a raw JSON config string.
 * Returns an empty object if the string is empty, invalid, or missing mcpServers.
 */
export function parseMcpServers(
  configContent: string,
): Record<string, McpServerEntry> {
  if (!configContent.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(configContent);
    const servers = parsed?.mcpServers;
    if (servers && typeof servers === "object" && !Array.isArray(servers)) {
      return servers as Record<string, McpServerEntry>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Remove a server by name from the config JSON string.
 * Returns the updated JSON string with 2-space indentation.
 * If the config is empty or invalid, returns it unchanged.
 */
export function removeServerFromConfig(
  configContent: string,
  serverName: string,
): string {
  if (!configContent.trim()) {
    return configContent;
  }
  try {
    const parsed = JSON.parse(configContent);
    if (parsed?.mcpServers && typeof parsed.mcpServers === "object") {
      const { [serverName]: _, ...rest } = parsed.mcpServers;
      return JSON.stringify(
        { ...parsed, mcpServers: rest },
        null,
        2,
      );
    }
    return configContent;
  } catch {
    return configContent;
  }
}

/**
 * Add or update a server in the config JSON string.
 * Returns the updated JSON string with 2-space indentation.
 * Creates the mcpServers key if it doesn't exist.
 */
export function addServerToConfig(
  configContent: string,
  serverName: string,
  serverConfig: McpServerEntry,
): string {
  try {
    const parsed = configContent.trim()
      ? JSON.parse(configContent)
      : {};
    const existing =
      parsed.mcpServers && typeof parsed.mcpServers === "object"
        ? parsed.mcpServers
        : {};
    return JSON.stringify(
      {
        ...parsed,
        mcpServers: { ...existing, [serverName]: serverConfig },
      },
      null,
      2,
    );
  } catch {
    return configContent;
  }
}
