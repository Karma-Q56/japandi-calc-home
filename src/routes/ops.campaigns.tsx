import { failureMessage } from "@/lib/live-ops-inbox";
import { withChildren } from "@/lib/nested";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { useDemoState } from "@/data/useDemoState";
import { Badge, FormField, PageHeader, PreviewBanner } from "@/components/patron/dash";
import { getDataModeFn } from "@/server/live";
import { listPendingCampaignsFn } from "@/server/live-ops-inbox-fns";
import { LiveOpsCampaigns } from "@/components/patron/live/ops/LiveOpsCampaigns";

const OpsCampaignsPage = withChildren(OpsCampaigns);
export const Route = createFileRoute("/ops/campaigns")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("operator")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await listPendingCampaignsFn() };
  },
  component: withChildren(LiveOrDemoCampaigns),
});

function LiveOrDemoCampaigns() {
  const { mode, live } = Route.useLoaderData();
  if (mode === "live" && live?.ok) return <LiveOpsCampaigns initial={live.rows} />;
  if (mode === "live") return <p className="demo-data-note">{failureMessage(live) ?? "Could not load campaigns."}</p>;
  return <OpsCampaignsPage />;
}

function OpsCampaigns() {
  const state = useDemoState();
  const [restaurantId, setRestaurantId] = useState(state.restaurants[0]?.id ?? "");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const restaurant = state.restaurants.find((item) => item.id === restaurantId);
  const autoApprove = restaurant?.campaignAutoApprove ?? false;
  const segments = body.trim() ? api.campaign.messageSegments(body, "Thandi") : 0;
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
        ? autoApprove
          ? "Draft saved. Auto approve is on for this restaurant, so the owner can send it."
          : "Draft saved. It needs the owner's approval before it can send."
        : saved.error.message,
    );
    if (saved.ok) {
      setName("");
      setBody("");
    }
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Operator workspace"
        title="Campaign drafts."
        intro="Write a campaign for any restaurant. Owners see it as approval needed with a preview. Nothing sends until the owner approves, unless they turned auto approve on."
      />

      <div className="inbox-layout">
        <section className="builder-panel">
          <h2>New draft</h2>
          <FormField label="Restaurant">
            <select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}>
              {state.restaurants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Campaign name" hint="Only your team sees this. Guests see their card name.">
            <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <FormField
            label="Message"
            hint={`${body.trim().length} of 600 letters. ${segments} SMS segment${segments === 1 ? "" : "s"} with the STOP footer. First names are filled in per guest.`}
          >
            <textarea
              value={body}
              maxLength={600}
              rows={5}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Hi {first name}, Tuesday is quiet so we made it worthwhile…"
            />
          </FormField>
          <p className="demo-data-note">
            {autoApprove
              ? `${restaurant?.name ?? "This restaurant"} turned auto approve on. Their owner still confirms the cost before sending.`
              : `${restaurant?.name ?? "This restaurant"} has not turned auto approve on. The owner must approve this draft.`}
          </p>
          <div className="page-actions">
            <button className="builder-primary" onClick={create} disabled={!body.trim() || !restaurantId}>
              Save draft
            </button>
          </div>
          {notice && (
            <p className="demo-data-note" role="status">
              {notice}
            </p>
          )}
        </section>

        <section className="builder-panel">
          <h2>Preview</h2>
          <div className="cmp-phone">
            <small>From {restaurant?.senderName ?? "the restaurant"}</small>
            <p>{body.trim() || "Your message will appear here as the guest sees it."}</p>
            <small>Reply STOP to opt out</small>
          </div>
          <PreviewBanner>Preview only. Nothing was sent.</PreviewBanner>
          <p className="demo-data-note">
            Consent and STOP are checked again at send time. Guests who opted out never receive it.
          </p>
        </section>
      </div>

      <section className="builder-panel">
        <h2>Drafts waiting</h2>
        {drafts.length === 0 && <p className="demo-data-note">No drafts waiting.</p>}
        {drafts.map((campaign) => {
          const owner = state.restaurants.find((item) => item.id === campaign.restaurantId);
          return (
            <div className="outbox-meta" key={campaign.id}>
              <span>
                <strong>{campaign.name}</strong> · {owner?.name} · {campaign.status}
              </span>
              <span>
                {campaign.requiresApproval && !campaign.approvedBy ? (
                  <Badge>Needs owner approval</Badge>
                ) : (
                  <Badge tone="active">Owner can send</Badge>
                )}
              </span>
            </div>
          );
        })}
      </section>
    </main>
  );
}
