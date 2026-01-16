import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ArrowLeftRight,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
} from "lucide-react";

type FileTreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children: FileTreeNode[];
};

type FileTreePanelProps = {
  workspacePath: string;
  files: string[];
  onToggleFilePanel: () => void;
};

type FileTreeBuildNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children: Map<string, FileTreeBuildNode>;
};

function buildTree(paths: string[]): { nodes: FileTreeNode[]; folderPaths: Set<string> } {
  const root = new Map<string, FileTreeBuildNode>();
  const addNode = (
    map: Map<string, FileTreeBuildNode>,
    name: string,
    path: string,
    type: "file" | "folder",
  ) => {
    const existing = map.get(name);
    if (existing) {
      if (type === "folder") {
        existing.type = "folder";
      }
      return existing;
    }
    const node: FileTreeBuildNode = {
      name,
      path,
      type,
      children: new Map(),
    };
    map.set(name, node);
    return node;
  };

  paths.forEach((path) => {
    const parts = path.split("/").filter(Boolean);
    let currentMap = root;
    let currentPath = "";
    parts.forEach((segment, index) => {
      const isFile = index === parts.length - 1;
      const nextPath = currentPath ? `${currentPath}/${segment}` : segment;
      const node = addNode(currentMap, segment, nextPath, isFile ? "file" : "folder");
      if (!isFile) {
        currentMap = node.children;
        currentPath = nextPath;
      }
    });
  });

  const folderPaths = new Set<string>();

  const toArray = (map: Map<string, FileTreeBuildNode>): FileTreeNode[] => {
    const nodes = Array.from(map.values()).map((node) => {
      if (node.type === "folder") {
        folderPaths.add(node.path);
      }
      return {
        name: node.name,
        path: node.path,
        type: node.type,
        children: node.type === "folder" ? toArray(node.children) : [],
      };
    });
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    return nodes;
  };

  return { nodes: toArray(root), folderPaths };
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
    case "py":
    case "rs":
    case "swift":
    case "go":
    case "java":
    case "kt":
    case "cs":
    case "cpp":
    case "c":
    case "h":
    case "hpp":
    case "sh":
    case "zsh":
    case "bash":
      return FileCode;
    case "json":
      return FileJson;
    case "md":
    case "mdx":
    case "txt":
    case "rtf":
      return FileText;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
    case "heic":
      return FileImage;
    case "mp4":
    case "mov":
    case "m4v":
    case "webm":
      return FileVideo;
    case "mp3":
    case "wav":
    case "flac":
    case "m4a":
      return FileAudio;
    case "zip":
    case "gz":
    case "tgz":
    case "tar":
    case "7z":
    case "rar":
      return FileArchive;
    case "csv":
    case "tsv":
    case "xls":
    case "xlsx":
      return FileSpreadsheet;
    default:
      return File;
  }
}

export function FileTreePanel({
  workspacePath,
  files,
  onToggleFilePanel,
}: FileTreePanelProps) {
  const { nodes, folderPaths } = useMemo(() => buildTree(files), [files]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedFolders((prev) => {
      const next = new Set<string>();
      prev.forEach((path) => {
        if (folderPaths.has(path)) {
          next.add(path);
        }
      });
      if (next.size === 0) {
        nodes.forEach((node) => {
          if (node.type === "folder") {
            next.add(node.path);
          }
        });
      }
      return next;
    });
  }, [folderPaths, nodes]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const resolvePath = (relativePath: string) => {
    const base = workspacePath.endsWith("/")
      ? workspacePath.slice(0, -1)
      : workspacePath;
    return `${base}/${relativePath}`;
  };

  async function showFileMenu(
    event: MouseEvent<HTMLButtonElement>,
    relativePath: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const menu = await Menu.new({
      items: [
        await MenuItem.new({
          text: "Reveal in Finder",
          action: async () => {
            await revealItemInDir(resolvePath(relativePath));
          },
        }),
      ],
    });
    const window = getCurrentWindow();
    const position = new LogicalPosition(event.clientX, event.clientY);
    await menu.popup(position, window);
  }

  const renderNode = (node: FileTreeNode, depth: number) => {
    const isFolder = node.type === "folder";
    const isExpanded = isFolder && expandedFolders.has(node.path);
    const FileIcon = isFolder ? Folder : getFileIcon(node.name);
    return (
      <div key={node.path}>
        <button
          type="button"
          className={`file-tree-row${isFolder ? " is-folder" : " is-file"}`}
          style={{ paddingLeft: `${depth * 14}px` }}
          onClick={() => {
            if (isFolder) {
              toggleFolder(node.path);
            }
          }}
          onContextMenu={(event) => {
            if (!isFolder) {
              void showFileMenu(event, node.path);
            }
          }}
        >
          {isFolder ? (
            <span className={`file-tree-chevron${isExpanded ? " is-open" : ""}`}>
              ›
            </span>
          ) : (
            <span className="file-tree-spacer" aria-hidden />
          )}
          <span className="file-tree-icon" aria-hidden>
            <FileIcon size={12} />
          </span>
          <span className="file-tree-name">{node.name}</span>
        </button>
        {isFolder && isExpanded && node.children.length > 0 && (
          <div className="file-tree-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="diff-panel file-tree-panel">
      <div className="git-panel-header">
        <button
          type="button"
          className="git-panel-title git-panel-title-button"
          onClick={onToggleFilePanel}
          aria-label="Show git panel"
          title="Show git panel"
        >
          <Folder className="git-panel-icon" />
          Files
          <ArrowLeftRight className="git-panel-switch-icon" aria-hidden />
        </button>
        <div className="file-tree-count">
          {files.length ? `${files.length} file${files.length === 1 ? "" : "s"}` : "No files"}
        </div>
      </div>
      <div className="file-tree-list">
        {nodes.length === 0 ? (
          <div className="file-tree-empty">No files available.</div>
        ) : (
          nodes.map((node) => renderNode(node, 0))
        )}
      </div>
    </aside>
  );
}
