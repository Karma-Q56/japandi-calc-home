import { demoRepo, updateDemo } from "@/data/repo";
import type { MenuVersion } from "@/data/types";
import { publishedBy } from "./actor";
import { failure, success, type ApiResult } from "./demo";

/** Keep the last ten published menus per venue, never more. */
const VERSION_LIMIT = 10;

/** A copy of this venue's menu, taken at publish time. */
export function snapshotMenu(
  restaurantId: string,
  summary = "Menu saved",
): ApiResult<MenuVersion> {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === restaurantId);
  if (!restaurant) return failure("NOT_FOUND", "Restaurant not found.");
  const version: MenuVersion = {
    id: `menuversion-${crypto.randomUUID()}`,
    restaurantId,
    at: new Date(state.now).toISOString(),
    by: publishedBy(),
    summary,
    sections: state.sections
      .filter((item) => item.restaurantId === restaurantId)
      .map((item) => ({ ...item })),
    items: state.items
      .filter((item) => item.restaurantId === restaurantId)
      .map((item) => ({ ...item })),
  };
  updateDemo((current) => ({
    ...current,
    menuVersions: keepLatest(current.menuVersions, version, VERSION_LIMIT),
  }));
  return success(version);
}

/** Newest first, this venue only. */
export function menuVersionsFor(restaurantId: string): MenuVersion[] {
  return demoRepo
    .read()
    .menuVersions.filter((item) => item.restaurantId === restaurantId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Read an old menu as a draft. Live sections and items stay exactly as they
 * are until the owner publishes the restored menu.
 */
export function restoreMenuDraft(
  restaurantId: string,
  versionId: string,
): ApiResult<MenuVersion> {
  const version = demoRepo
    .read()
    .menuVersions.find((item) => item.id === versionId && item.restaurantId === restaurantId);
  if (!version) return failure("NOT_FOUND", "That menu version is no longer kept.");
  return success({
    ...version,
    sections: version.sections.map((item) => ({ ...item })),
    items: version.items.map((item) => ({ ...item })),
  });
}

/** The only place a restored menu reaches guests. */
export function publishRestoredMenu(
  restaurantId: string,
  versionId: string,
): ApiResult<MenuVersion> {
  const draft = restoreMenuDraft(restaurantId, versionId);
  if (!draft.ok) return draft;
  updateDemo((current) => ({
    ...current,
    sections: [
      ...current.sections.filter((item) => item.restaurantId !== restaurantId),
      ...draft.data.sections.map((item) => ({ ...item, restaurantId })),
    ],
    items: [
      ...current.items.filter((item) => item.restaurantId !== restaurantId),
      ...draft.data.items.map((item) => ({ ...item, restaurantId })),
    ],
  }));
  return snapshotMenu(
    restaurantId,
    `Restored the menu from ${new Intl.DateTimeFormat("en-ZA", {
      dateStyle: "medium",
      timeZone: "Africa/Johannesburg",
    }).format(new Date(draft.data.at))}`,
  );
}

function keepLatest(
  all: MenuVersion[],
  version: MenuVersion,
  limit: number,
): MenuVersion[] {
  const others = all.filter((item) => item.restaurantId !== version.restaurantId);
  const mine = [
    version,
    ...all.filter((item) => item.restaurantId === version.restaurantId),
  ];
  return [...others, ...mine.slice(0, limit)];
}
