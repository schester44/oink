import { useState } from "react";
import { ImageIcon, Maximize2, X } from "lucide-react";
import type { ImageData } from "./generative-ui/image";

// Re-export for convenience
export type { ImageData } from "./generative-ui/image";

function getFileName(path?: string): string {
  if (!path) return "Image";
  const parts = path.split("/");
  return parts[parts.length - 1] || "Image";
}

export function ImageCard({ data }: { data: ImageData }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const fileName = getFileName(data.path);
  const dataUrl = `data:${data.mimeType};base64,${data.data}`;
  
  return (
    <>
      {/* Thumbnail view */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 my-2 max-w-md">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2 text-sm">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium truncate flex-1" title={data.path}>
            {fileName}
          </span>
          <button
            onClick={() => setIsExpanded(true)}
            className="p-1 hover:bg-muted rounded transition-colors"
            title="View full size"
          >
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        
        {/* Thumbnail image */}
        <div 
          className="relative rounded overflow-hidden bg-black/5 dark:bg-white/5 cursor-pointer"
          onClick={() => setIsExpanded(true)}
        >
          <img
            src={dataUrl}
            alt={fileName}
            className="max-w-full max-h-64 object-contain mx-auto"
          />
        </div>
        
        {/* Optional description */}
        {data.description && (
          <p className="text-xs text-muted-foreground mt-2">
            {data.description}
          </p>
        )}
      </div>
      
      {/* Full-size modal */}
      {isExpanded && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setIsExpanded(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <button
              onClick={() => setIsExpanded(false)}
              className="absolute -top-10 right-0 p-2 text-white/80 hover:text-white transition-colors"
              title="Close"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={dataUrl}
              alt={fileName}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            {data.path && (
              <p className="text-white/60 text-sm text-center mt-2">
                {data.path}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
