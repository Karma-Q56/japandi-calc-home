import { withChildren } from "@/lib/nested";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { useDemoState } from "@/data/useDemoState";

const OpsCampaignsPage = withChildren(OpsCampaigns);
export const Route = createFileRoute("/ops/campaigns")({
  beforeLoad: () => {
    if (!requireRole("operator")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  component: OpsCampaignsPage,
});

function OpsCampaigns() {
  const state = useDemoState();
  const [restaurantId, setRestaurantId] = useState(state.restaurants[0]?.id ?? "");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const drafts = state.campaigns
    .filter((c) => c.status === "draft" || (c.requiresApproval && !c.approvedBy))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const create = () => {
    const saved = api.campaign.saveDraft({
      restaurantId,
      actor: "operator",
      actorRole: "operator",
      fields: { name: name || "Operator draft", body, audience: { type: "all_opted_in" } },
    });
    setNotice(
      saved.ok
        ? "Draft saved. It needs the owner's approval before it can send."
        : saved.error.message,
    );
  };
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Operator workspace
      </p>
      <h1>Campaign drafts.</h1>
      <p className="demo-intro">
        Operator drafts always need the owner&apos;s approval. Nothing sends until then.
      </p>
      <section className="guest-panel">
        <h2>New draft</h2>
        <label className="builder-field">
          Restaurant
          <select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}>
            {state.restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="builder-field">
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="builder-field">
          Message
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} />
        </label>
        <button className="builder-primary" onClick={create}>
          Save draft
        </button>
      </section>
      <section className="guest-panel">
        <h2>Drafts waiting</h2>
        {drafts.length === 0 && <p className="demo-data-note">No drafts.</p>}
        {drafts.map((campaign) => {
          const restaurant = state.restaurants.find((r) => r.id === campaign.restaurantId);
          return (
            <div className="outbox-meta" key={campaign.id}>
              <span>
                <strong>{campaign.name}</strong> · {restaurant?.name} ·{" "}
                {campaign.requiresApproval && !campaign.approvedBy
                  ? "needs owner approval"
                  : campaign.status}
              </span>
              <span className={`status-pill ${campaign.status}`}>{campaign.status}</span>
            </div>
          );
        })}
      </section>
      {notice && (
        <p className="demo-data-note" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}
