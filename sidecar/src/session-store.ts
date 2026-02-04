/**
 * Persistent session storage for thread-to-session mapping.
 * Stores session IDs in a JSON file so threads can be resumed
 * across bridge restarts.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import type { ThreadInfo } from "./types.js";

const STORE_DIR = join(homedir(), ".claude", "claude-code-monitor");
const STORE_FILE = join(STORE_DIR, "sessions.json");

interface SessionStore {
  threads: Record<string, ThreadInfo>;
}

function ensureDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

export function loadStore(): SessionStore {
  try {
    ensureDir();
    if (existsSync(STORE_FILE)) {
      const raw = readFileSync(STORE_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // Ignore parse errors, start fresh
  }
  return { threads: {} };
}

export function saveStore(store: SessionStore): void {
  try {
    ensureDir();
    writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch {
    // Best effort - don't crash if we can't persist
  }
}

export function saveThread(thread: ThreadInfo): void {
  const store = loadStore();
  store.threads[thread.id] = thread;
  saveStore(store);
}

export function loadThread(threadId: string): ThreadInfo | null {
  const store = loadStore();
  return store.threads[threadId] ?? null;
}

export function loadAllThreads(): ThreadInfo[] {
  const store = loadStore();
  return Object.values(store.threads).filter((t) => !t.archived);
}

export function archiveThread(threadId: string): void {
  const store = loadStore();
  const thread = store.threads[threadId];
  if (thread) {
    thread.archived = true;
    thread.updatedAt = Date.now();
    saveStore(store);
  }
}
