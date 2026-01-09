import { useState, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Instance } from "@/lib/instances";

interface InstanceTabsProps {
  instances: Instance[];
  activeInstanceId: string;
  onSelect: (instanceId: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function InstanceTabs({
  instances,
  activeInstanceId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: InstanceTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleDoubleClick = (instance: Instance) => {
    setEditingId(instance.id);
    setEditValue(instance.name);
  };

  const handleEditSubmit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue("");
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleEditSubmit();
    } else if (e.key === "Escape") {
      setEditingId(null);
      setEditValue("");
    }
  };

  const handleCreate = () => {
    const existingNumbers = instances
      .map((i) => {
        const match = i.name.match(/^Instance (\d+)$/);
        return match?.[1] ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);

    const nextNumber =
      existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 2;
    const name = `Instance ${nextNumber}`;
    onCreate(name);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (id === "default") return;

    const instance = instances.find((i) => i.id === id);
    if (
      instance &&
      confirm(`Delete "${instance.name}"? This will remove all its sessions.`)
    ) {
      onDelete(id);
    }
  };

  return (
    <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 border-b">
      {instances.map((instance) => (
        <div
          key={instance.id}
          className={cn(
            "group flex items-center gap-1 px-3 py-1.5 rounded-t-md text-sm cursor-pointer transition-colors",
            activeInstanceId === instance.id
              ? "bg-background border border-b-0 border-border -mb-px"
              : "hover:bg-muted"
          )}
          onClick={() => onSelect(instance.id)}
          onDoubleClick={() => handleDoubleClick(instance)}
        >
          {editingId === instance.id ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleEditSubmit}
              onKeyDown={handleEditKeyDown}
              className="bg-transparent border-none outline-none text-sm w-24 focus:ring-0"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate max-w-32">{instance.name}</span>
          )}
          {instance.id !== "default" && (
            <button
              onClick={(e) => handleDelete(e, instance.id)}
              className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity p-0.5 -mr-1"
              title="Delete instance"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={handleCreate}
        className="flex items-center justify-center p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title="New instance"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
