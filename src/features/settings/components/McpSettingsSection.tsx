import { useCallback, useEffect, useState } from "react";
import {
  listMcpServerStatus,
  readClaudeJson,
  writeClaudeJson,
} from "../../../services/tauri";
import { removeServerFromConfig } from "../../../utils/mcpConfig";
import { McpServerCard } from "./McpServerCard";
import { FileEditorCard } from "../../shared/components/FileEditorCard";
import { useFileEditor } from "../../shared/hooks/useFileEditor";
import { pushErrorToast } from "../../../services/toasts";

type McpServer = {
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  url?: string;
  envKeys: string[];
  status: string;
};

/**
 * Read the raw ~/.claude.json file (not the config.toml).
 * We re-use the same Tauri invoke pattern but for the claude.json file.
 */
function useClaudeJsonEditor() {
  return useFileEditor({
    key: "global-claude-json",
    read: readClaudeJson,
    write: writeClaudeJson,
    readErrorTitle: "Couldn't load ~/.claude.json",
    writeErrorTitle: "Couldn't save ~/.claude.json",
  });
}

type McpSettingsSectionProps = {
  workspaceId: string | null;
};

export function McpSettingsSection({ workspaceId }: McpSettingsSectionProps) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [isLoadingServers, setIsLoadingServers] = useState(false);

  const editor = useClaudeJsonEditor();

  const fetchServers = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setIsLoadingServers(true);
    try {
      const response = (await listMcpServerStatus(
        workspaceId,
        null,
        null,
      )) as Record<string, unknown> | null;
      const result = (response?.result ?? response) as
        | Record<string, unknown>
        | null;
      const data = Array.isArray(result?.data)
        ? (result.data as McpServer[])
        : [];
      setServers(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushErrorToast({ title: "Failed to load MCP servers", message });
    } finally {
      setIsLoadingServers(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchServers();
  }, [fetchServers]);

  const handleRemoveServer = useCallback(
    async (serverName: string) => {
      const updated = removeServerFromConfig(editor.content, serverName);
      if (updated === editor.content) {
        return;
      }
      editor.setContent(updated);
      try {
        await writeClaudeJson(updated);
        await fetchServers();
        void editor.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pushErrorToast({ title: "Failed to remove server", message });
      }
    },
    [editor, fetchServers],
  );

  const handleEditorSave = useCallback(async () => {
    const ok = await editor.save();
    if (ok) {
      await fetchServers();
    }
  }, [editor, fetchServers]);

  const editorMeta = editor.isLoading
    ? "Loading..."
    : editor.isSaving
      ? "Saving..."
      : editor.exists
        ? ""
        : "Not found";

  return (
    <section className="settings-section">
      <div className="settings-section-title">
        MCP Servers
        {servers.length > 0 && (
          <span className="mcp-server-count">{servers.length}</span>
        )}
      </div>
      <div className="settings-section-subtitle">
        Model Context Protocol servers configured in <code>~/.claude.json</code>.
      </div>

      {isLoadingServers && servers.length === 0 && (
        <div className="settings-help">Loading servers...</div>
      )}

      {!isLoadingServers && servers.length === 0 && (
        <div className="settings-help">
          No MCP servers configured. Add servers to the{" "}
          <code>mcpServers</code> section of <code>~/.claude.json</code> below.
        </div>
      )}

      {servers.length > 0 && (
        <div className="mcp-server-grid">
          {servers.map((server) => (
            <McpServerCard
              key={server.name}
              name={server.name}
              transport={server.transport}
              command={server.command}
              url={server.url}
              envKeys={server.envKeys ?? []}
              status={server.status ?? "configured"}
              onRemove={() => void handleRemoveServer(server.name)}
            />
          ))}
        </div>
      )}

      <FileEditorCard
        title="~/.claude.json"
        meta={editorMeta}
        error={editor.error}
        value={editor.content}
        placeholder='{\n  "mcpServers": {\n    "my-server": {\n      "command": "npx",\n      "args": ["-y", "my-mcp-server"]\n    }\n  }\n}'
        disabled={editor.isLoading}
        refreshDisabled={editor.isLoading || editor.isSaving}
        saveDisabled={editor.isLoading || editor.isSaving || !editor.isDirty}
        saveLabel={editor.exists ? "Save" : "Create"}
        onChange={editor.setContent}
        onRefresh={() => {
          void editor.refresh();
          void fetchServers();
        }}
        onSave={() => void handleEditorSave()}
        helpText={
          <>
            Edit the raw <code>~/.claude.json</code> file directly. Changes to{" "}
            <code>mcpServers</code> will update the cards above after saving.
          </>
        }
        classNames={{
          container: "settings-field settings-agents",
          header: "settings-agents-header",
          title: "settings-field-label",
          actions: "settings-agents-actions",
          meta: "settings-help settings-help-inline",
          iconButton: "ghost settings-icon-button",
          error: "settings-agents-error",
          textarea: "settings-agents-textarea",
          help: "settings-help",
        }}
      />
    </section>
  );
}
