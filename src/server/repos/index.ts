import { getDataMode, requireDatabaseUrl } from "@/server/db/mode";
import { createDemoRepos } from "./demo";
import { createPgRepos } from "./pg";
import type { PatronRepos } from "./contracts";

export type RepoEnv = {
  DATA_MODE?: string | undefined;
  DATABASE_URL?: string | undefined;
  restaurantId?: string | null | undefined;
  customerId?: string | null | undefined;
  isOperator?: boolean | undefined;
};

export function getRepos(env?: RepoEnv): { mode: "demo" | "live"; repos: PatronRepos } {
  const mode = getDataMode(env);
  if (mode === "demo") return { mode, repos: createDemoRepos() };
  const databaseUrl = requireDatabaseUrl(env);
  return {
    mode,
    repos: createPgRepos({
      databaseUrl,
      restaurantId: env?.restaurantId ?? null,
      customerId: env?.customerId ?? null,
      isOperator: env?.isOperator ?? false,
    }),
  };
}
