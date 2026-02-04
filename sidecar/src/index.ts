#!/usr/bin/env node
/**
 * Claude Code Monitor Bridge
 *
 * JSON-RPC over stdio server that bridges the Tauri Rust backend
 * to the Claude Agent SDK. Implements the same protocol that the
 * original Codex app-server used, allowing the rest of the app
 * to work with minimal changes.
 *
 * Protocol: newline-delimited JSON on stdin/stdout
 * - Requests have an `id` field and expect a response
 * - Notifications have no `id` and get no response
 * - Server can also push notifications (events) to the client
 */

import { createInterface } from "readline";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { CLAUDE_MODELS } from "./models.js";
import { readMcpServerStatuses } from "./mcpConfig.js";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  ThreadInfo,
  ActiveTurn,
} from "./types.js";

// ── State ──────────────────────────────────────────────────────────────────

const threads = new Map<string, ThreadInfo>();
const activeTurns = new Map<string, ActiveTurn>();
let nextThreadId = 1;
let nextTurnId = 1;
let initialized = false;

// ── Stdio Transport ────────────────────────────────────────────────────────

function sendMessage(msg: Record<string, unknown>): void {
  const line = JSON.stringify(msg);
  process.stdout.write(line + "\n");
}

function sendResponse(id: number | undefined, result: unknown): void {
  if (id === undefined) return;
  sendMessage({ id, result });
}

function sendError(id: number | undefined, code: number, message: string): void {
  if (id === undefined) return;
  sendMessage({ id, error: { code, message } });
}

function sendNotification(method: string, params: Record<string, unknown>): void {
  sendMessage({ method, params });
}

// ── Thread Management ──────────────────────────────────────────────────────

function createThread(cwd: string): ThreadInfo {
  const id = `thread-${nextThreadId++}`;
  const now = Date.now();
  const thread: ThreadInfo = {
    id,
    name: `Session ${nextThreadId - 1}`,
    sessionId: null,
    cwd,
    createdAt: now,
    updatedAt: now,
    archived: false,
  };
  threads.set(id, thread);
  return thread;
}

function generateTurnId(): string {
  return `turn-${nextTurnId++}`;
}

// ── Permission Mapping ─────────────────────────────────────────────────────

function mapAccessMode(accessMode?: string): string[] | undefined {
  switch (accessMode) {
    case "full-access":
      return undefined; // All tools allowed
    case "read-only":
      return ["Read", "Glob", "Grep", "WebSearch", "WebFetch"];
    case "current":
    default:
      return ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"];
  }
}

function mapPermissionMode(approvalPolicy?: string): string {
  switch (approvalPolicy) {
    case "never":
      return "bypassPermissions";
    case "on-request":
    default:
      return "default";
  }
}

// ── Message Handlers ───────────────────────────────────────────────────────

async function handleInitialize(
  id: number | undefined,
  params: Record<string, unknown>
): Promise<void> {
  initialized = true;
  sendResponse(id, {
    serverInfo: {
      name: "claude-code-monitor-bridge",
      version: "1.0.0",
    },
    capabilities: {
      threads: true,
      models: true,
      skills: true,
      reviews: true,
    },
  });
}

async function handleThreadStart(
  id: number | undefined,
  params: Record<string, unknown>
): Promise<void> {
  const cwd = (params.cwd as string) || process.cwd();
  const thread = createThread(cwd);

  // Emit thread/started notification
  sendNotification("thread/started", {
    threadId: thread.id,
    thread: {
      id: thread.id,
      name: thread.name,
      updatedAt: thread.updatedAt,
    },
  });

  sendResponse(id, {
    threadId: thread.id,
    thread: {
      id: thread.id,
      name: thread.name,
      updatedAt: thread.updatedAt,
    },
  });
}

