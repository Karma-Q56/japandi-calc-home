import { useSyncExternalStore } from "react";
import { demoRepo } from "./repo";
import type { DemoState } from "./types";
import { createSeed } from "./seed";

let seedSnapshot: DemoState | null = null;

function getSeedSnapshot(): DemoState {
  if (!seedSnapshot) seedSnapshot = createSeed();
  return seedSnapshot;
}

/**
 * Hydration-safe demo state. Server snapshot and first client render
 * use a fixed seed snapshot, then switch to stored state after mount.
 */
export function useDemoState(): DemoState {
  return useSyncExternalStore(
    demoRepo.subscribe,
    () => demoRepo.read(),
    () => getSeedSnapshot(),
  );
}
