import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, updateDemo } from "@/data/repo";
import type { MenuItem } from "@/data/types";
import { clock } from "@/lib/clock";
import {
  menuVersionsFor,
  publishRestoredMenu,
  restoreMenuDraft,
  snapshotMenu,
} from "@/domain/menuVersions";

const DAILY = "rest-daily-grind";
const SUNRISE = "rest-sunrise-bakes";

function firstItem(restaurantId: string): MenuItem {
  const item = demoRepo.read().items.find((entry) => entry.restaurantId === restaurantId);
  if (!item) throw new Error("The seed has no menu item for this restaurant.");
  return item;
}

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

describe("menu versions", () => {
  it("keeps a snapshot per publish for this venue only", () => {
    const before = menuVersionsFor(DAILY).length;
    expect(before).toBe(0);
    const result = snapshotMenu(DAILY, "Flat white published");
    expect(result.ok).toBe(true);
    const versions = menuVersionsFor(DAILY);
    expect(versions).toHaveLength(1);
    expect(versions[0]!.summary).toBe("Flat white published");
    expect(versions[0]!.sections.every((item) => item.restaurantId === DAILY)).toBe(true);
    expect(versions[0]!.items.every((item) => item.restaurantId === DAILY)).toBe(true);
    expect(menuVersionsFor(SUNRISE)).toHaveLength(0);
  });

  it("restores as a draft and leaves the live menu untouched", () => {
    const live = firstItem(DAILY);
    const snapshot = snapshotMenu(DAILY, "Before the price change");
    expect(snapshot.ok).toBe(true);
    const versionId = snapshot.ok ? snapshot.data.id : "";

    updateDemo((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === live.id ? { ...item, name: "Changed after the snapshot" } : item,
      ),
    }));
    const changed = demoRepo.read().items.find((item) => item.id === live.id)!;
    expect(changed.name).toBe("Changed after the snapshot");

    const draft = restoreMenuDraft(DAILY, versionId);
    expect(draft.ok).toBe(true);
    if (draft.ok) {
      expect(draft.data.items.find((item) => item.id === live.id)?.name).toBe(live.name);
    }
    // Restoring a draft is not publishing it.
    expect(demoRepo.read().items.find((item) => item.id === live.id)!.name).toBe(
      "Changed after the snapshot",
    );
    expect(menuVersionsFor(DAILY)).toHaveLength(1);
  });

  it("puts the restored menu live only when the owner publishes it", () => {
    const live = firstItem(DAILY);
    const snapshot = snapshotMenu(DAILY, "Before the price change");
    if (!snapshot.ok) throw new Error("Snapshot failed.");
    updateDemo((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === live.id ? { ...item, name: "Changed after the snapshot" } : item,
      ),
    }));

    const published = publishRestoredMenu(DAILY, snapshot.data.id);
    expect(published.ok).toBe(true);
    expect(demoRepo.read().items.find((item) => item.id === live.id)!.name).toBe(live.name);
    const versions = menuVersionsFor(DAILY);
    expect(versions).toHaveLength(2);
    expect(versions[0]!.summary).toContain("Restored the menu from");
  });

  it("keeps only the last ten menus per venue", () => {
    for (let index = 0; index < 12; index++) {
      expect(snapshotMenu(DAILY, `Version ${index}`).ok).toBe(true);
      clock.advance(60000);
    }
    const versions = menuVersionsFor(DAILY);
    expect(versions).toHaveLength(10);
    expect(versions[0]!.summary).toBe("Version 11");
    snapshotMenu(SUNRISE, "Sunrise menu");
    expect(menuVersionsFor(DAILY)).toHaveLength(10);
    expect(menuVersionsFor(SUNRISE)).toHaveLength(1);
  });

  it("never restores another venue's version", () => {
    const other = snapshotMenu(SUNRISE, "Sunrise menu");
    if (!other.ok) throw new Error("Snapshot failed.");
    const draft = restoreMenuDraft(DAILY, other.data.id);
    expect(draft.ok).toBe(false);
    if (!draft.ok) expect(draft.error.code).toBe("NOT_FOUND");
    const published = publishRestoredMenu(DAILY, other.data.id);
    expect(published.ok).toBe(false);
    expect(demoRepo.read().items.some((item) => item.restaurantId === DAILY)).toBe(true);
  });
});
