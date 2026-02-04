import type { ModelInfo } from "./types.js";

/** Available Claude models */
export const CLAUDE_MODELS: ModelInfo[] = [
  {
    id: "claude-sonnet-4-20250514",
    model: "claude-sonnet-4-20250514",
    displayName: "Claude Sonnet 4",
    description: "Best balance of intelligence and speed for coding tasks",
    supportedReasoningEfforts: [
      { reasoningEffort: "low", description: "Faster responses with less reasoning" },
      { reasoningEffort: "medium", description: "Balanced reasoning" },
      { reasoningEffort: "high", description: "Deep reasoning for complex tasks" },
    ],
    defaultReasoningEffort: "medium",
    isDefault: true,
  },
  {
    id: "claude-opus-4-20250514",
    model: "claude-opus-4-20250514",
    displayName: "Claude Opus 4",
    description: "Most capable model for complex reasoning and analysis",
    supportedReasoningEfforts: [
      { reasoningEffort: "low", description: "Faster responses with less reasoning" },
      { reasoningEffort: "medium", description: "Balanced reasoning" },
      { reasoningEffort: "high", description: "Maximum reasoning depth" },
    ],
    defaultReasoningEffort: "medium",
    isDefault: false,
  },
  {
    id: "claude-haiku-3-5-20241022",
    model: "claude-3-5-haiku-20241022",
    displayName: "Claude 3.5 Haiku",
    description: "Fastest model for simple tasks and quick answers",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: false,
  },
  {
    id: "claude-opus-4-5-20251101",
    model: "claude-opus-4-5-20251101",
    displayName: "Claude Opus 4.5",
    description: "Latest frontier model with deepest reasoning capabilities",
    supportedReasoningEfforts: [
      { reasoningEffort: "low", description: "Faster responses" },
      { reasoningEffort: "medium", description: "Balanced reasoning" },
      { reasoningEffort: "high", description: "Maximum depth" },
    ],
    defaultReasoningEffort: "medium",
    isDefault: false,
  },
];
