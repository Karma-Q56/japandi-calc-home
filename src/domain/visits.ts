import { demoRepo } from "@/data/repo";
import { visitPattern } from "@/lib/visits";
import type { VisitPattern } from "@/lib/visits";

/** The visit pattern for one membership, from the restaurant's own stamps. */
export function visitPatternFor(membershipId: string): VisitPattern {
  const state = demoRepo.read();
  const stamps = state.stamps.filter(
    (stamp) => stamp.membershipId === membershipId && stamp.status !== "undone",
  );
  return visitPattern(stamps, new Date(state.now).toISOString());
}
