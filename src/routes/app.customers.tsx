import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { withChildren } from "@/lib/nested";
import type { CampaignAudience } from "@/data/types";
import type { CustomerFilter, CustomerSort } from "@/domain/customers";
import { countLabel } from "@/lib/count-label";
import { formatRand } from "@/lib/money";
import { EmptyState, FormField, PageHeader } from "@/components/patron/dash";

const FILTERS: CustomerFilter[] = [
  "all",
  "one_stamp_away",
  "recent30",
  "reward_ready",
  "gone_quiet",
  "new14",
  "regulars",
  "lapsed30",
  "lapsed45",
  "lapsed60",
  "sms",
  "birthdays",
];

const SORTS: CustomerSort[] = ["stamps", "fewest_stamps", "visits", "recent", "name"];
const FILTER_LABELS: Record<CustomerFilter, string> = {
  all: "All guests",
  new14: "New · 14 days",
  one_stamp_away: "One stamp away",
  recent30: "Visited in the last 30 days",
  reward_ready: "Reward ready",
  gone_quiet: "Gone quiet",
  regulars: "Regulars",
  lapsed30: "Lapsed · 30 days",
  lapsed45: "Lapsed · 45 days",
  lapsed60: "Lapsed · 60 days",
  sms: "SMS opted in",
  birthdays: "Birthdays this month",
};

const FILTER_AUDIENCE: Record<CustomerFilter, CampaignAudience> = {
  all: { type: "everyone" },
  new14: { type: "new", days: 14 },
  one_stamp_away: { type: "close_to_reward", remaining: 1 },
  recent30: { type: "everyone" },
  reward_ready: { type: "close_to_reward", remaining: 0 },
  gone_quiet: { type: "lapsed30", days: 30 },
  regulars: { type: "close_to_reward", remaining: 2 },
  lapsed30: { type: "lapsed30", days: 30 },
  lapsed45: { type: "lapsed30", days: 45 },
  lapsed60: { type: "lapsed30", days: 60 },
  sms: { type: "everyone" },
  birthdays: { type: "birthday_month" },
};

const SORT_LABELS: Record<CustomerSort, string> = {
  stamps: "Most stamps",
  fewest_stamps: "Fewest stamps",
  visits: "Most visits",
  recent: "Last visit",
  name: "Name",
};

const CustomersWithChildren = withChildren(Customers);

export const Route = createFileRoute("/app/customers")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: CustomersWithChildren,
});

