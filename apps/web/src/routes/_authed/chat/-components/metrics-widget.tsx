import { Button } from "@/components/ui/button";
import { MetricsData } from "@/entities/telemetry";
import { BarChart3 } from "lucide-react";
import { useState } from "react";

export function MetricsWidget({ metrics }: { metrics: MetricsData }) {
  const [isOpen, setIsOpen] = useState(false);

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;

    return n.toFixed(0);
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-1.5"
      >
        <BarChart3 className="h-4 w-4" />
        <span className="text-xs font-mono">
          {formatNumber(metrics.totalTokens)}
        </span>
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border bg-popover p-4 shadow-lg z-50">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Requests</span>
              <span className="font-mono">{metrics.requestCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Input Tokens</span>
              <span className="font-mono">
                {formatNumber(metrics.totalInputTokens)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Output Tokens</span>
              <span className="font-mono">
                {formatNumber(metrics.totalOutputTokens)}
              </span>
            </div>
            <div className="border-t pt-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Total Tokens</span>
              <span className="font-mono font-semibold">
                {formatNumber(metrics.totalTokens)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Avg/Request</span>
              <span className="font-mono">
                {formatNumber(metrics.avgTokensPerRequest)}
              </span>
            </div>
            {(metrics.totalCacheReadTokens > 0 ||
              metrics.totalCacheCreationTokens > 0) && (
              <>
                <div className="border-t pt-3 flex justify-between text-sm">
                  <span className="text-muted-foreground">Cache Reads</span>
                  <span className="font-mono text-green-600">
                    {formatNumber(metrics.totalCacheReadTokens)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cache Writes</span>
                  <span className="font-mono">
                    {formatNumber(metrics.totalCacheCreationTokens)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cache Hit Rate</span>
                  <span className="font-mono">
                    {metrics.cacheHitRate.toFixed(0)}%
                  </span>
                </div>
              </>
            )}
            <div className="text-xs text-muted-foreground pt-2 border-t">
              Updated: {new Date(metrics.lastUpdated).toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