async function handleThreadResume(
  id: number | undefined,
  params: Record<string, unknown>
): Promise<void> {
  const threadId = params.threadId as string;
  const thread = threads.get(threadId);

  if (!thread) {
    sendError(id, -32602, `Thread not found: ${threadId}`);
    return;
  }

  // Emit thread items if we have a session to resume
  sendNotification("thread/resumed", {
    threadId: thread.id,
    thread: {
      id: thread.id,
      name: thread.name,
      updatedAt: thread.updatedAt,
    },
    items: [], // SDK doesn't persist thread history natively
  });

  sendResponse(id, {
    threadId: thread.id,
    thread: {
      id: thread.id,
      name: thread.name,
      updatedAt: thread.updatedAt,
    },
    items: [],
  });
}

async function handleThreadFork(
  id: number | undefined,
  params: Record<string, unknown>
): Promise<void> {
  const sourceThreadId = params.threadId as string;
  const source = threads.get(sourceThreadId);

  if (!source) {
    sendError(id, -32602, `Thread not found: ${sourceThreadId}`);
    return;
  }

  const forked = createThread(source.cwd);
  forked.sessionId = source.sessionId; // Share session for context

  sendNotification("thread/started", {
    threadId: forked.id,
    thread: {
      id: forked.id,
      name: `Fork of ${source.name}`,
      updatedAt: forked.updatedAt,
    },
  });

  sendResponse(id, {
    threadId: forked.id,
    thread: {
      id: forked.id,
      name: `Fork of ${source.name}`,
      updatedAt: forked.updatedAt,
    },
  });
}

async function handleThreadList(
  id: number | undefined,
  params: Record<string, unknown>
): Promise<void> {
  const limit = (params.limit as number) || 50;
  const threadList = Array.from(threads.values())
    .filter((t) => !t.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      name: t.name,
      updatedAt: t.updatedAt,
    }));

  sendResponse(id, {
    threads: threadList,
    cursor: null,
  });
}

async function handleThreadArchive(
  id: number | undefined,
  params: Record<string, unknown>
): Promise<void> {
  const threadId = params.threadId as string;
  const thread = threads.get(threadId);

  if (thread) {
    thread.archived = true;
    thread.updatedAt = Date.now();
  }

  sendResponse(id, { ok: true });
}

async function handleThreadNameSet(
  id: number | undefined,
  params: Record<string, unknown>
): Promise<void> {
  const threadId = params.threadId as string;
  const name = params.name as string;
  const thread = threads.get(threadId);

  if (thread) {
    thread.name = name;
    thread.updatedAt = Date.now();
  }

  sendResponse(id, { ok: true });
}

async function handleTurnStart(
  id: number | undefined,
  params: Record<string, unknown>
): Promise<void> {
  const threadId = params.threadId as string;
  const thread = threads.get(threadId);

  if (!thread) {
    sendError(id, -32602, `Thread not found: ${threadId}`);
    return;
  }

  const turnId = generateTurnId();
  const abortController = new AbortController();

  activeTurns.set(turnId, { threadId, turnId, abortController });

  // Extract prompt from input
  const input = params.input as Array<{ type: string; text?: string; path?: string; url?: string }>;
  const textParts = input
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text as string);
  const prompt = textParts.join("\n");

  if (!prompt.trim()) {
    sendError(id, -32602, "Empty prompt");
    activeTurns.delete(turnId);
    return;
  }

  const cwd = (params.cwd as string) || thread.cwd;
  const model = params.model as string | undefined;
  const effort = params.effort as string | undefined;
  const approvalPolicy = params.approvalPolicy as string | undefined;
  const accessMode = params.accessMode as string | undefined;

  // Respond immediately with turn started
  sendResponse(id, { turnId, threadId });

  // Emit turn/started notification
  sendNotification("turn/started", {
    threadId,
    turnId,
  });

  // Create a unique item ID for the assistant message
  const messageItemId = `item-${Date.now()}`;

  sendNotification("item/started", {
    threadId,
    turnId,
    itemId: messageItemId,
    kind: "agentMessage",
  });

  // Run the Claude Agent SDK query in background
  runTurn(
    thread,
    turnId,
    messageItemId,
    prompt,
    cwd,
    model,
    effort,
    approvalPolicy,
    accessMode,
    abortController
  ).catch((err) => {
    sendNotification("turn/error", {
      threadId,
      turnId,
      error: String(err),
    });
  });
}

