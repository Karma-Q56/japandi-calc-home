import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { EmptyState, PageHeader } from "@/components/patron/dash";

import type { CampaignAudience } from "@/data/types";

export const Route = createFileRoute("/app/insights")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: InsightsPage,
});

/** One tap opens the composer with that group already chosen. */
function audienceFor(key: string, weekday: number): CampaignAudience | null {
  switch (key) {
    case "day":
      return { type: "weekday", weekday };
    case "items":
      return { type: "everyone" };
    case "slipping":
      return { type: "lapsed30", days: 30 };
    case "birthdays":
      return { type: "birthday_month" };
    case "new":
      return { type: "new", days: 14 };
    default:
      return null;
  }
}

function InsightsPage() {
  const state = useDemoState();
  const navigate = useNavigate();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const result = api.insights.owner({
    restaurantId: restaurant.id,
    session: { role: state.session.role, restaurantId: state.session.restaurantId },
  });
  if (!result.ok) {
    return (
      <main className="demo-hub page-width">
        <PageHeader
          eyebrow={`Insights · ${restaurant.name}`}
          title="We could not build your insights."
          intro={result.error.message}
        />
        <p>
          <a href="/app">Back to the dashboard</a>
        </p>
      </main>
    );
  }
  const data = result.data;

  const message = (audience: CampaignAudience | null) => {
    if (!audience) return;
    const search: Record<string, string> = {};
    if (audience.type === "weekday") search["segment"] = "weekday";
    if (audience.type === "weekday") search["weekday"] = String(audience.weekday);
    if (audience.type === "birthday_month") search["segment"] = "birthday_month";
    void navigate({
      to: "/app/campaigns/new",
      search: search as never,
    });
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Insights · ${restaurant.name}`}
        title="What your guests are telling you."
        intro="Every block comes from your own stamps, orders and join list. One tap opens the message window with that group already chosen."
      />
      <div className="insights-grid">
        <section className="builder-panel">
          <h2>Busiest days</h2>
          <BlockList
            items={data.busiestDays.map((block) => ({
              key: `day-${block.weekday}`,
              name: `${plural(block.visits, "visit")} on ${pluralDay(block.weekday)}`,
              audience: audienceFor("day", block.weekday),
            }))}
            onMessage={message}
            empty="Not enough visits yet to spot a pattern."
          />
        </section>
        <section className="builder-panel">
          <h2>Busiest times</h2>
          <BlockList
            items={data.busiestTimes.map((block) => ({
              key: `time-${block.bucket}`,
              name: `${plural(block.visits, "visit")} ${block.label}`,
              audience: audienceFor("day", data.busiestDays[0]?.weekday ?? 0),
            }))}
            onMessage={message}
            empty="No stamped visits yet."
          />
        </section>
        <section className="builder-panel">
          <h2>Quiet days</h2>
          <BlockList
            items={data.quietDays.map((block) => ({
              key: `quiet-${block.weekday}`,
              name: `${plural(block.visits, "visit")} on ${pluralDay(block.weekday)}`,
              audience: audienceFor("day", block.weekday),
            }))}
            onMessage={message}
            empty="Not enough visits yet to spot a pattern."
          />
        </section>
        <section className="builder-panel">
          <h2>What guests order</h2>
          <BlockList
            items={data.topItems.map((entry) => ({
              key: `item-${entry.label}`,
              name: `${entry.label} · ${plural(entry.qty, "ordered")}`,
              audience: audienceFor("items", 0),
            }))}
            onMessage={message}
            empty={
              restaurant.trackOrders
                ? "No orders saved yet."
                : "Turn on tracking orders in settings to see this."
            }
          />
        </section>
        <section className="builder-panel">
          <h2>Regulars who are slipping</h2>
          <BlockList
            count={data.slippingRegulars.length}
            items={data.slippingRegulars.map((row) => ({
              key: row.membershipId,
              name: `${row.name} · ${row.detail}`,
              audience: audienceFor("slipping", 0),
            }))}
            onMessage={message}
            empty="Nobody has gone quiet right now."
          />
        </section>
        <section className="builder-panel">
          <h2>Birthdays coming up</h2>
          <BlockList
            count={data.birthdaysUpcoming.length}
            items={data.birthdaysUpcoming.map((row) => ({
              key: row.membershipId,
              name:
                row.inDays === 0
                  ? `${row.name} · today, ${row.when}`
                  : `${row.name} · ${row.when}, in ${row.inDays} ${row.inDays === 1 ? "day" : "days"}`,
              audience: audienceFor("birthdays", 0),
            }))}
            onMessage={message}
            empty="No birthdays in the next few weeks."
          />
        </section>
        <section className="builder-panel">
          <h2>New guests this week</h2>
          <BlockList
            count={data.newGuests.length}
            items={data.newGuests.map((row) => ({
              key: row.membershipId,
              name: `${row.name} · ${row.detail}`,
              audience: audienceFor("new", 0),
            }))}
            onMessage={message}
            empty="No new guests joined this week."
          />
        </section>
      </div>
      <p>
        <a href="/app">Back to the dashboard</a>
      </p>
    </main>
  );
}

function plural(n: number, word: string) {
  if (word === "visit") return `${n} ${n === 1 ? "visit" : "visits"}`;
  return `${n} ${word}`;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function pluralDay(weekday: number) {
  return DAY_NAMES[weekday] ?? "that day";
}

function BlockList({
  items,
  empty,
  onMessage,
  count,
}: {
  items: Array<{ key: string; name: string; audience: CampaignAudience | null }>;
  empty: string;
  onMessage: (audience: CampaignAudience | null) => void;
  count?: number;
}) {
  if (items.length === 0) {
    return <EmptyState title={empty} />;
  }
  return (
    <ul className="insights-list">
      {items.map((item) => (
        <li key={item.key}>
          <span>{item.name}</span>
          <button className="builder-secondary" onClick={() => onMessage(item.audience)}>
            Message them
          </button>
        </li>
      ))}
      {typeof count === "number" && count > items.length && (
        <li className="insights-more">and {count - items.length} more</li>
      )}
    </ul>
  );
}
