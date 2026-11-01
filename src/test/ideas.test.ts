import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo } from "@/data/repo";
import { clock } from "@/lib/clock";
import {
  countAsks,
  ideaDetails,
  IDEA_STATUSES,
  listIdeas,
  listIdeasForOwner,
  submitIdea,
  updateIdea,
} from "@/domain/ideas";

beforeEach(() => {
  demoRepo.reset();
  clock.reset();
});

const OWNER = { role: "owner", restaurantId: "rest-daily-grind" };
const OPERATOR = { role: "operator" };

describe("ideas", () => {
  it("stores the first ask with no contact fields", () => {
    const saved = submitIdea({ place: "Corner Coffee", suburb: "Melville" });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.data.asks).toBe(1);
    const stored = demoRepo.read().ideas.find((idea) => idea.id === saved.data.id);
    expect(stored?.place).toBe("Corner Coffee");
    expect(stored?.status).toBe("new");
    expect(Object.keys(stored ?? {})).not.toContain("phone");
    expect(Object.keys(stored ?? {})).not.toContain("email");
  });

  it("counts a repeat ask on the same row and keeps the newest note", () => {
    const first = submitIdea({ place: "Rose Cafe", suburb: "Melville", note: "nice pastries" });
    const second = submitIdea({ place: "rose cafe  ", suburb: " MELVILLE ", note: "and the flat white" });
    expect(second.ok).toBe(true);
    const stored = demoRepo.read().ideas.find((idea) => idea.id === (first.ok ? first.data.id : ""));
    expect(stored?.asks).toBe(2);
    expect(stored?.note).toBe("and the flat white");
  });

  it("rejects a missing place or suburb and the honeypot", () => {
    expect(submitIdea({ place: "", suburb: "Melville" }).ok).toBe(false);
    expect(submitIdea({ place: "Cafe", suburb: "" }).ok).toBe(false);
    expect(submitIdea({ place: "Cafe", suburb: "Melville", website: "bot" }).ok).toBe(false);
  });

  it("caps the note and name length", () => {
    const longNote = "x".repeat(401);
    const longName = "y".repeat(61);
    expect(submitIdea({ place: "Cafe", suburb: "Melville", note: longNote }).ok).toBe(false);
    expect(submitIdea({ place: "Cafe", suburb: "Melville", name: longName }).ok).toBe(false);
  });

  it("shows the owner asks in their suburb only, without names", () => {
    const board = listIdeasForOwner({ session: OWNER });
    expect(board.ok).toBe(true);
    if (!board.ok) return;
    expect(board.data.suburb).toBe("Parkhurst");
    const names = board.data.places.map((place) => place.place);
    expect(names).toContain("Velo Coffee Roasters");
    expect(names).not.toContain("Kota King");
    // No guest names and no note text on the owner board.
    expect(JSON.stringify(board.data)).not.toContain("Caleb");
  });

  it("refuses the board without a restaurant session", () => {
    expect(listIdeasForOwner({ session: { role: "owner" } }).ok).toBe(false);
    expect(listIdeasForOwner({ session: OPERATOR }).ok).toBe(false);
  });

  it("lists, filters and counts for operators only", () => {
    expect(listIdeas({ session: OWNER }).ok).toBe(false);
    const all = listIdeas({ session: OPERATOR });
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.data.counts.new).toBeGreaterThanOrEqual(2);
    const parkhurst = listIdeas({ session: OPERATOR, filters: { suburb: "Parkhurst" } });
    if (!parkhurst.ok) return;
    expect(parkhurst.data.ideas.every((idea) => idea.suburb === "Parkhurst")).toBe(true);
    const searching = listIdeas({ session: OPERATOR, filters: { search: "velo" } });
    if (!searching.ok) return;
    expect(searching.data.ideas).toHaveLength(1);
  });

  it("updates status and notes with an audit trail", () => {
    const list = listIdeas({ session: OPERATOR });
    if (!list.ok) return;
    const idea = list.data.ideas[0];
    if (!idea) return;
    const before = demoRepo.read().audit.length;
    const updated = updateIdea({ id: idea.id, status: "exploring", notes: "Called the owner.", session: OPERATOR });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data.status).toBe("exploring");
    expect(updated.data.adminNotes).toBe("Called the owner.");
    expect(demoRepo.read().audit.length).toBeGreaterThan(before);
    expect(updateIdea({ id: idea.id, status: "exploring", session: OWNER }).ok).toBe(false);
  });

  it("copies plain text details without adding contact fields", () => {
    const list = listIdeas({ session: OPERATOR });
    if (!list.ok) return;
    const idea = list.data.ideas[0];
    if (!idea) return;
    const text = ideaDetails(idea);
    expect(text).toContain(`Place: ${idea.place}`);
    expect(text).toContain(`Status: New`);
  });

  it("keeps the status list small", () => {
    expect(IDEA_STATUSES).toEqual(["new", "exploring", "added"]);
  });

  it("counts asks on the stored rows", () => {
    expect(countAsks(demoRepo.read().ideas, "Velo Coffee Roasters", "Parkhurst")).toBe(4);
    expect(countAsks(demoRepo.read().ideas, "Velo Coffee Roasters", "Melville")).toBe(0);
  });
});
