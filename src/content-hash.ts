import { normalizeAppData, serializeAppData } from "./storage";
import type { AppData } from "./types";

export function hashAppData(data: AppData): string {
  return serializeAppData(normalizeAppData(structuredClone(data)));
}
