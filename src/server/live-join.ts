import type { Viewer } from "./auth-viewer";
import { getRepos } from "./repos";
import { JoinRefused } from "./repos/pg";
import { linkReferral } from "./live-referrals";

export type JoinRequest = {
  slug: string;
  marketingSms: boolean;
  source: string;
  referralCode?: string | undefined;
};

/** Add a card for the signed-in guest, and note who referred them on a first join. */
export async function joinForViewer(viewer: Viewer | null, request: JoinRequest) {
  if (!viewer) return { ok: false as const, message: "Log in first, then join." };
  if (viewer.role !== "guest") {
    return {
      ok: false as const,
      message: "This login runs a restaurant. Use a separate guest login to collect stamps.",
    };
  }
  if (!viewer.customerId) {
    return { ok: false as const, message: "Add your mobile number first, then join." };
  }
  const { repos } = getRepos({
    DATA_MODE: process.env["DATA_MODE"],
    DATABASE_URL: process.env["DATABASE_URL"],
  });
  try {
    const joined = await repos.joinCard({
      slug: request.slug,
      customerId: viewer.customerId,
      marketingSms: request.marketingSms,
      source: request.source,
    });
    if (request.referralCode && !joined.alreadyMember) {
      // A referral that cannot be recorded must not undo the card.
      try {
        const card = await repos.getCard(request.slug, viewer.customerId);
        if (card) {
          await linkReferral(card.restaurant.id, joined.membershipId, request.referralCode);
        }
      } catch (error) {
        console.error("Referral link failed after join", error);
      }
    }
    return { ok: true as const, alreadyMember: joined.alreadyMember };
  } catch (error) {
    if (error instanceof JoinRefused) return { ok: false as const, message: error.message };
    console.error("Join failed", error);
    return { ok: false as const, message: "We could not add your card. Please try again." };
  }
}
