/** JSON-RPC request from the Rust backend */
export interface JsonRpcRequest {
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC response to send back */
export interface JsonRpcResponse {
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/** JSON-RPC notification (no id, no response expected) */
export interface JsonRpcNotification {
  method: string;
  params?: Record<string, unknown>;
}

/** Thread metadata stored in memory */
export interface ThreadInfo {
  id: string;
  name: string;
  sessionId: string | null;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

/** Active turn with AbortController */
export interface ActiveTurn {
  threadId: string;
  turnId: string;
  abortController: AbortController;
}

/** Claude model definition */
export interface ModelInfo {
  id: string;
  model: string;
  displayName: string;
  description: string;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[];
  defaultReasoningEffort: string | null;
  isDefault: boolean;
}

/** MCP transport type */
export type McpTransportType = "stdio" | "http" | "sse";

/** Stdio-based MCP server config from ~/.claude.json */
export interface McpStdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** HTTP/SSE-based MCP server config */
export interface McpHttpConfig {
  type: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
}

/** Normalized status for a single MCP server */
export interface McpServerStatus {
  name: string;
  transport: McpTransportType;
  command?: string;
  url?: string;
  envKeys: string[];
  status: "configured";
}

/** Response shape for mcpServerStatus/list (wire format uses `data` key) */
export interface McpServerStatusListResponse {
  data: McpServerStatus[];
  cursor: string | null;
}
