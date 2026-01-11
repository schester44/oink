import { useEffect, useState } from "react";
import { getHealthServerFn, type HealthStatus } from "@/lib/health";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GatewayStatusProps {
  initialHealth: HealthStatus;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function GatewayStatus({ initialHealth }: GatewayStatusProps) {
  const [health, setHealth] = useState<HealthStatus>(initialHealth);

  // Poll health every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const result = await getHealthServerFn();
      setHealth(result);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const statusColor = {
    ok: "bg-green-500",
    degraded: "bg-yellow-500",
    error: "bg-red-500",
  }[health.status];

  const statusText = {
    ok: "Connected",
    degraded: "Degraded",
    error: "Disconnected",
  }[health.status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-xs text-muted-foreground cursor-default">
            <span
              className={`h-2 w-2 rounded-full ${statusColor} ${health.status === "ok" ? "animate-pulse" : ""}`}
            />
            <span className="hidden sm:inline">{statusText}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs space-y-1">
            <div>Gateway: {statusText}</div>
            <div>Version: {health.version}</div>
            <div>Uptime: {formatUptime(health.uptime)}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
