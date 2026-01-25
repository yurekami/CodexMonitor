import { useEffect, useRef } from "react";
import Play from "lucide-react/dist/esm/icons/play";
import Pencil from "lucide-react/dist/esm/icons/pencil";

type LaunchScriptButtonProps = {
  launchScript: string | null;
  editorOpen: boolean;
  draftScript: string;
  isSaving: boolean;
  error: string | null;
  onRun: () => void;
  onOpenEditor: () => void;
  onCloseEditor: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
};

export function LaunchScriptButton({
  launchScript,
  editorOpen,
  draftScript,
  isSaving,
  error,
  onRun,
  onOpenEditor,
  onCloseEditor,
  onDraftChange,
  onSave,
}: LaunchScriptButtonProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editorOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) {
        return;
      }
      onCloseEditor();
    };
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, [editorOpen, onCloseEditor]);

  return (
    <div className="launch-script-menu" ref={popoverRef}>
      <div className="launch-script-buttons">
        <button
          type="button"
          className="ghost main-header-action launch-script-run"
          onClick={onRun}
          data-tauri-drag-region="false"
          aria-label={launchScript ? "Run launch script" : "Set launch script"}
          title={launchScript ? "Run launch script" : "Set launch script"}
        >
          <Play size={14} aria-hidden />
        </button>
        <button
          type="button"
          className="ghost main-header-action launch-script-edit"
          onClick={editorOpen ? onCloseEditor : onOpenEditor}
          data-tauri-drag-region="false"
          aria-label="Edit launch script"
          title="Edit launch script"
        >
          <Pencil size={14} aria-hidden />
        </button>
      </div>
      {editorOpen && (
        <div className="launch-script-popover popover-surface" role="dialog">
          <div className="launch-script-title">Launch script</div>
          <textarea
            className="launch-script-textarea"
            placeholder="e.g. npm run dev"
            value={draftScript}
            onChange={(event) => onDraftChange(event.target.value)}
            rows={6}
            data-tauri-drag-region="false"
          />
          <div className="launch-script-help">
            Runs in a dedicated terminal tab for this workspace.
          </div>
          {error && <div className="launch-script-error">{error}</div>}
          <div className="launch-script-actions">
            <button
              type="button"
              className="ghost"
              onClick={onCloseEditor}
              data-tauri-drag-region="false"
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={onSave}
              disabled={isSaving}
              data-tauri-drag-region="false"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