function Customers() {
  const state = useDemoState();
  const session = state.session;
  const restaurant =
    state.restaurants.find((item) => item.id === session.restaurantId) ?? state.restaurants[0]!;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [sort, setSort] = useState<CustomerSort>("recent");
  const [page, setPage] = useState(1);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMembershipIds, setSelectedMembershipIds] = useState<string[]>([]);
  const [newListName, setNewListName] = useState("");
  const [newCampaignListName, setNewCampaignListName] = useState("Selected campaign guests");
  const [notice, setNotice] = useState("");
  const result = api.customers.list({
    restaurantId: restaurant.id,
    search,
    filter,
    sort,
    page,
    session: { role: session.role, restaurantId: session.restaurantId },
  });
  const data = result.ok ? result.data : { rows: [], total: 0, page: 1 };
  const pages = Math.max(1, Math.ceil(data.total / 25));
  const allMatchingResult = api.customers.matchingMembershipIds({
    restaurantId: restaurant.id,
    search,
    filter,
    sort,
    session: { role: session.role, restaurantId: session.restaurantId },
  });
  const allMatchingIds = allMatchingResult.ok ? allMatchingResult.data : [];

  const download = () => {
    const exported = api.customers.export({
      restaurantId: restaurant.id,
      actorId: session.staffId ?? session.role,
      session: { role: session.role, restaurantId: session.restaurantId },
    });
    if (!exported.ok) {
      setNotice(exported.error.message);
      return;
    }
    const blob = new Blob([exported.data.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${restaurant.slug}-guests.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Guest list exported.");
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Customers · ${restaurant.name}`}
        title="Your regulars."
        intro="Everyone who has joined your card, with their stamps, rewards and last visit. Pick a guest to see their full history."
        actions={
          <button className="builder-secondary" type="button" onClick={download}>
            Export CSV
          </button>
        }
      />
      <div className="builder-fields customer-filters">
        <FormField label="Search name or phone">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Filter">
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as CustomerFilter);
              setPage(1);
            }}
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {FILTER_LABELS[f]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Sort">
          <select value={sort} onChange={(event) => setSort(event.target.value as CustomerSort)}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <p className="demo-data-note">
        {countLabel(data.total, "guest")} · page {data.page} of {pages}
      </p>
      <div className="customer-list-actions">
        <button className="builder-secondary" type="button" onClick={() => { setSelectMode((active) => !active); setSelectedMembershipIds([]); }}>{selectMode ? "Done selecting" : "Select"}</button>
        {selectMode && <button className="builder-secondary" type="button" onClick={() => setSelectedMembershipIds((current) => allMatchingIds.length > 0 && allMatchingIds.every((id) => current.includes(id)) ? current.filter((id) => !allMatchingIds.includes(id)) : [...new Set([...current, ...allMatchingIds])])}>Select all matching ({allMatchingIds.length})</button>}
        {selectMode && <input aria-label="New campaign list name" value={newCampaignListName} onChange={(event) => setNewCampaignListName(event.target.value)} placeholder="Campaign list name" />}
        {selectMode && <button className="builder-secondary" type="button" onClick={() => {
          const saved = api.audience.saveList({ restaurantId: restaurant.id, name: newCampaignListName, membershipIds: selectedMembershipIds });
          if (!saved.ok) { setNotice(saved.error.message); return; }
          setNotice("Saved selected guests. Opening a campaign draft.");
          window.location.href = `/app/campaigns/new?listId=${encodeURIComponent(saved.data.id)}`;
        }} disabled={selectedMembershipIds.length === 0 || !newCampaignListName.trim()}>Create campaign for these</button>}
      </div>
      {selectMode && <div className="customer-list-actions"><label className="builder-field">New list name<input value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="e.g. Saturday regulars" /></label><button className="builder-primary" type="button" disabled={selectedMembershipIds.length === 0 || !newListName.trim()} onClick={() => { const saved = api.audience.saveList({ restaurantId: restaurant.id, name: newListName, membershipIds: selectedMembershipIds }); setNotice(saved.ok ? `Saved ${saved.data.name}.` : saved.error.message); if (saved.ok) { setNewListName(""); setSelectedMembershipIds([]); } }}>Add to list</button><label className="builder-field">Add to existing list<select value="" onChange={(event) => { if (!event.target.value) return; const list = api.audience.lists(restaurant.id).find((item) => item.id === event.target.value); if (!list) return; const saved = api.audience.saveList({ id: list.id, restaurantId: restaurant.id, name: list.name, membershipIds: [...list.membershipIds, ...selectedMembershipIds] }); setNotice(saved.ok ? `Added selected guests to ${saved.data.name}.` : saved.error.message); }}><option value="">Choose a list…</option>{api.audience.lists(restaurant.id).map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label></div>}
      <div className="customer-table">
        {data.rows.map((row) => (
          <div
            className="customer-row"
            key={row.membershipId}
            role={selectMode ? "group" : undefined}
          >
            {selectMode && <label className="customer-select"><input type="checkbox" checked={selectedMembershipIds.includes(row.membershipId)} onChange={(event) => setSelectedMembershipIds((current) => event.target.checked ? [...current, row.membershipId] : current.filter((id) => id !== row.membershipId))} aria-label={`Select ${row.name}`} /></label>}
            <a className="customer-row-main" href={`/app/customers/${row.customerId}`}>
              <span>
                <strong>{row.name}</strong>
                <small>{row.maskedPhone}</small>
              </span>
              <span className="customer-row-meta">
                <span>{countLabel(row.stampsCurrent, "stamp")}</span>
                {row.rewardsWaiting > 0 && (
                  <span className="reward-pill">
                    {countLabel(row.rewardsWaiting, "reward")} ready
                  </span>
                )}
              </span>
              <small>
                {row.lastVisitAt
                  ? `Last visit ${new Intl.DateTimeFormat("en-ZA", {
                      dateStyle: "medium",
                    }).format(new Date(row.lastVisitAt))}`
                  : "No visits yet"}
                {row.smsOptedIn ? " · SMS on" : ""}
                {row.estimatedSpendCents !== null
                  ? ` · about ${formatRand(row.estimatedSpendCents)} spent`
                  : ""}
              </small>
              <b aria-hidden="true">›</b>
            </a>
          </div>
        ))}
      </div>
      {data.total === 0 && (
        <EmptyState
          title="No guests match these filters."
          hint="Try a different filter, or clear the search to see everyone."
        />
      )}
      <div className="demo-control-actions">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
      {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}
    </main>
  );
}
