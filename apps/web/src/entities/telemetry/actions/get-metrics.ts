import { createServerFn } from "@tanstack/react-start";
import { getMetrics } from "../index";

export const getMetricsServerFn = createServerFn().handler(async () => {
  return getMetrics();
});
