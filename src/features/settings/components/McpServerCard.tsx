import Trash2 from "lucide-react/dist/esm/icons/trash-2";

type McpServerCardProps = {
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  url?: string;
  envKeys: string[];
  status: string;
  onRemove: () => void;
};

const TRANSPORT_COLORS: Record<string, string> = {
  stdio: "var(--status-success)",
  http: "var(--status-info, #60a5fa)",
  sse: "var(--status-warning)",
};

export function McpServerCard({
  name,
  transport,
  command,
  url,
  envKeys,
  status,
  onRemove,
}: McpServerCardProps) {
  return (
    <div className="mcp-server-card">
      <div className="mcp-server-card-header">
        <div className="mcp-server-card-name">{name}</div>
        <div className="mcp-server-card-actions">
          <span
            className="mcp-server-card-transport"
            style={{ color: TRANSPORT_COLORS[transport] ?? "var(--text-muted)" }}
          >
            {transport}
          </span>
          <button
            type="button"
            className="ghost settings-icon-button"
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            title="Remove server"
          >
            <Trash2 aria-hidden />
          </button>
        </div>
      </div>

      {command && (
        <div className="mcp-server-card-detail">
          <span className="mcp-server-card-label">command</span>
          <code className="mcp-server-card-value">{command}</code>
        </div>
      )}

      {url && (
        <div className="mcp-server-card-detail">
          <span className="mcp-server-card-label">url</span>
          <code className="mcp-server-card-value">{url}</code>
        </div>
      )}

      {envKeys.length > 0 && (
        <div className="mcp-server-card-env">
          {envKeys.map((key) => (
            <span key={key} className="mcp-server-card-env-tag">
              {key}
            </span>
          ))}
        </div>
      )}

      <div className="mcp-server-card-status">
        <span
          className="mcp-server-card-status-dot"
          style={{
            background:
              status === "configured"
                ? "var(--status-success)"
                : "var(--text-muted)",
          }}
        />
        {status}
      </div>
    </div>
  );
}
