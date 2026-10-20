import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { withChildren } from "@/lib/nested";
import type { CustomerFilter, CustomerSort } from "@/domain/customers";

const FILTERS: CustomerFilter[] = [
  "all",
  "new14",
  "regulars",
  "lapsed30",
  "lapsed45",
  "lapsed60",
  "sms",
];

const SORTS: CustomerSort[] = ["recent", "stamps", "name"];

const CustomersWithChildren = withChildren(Customers);

export const Route = createFileRoute("/app/customers")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/demo" });
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
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Customers · {restaurant.name}
      </p>
      <h1>Your regulars.</h1>
      <div className="builder-fields">
        <label className="builder-field">
          Search name or phone
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="builder-field">
          Filter
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as CustomerFilter);
              setPage(1);
            }}
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="builder-field">
          Sort
          <select value={sort} onChange={(event) => setSort(event.target.value as CustomerSort)}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="demo-data-note">
        {data.total} guest{data.total === 1 ? "" : "s"} · page {data.page} of {pages}
      </p>
      <div className="customer-table">
        {data.rows.map((row) => (
          <a
            className="customer-row"
            key={row.membershipId}
            href={`/app/customers/${row.customerId}`}
          >
            <span>
              <strong>{row.name}</strong>
              <small>{row.maskedPhone}</small>
            </span>
            <span className="customer-row-meta">
              <span>{row.stampsCurrent} stamps</span>
              {row.rewardsWaiting > 0 && (
                <span className="reward-pill">
                  {row.rewardsWaiting} reward{row.rewardsWaiting === 1 ? "" : "s"} ready
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
            </small>
            <b aria-hidden="true">›</b>
          </a>
        ))}
      </div>
      {data.total === 0 && <p className="demo-data-note">No guests match these filters.</p>}
      <div className="demo-control-actions">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)}>
          Next
        </button>
        <button onClick={download}>Export CSV</button>
      </div>
      {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}
    </main>
  );
}