async function runTurn(
  thread: ThreadInfo,
  turnId: string,
  messageItemId: string,
  prompt: string,
  cwd: string,
  model?: string,
  effort?: string,
  approvalPolicy?: string,
  accessMode?: string,
  abortController?: AbortController
): Promise<void> {
  const threadId = thread.id;

  try {
    const options: Record<string, unknown> = {
      cwd,
      permissionMode: mapPermissionMode(approvalPolicy),
    };

    const allowedTools = mapAccessMode(accessMode);
    if (allowedTools) {
      options.allowedTools = allowedTools;
    }

    if (model) {
      options.model = model;
    }

    // Resume session if available
    if (thread.sessionId) {
      options.resume = thread.sessionId;
    }

    if (abortController) {
      options.abortController = abortController;
    }

    let fullText = "";

    for await (const message of query({ prompt, options: options as any })) {
      // Check for abort
      if (abortController?.signal.aborted) {
        sendNotification("turn/interrupted", { threadId, turnId });
        return;
      }

      // Capture session ID from init message
      if (
        message &&
        typeof message === "object" &&
        "type" in message &&
        (message as any).type === "system" &&
        "subtype" in message &&
        (message as any).subtype === "init"
      ) {
        thread.sessionId = (message as any).session_id ?? null;
        continue;
      }

      // Handle result message (final text)
      if (message && typeof message === "object" && "result" in message) {
        const resultText = (message as any).result as string;
        if (resultText && resultText !== fullText) {
          const delta = resultText.slice(fullText.length);
          if (delta) {
            sendNotification("item/agentMessage/delta", {
              threadId,
              turnId,
              itemId: messageItemId,
              delta,
            });
            fullText = resultText;
          }
        }
        continue;
      }

      // Handle assistant message chunks
      if (message && typeof message === "object") {
        const msg = message as any;

        // Text delta from partial messages
        if (msg.type === "assistant" && msg.content) {
          for (const block of msg.content) {
            if (block.type === "text" && block.text) {
              const newText = block.text;
              if (newText.length > fullText.length) {
                const delta = newText.slice(fullText.length);
                sendNotification("item/agentMessage/delta", {
                  threadId,
                  turnId,
                  itemId: messageItemId,
                  delta,
                });
                fullText = newText;
              }
            }
          }
        }

        // Tool use events
        if (msg.type === "assistant" && msg.content) {
          for (const block of msg.content) {
            if (block.type === "tool_use") {
              const toolItemId = `tool-${block.id}`;
              sendNotification("item/started", {
                threadId,
                turnId,
                itemId: toolItemId,
                kind: "tool",
                toolType: block.name,
                title: block.name,
              });
            }
          }
        }

        // Tool result events
        if (msg.type === "tool_result" || msg.tool_use_id) {
          sendNotification("item/completed", {
            threadId,
            turnId,
            itemId: `tool-${msg.tool_use_id ?? "unknown"}`,
            kind: "tool",
          });
        }

        // Reasoning/thinking events
        if (msg.type === "assistant" && msg.content) {
          for (const block of msg.content) {
            if (block.type === "thinking" && block.thinking) {
              sendNotification("item/started", {
                threadId,
                turnId,
                itemId: `reasoning-${Date.now()}`,
                kind: "reasoning",
                summary: block.thinking.slice(0, 200),
                content: block.thinking,
              });
            }
          }
        }

        // Permission/approval requests
        if (msg.type === "permission_request") {
          const requestId = Date.now();
          sendMessage({
            id: requestId,
            method: "claude-code/approvalRequest",
            params: {
              threadId,
              turnId,
              requestId,
              method: msg.tool_name ?? "unknown",
              params: msg.tool_input ?? {},
            },
          });
        }

        // User input requests (AskUserQuestion)
        if (msg.type === "input_request") {
          const requestId = Date.now();
          sendMessage({
            id: requestId,
            method: "claude-code/userInputRequest",
            params: {
              threadId,
              turnId,
              requestId,
              params: {
                thread_id: threadId,
                turn_id: turnId,
                item_id: messageItemId,
                questions: msg.questions ?? [],
              },
            },
          });
        }
      }
    }

    // Mark message item as completed
    sendNotification("item/completed", {
      threadId,
      turnId,
      itemId: messageItemId,
      kind: "agentMessage",
    });

    // Emit turn/completed
    thread.updatedAt = Date.now();
    sendNotification("turn/completed", {
      threadId,
      turnId,
    });
  } catch (err) {
    if (abortController?.signal.aborted) {
      sendNotification("turn/interrupted", { threadId, turnId });
    } else {
      sendNotification("turn/error", {
        threadId,
        turnId,
        error: String(err),
      });
    }
  } finally {
    activeTurns.delete(turnId);
  }
}

async function handleTurnInterrupt(
  id: number | undefined,
  params: Record<string, unknown>
): Promise<void> {
  const turnId = params.turnId as string;
  const turn = activeTurns.get(turnId);

  if (turn) {
    turn.abortController.abort();
    activeTurns.delete(turnId);
  }

  sendResponse(id, { ok: true });
}

async function handleModelList(
  id: number | undefined,
  _params: Record<string, unknown>
): Promise<void> {
  sendResponse(id, {
    result: {
      models: CLAUDE_MODELS,
    },
  });
}

async function handleAccountRateLimits(
  id: number | undefined,
  _params: Record<string, unknown>
): Promise<void> {
  // Claude Code uses API keys, not rate-limited accounts like ChatGPT
  sendResponse(id, {
    result: {
      primary: null,
      secondary: null,
      credits: {
        hasCredits: true,
        unlimited: false,
        balance: null,
      },
      planType: "api",
    },
  });
}

async function handleAccountRead(
  id: number | undefined,
  _params: Record<string, unknown>
): Promise<void> {
  sendResponse(id, {
    result: {
      type: "apikey",
      email: null,
      planType: "api",
      requiresOpenaiAuth: false,
    },
  });
}

async function handleSkillsList(
  id: number | undefined,
  params: Record<string, unknown>
): Promise<void> {
  // Return empty skills list - Claude Code uses slash commands instead
  sendResponse(id, {
    result: {
      skills: [],
    },
  });
}

async function handleAppsList(
  id: number | undefined,
  _params: Record<string, unknown>
): Promise<void> {
  sendResponse(id, {
    result: {
      apps: [],
      cursor: null,
    },
  });
}

async function handleCollaborationModeList(
  id: number | undefined,
  _params: Record<string, unknown>
): Promise<void> {
  sendResponse(id, {
    result: {
      modes: [],
    },
  });
}

async function handleReviewStart(
  id: number | undefined,
  params: Record<string, unknown>
): Promise<void> {
  // Map review to a regular turn with review-specific prompt
  const threadId = params.threadId as string;
  const target = params.target as Record<string, unknown>;

  let reviewPrompt = "Please review ";
  if (target?.type === "uncommittedChanges") {
    reviewPrompt += "the uncommitted changes in this repository. Run `git diff` to see what changed and provide a code review.";
  } else if (target?.type === "baseBranch") {
    reviewPrompt += `the changes between the current branch and ${target.branch}. Run \`git diff ${target.branch}...HEAD\` and provide a code review.`;
  } else if (target?.type === "commit") {
    reviewPrompt += `commit ${target.sha}. Run \`git show ${target.sha}\` and provide a code review.`;
  } else if (target?.type === "custom") {
    reviewPrompt = target.instructions as string;
  }

  // Delegate to turn/start
  await handleTurnStart(id, {
    ...params,
    input: [{ type: "text", text: reviewPrompt }],
    approvalPolicy: "never",
  });
}

async function handleMcpServerStatusList(
  id: number | undefined,
  _params: Record<string, unknown>
): Promise<void> {
  const servers = await readMcpServerStatuses();
  sendResponse(id, {
    result: {
      data: servers,
      cursor: null,
    },
  });
}

async function handleAccountLoginStart(
  id: number | undefined,
  _params: Record<string, unknown>
): Promise<void> {
  // Claude Code uses API keys, no OAuth login flow needed
  sendError(
    id,
    -32601,
    "Claude Code uses API keys for authentication. Set ANTHROPIC_API_KEY environment variable."
  );
}

async function handleAccountLoginCancel(
  id: number | undefined,
  _params: Record<string, unknown>
): Promise<void> {
  sendResponse(id, { canceled: true, status: "canceled" });
}

// ── Request Router ─────────────────────────────────────────────────────────

const handlers: Record<
  string,
  (id: number | undefined, params: Record<string, unknown>) => Promise<void>
> = {
  initialize: handleInitialize,
  "thread/start": handleThreadStart,
  "thread/resume": handleThreadResume,
  "thread/fork": handleThreadFork,
  "thread/list": handleThreadList,
  "thread/archive": handleThreadArchive,
  "thread/name/set": handleThreadNameSet,
  "turn/start": handleTurnStart,
  "turn/interrupt": handleTurnInterrupt,
  "review/start": handleReviewStart,
  "model/list": handleModelList,
  "account/rateLimits/read": handleAccountRateLimits,
  "account/read": handleAccountRead,
  "account/login/start": handleAccountLoginStart,
  "account/login/cancel": handleAccountLoginCancel,
  "skills/list": handleSkillsList,
  "app/list": handleAppsList,
  "collaborationMode/list": handleCollaborationModeList,
  "mcpServerStatus/list": handleMcpServerStatusList,
};

async function handleMessage(raw: string): Promise<void> {
  let msg: JsonRpcRequest;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendNotification("claude-code/parseError", {
      error: "Invalid JSON",
      raw,
    });
    return;
  }

  const { id, method, params } = msg;

  // Handle responses to our requests (approval responses)
  if (id !== undefined && !method && (msg as any).result !== undefined) {
    // This is a response to one of our requests (e.g., approval)
    // For now, just log it
    return;
  }

  // Handle notifications (no id)
  if (method === "initialized") {
    // Client acknowledged initialization
    return;
  }

  const handler = handlers[method];
  if (handler) {
    try {
      await handler(id, params ?? {});
    } catch (err) {
      sendError(id, -32603, `Internal error: ${String(err)}`);
    }
  } else {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

// ── Main Loop ──────────────────────────────────────────────────────────────

function main(): void {
  // Prevent stdout buffering issues
  process.stdout.setDefaultEncoding("utf-8");

  // Read JSON-lines from stdin
  const rl = createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on("line", (line: string) => {
    const trimmed = line.trim();
    if (trimmed) {
      handleMessage(trimmed).catch((err) => {
        process.stderr.write(`Bridge error: ${err}\n`);
      });
    }
  });

  rl.on("close", () => {
    // Abort all active turns
    for (const turn of activeTurns.values()) {
      turn.abortController.abort();
    }
    process.exit(0);
  });

  // Handle uncaught errors
  process.on("uncaughtException", (err) => {
    process.stderr.write(`Uncaught exception: ${err}\n`);
  });

  process.on("unhandledRejection", (reason) => {
    process.stderr.write(`Unhandled rejection: ${reason}\n`);
  });
}

main();
