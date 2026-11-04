import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { getDataModeFn } from "@/server/live";
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  EmptyState,
  Field,
  FilterPills,
  Input,
  KitBackLink,
  LoadingState,
  PageHeader,
  Pill,
  Select,
  StampCircles,
  StatCard,
  StatGrid,
  Tabs,
  Toast,
  VenueMark,
} from "@/components/patron/kit";

export const Route = createFileRoute("/dev/kit")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [{ title: "Design kit | Patron" }, { name: "robots", content: "noindex" }],
  }),
  component: DevKit,
});

type FilterValue = "all" | "regulars" | "new" | "quiet";
type TabValue = "card" | "rules" | "preview";

function DevKit() {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [tab, setTab] = useState<TabValue>("card");
  const [drawer, setDrawer] = useState(false);

  return (
    <main className="dev-kit page-width">
      <header>
        <KitBackLink to="/" label="Back to Patron" />
      </header>
      <PageHeader
        label="Design system"
        title="One kit, every surface."
        helper="The same cream paper, terracotta accent and quiet type from the homepage, shown once and shared everywhere."
      />

      <section className="dev-kit-section">
        <h2>Colour</h2>
        <div className="dev-swatches">
          {[
            ["Cream page", "var(--pk-cream)"],
            ["Card", "var(--pk-card)"],
            ["Border", "var(--pk-border)"],
            ["Terracotta", "var(--pk-accent)"],
            ["Dark text", "var(--pk-ink)"],
            ["Soft green", "var(--pk-green)"],
            ["Amber", "var(--pk-amber)"],
          ].map(([label, value]) => (
            <div className="dev-swatch" key={label}>
              <span style={{ background: value }} aria-hidden="true" />
              <strong>{label}</strong>
              <code>{value}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="dev-kit-section">
        <h2>Type</h2>
        <div className="dev-type">
          <p className="pk-label">Small label</p>
          <h1>Bricolage for the page title.</h1>
          <p className="pk-helper">
            DM Sans carries the body, helper lines and controls. <span className="pk-accent">Lora italic</span>{" "}
            is the one editorial accent.
          </p>
        </div>
      </section>

      <section className="dev-kit-section">
        <h2>Buttons</h2>
        <div className="dev-row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section className="dev-kit-section">
        <h2>Fields</h2>
        <div className="dev-form-grid">
          <Field label="First name" hint="The name the team will see.">
            <Input placeholder="Thandi" />
          </Field>
          <Field label="Restaurant">
            <Select defaultValue="daily">
              <option value="daily">The Daily Grind</option>
              <option value="sunrise">Sunrise Bakes</option>
              <option value="oak">The Oak Table</option>
            </Select>
          </Field>
        </div>
      </section>

      <section className="dev-kit-section">
        <h2>Filter pills</h2>
        <FilterPills
          label="Guest filters"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All guests", count: 60 },
            { value: "regulars", label: "Regulars", count: 24 },
            { value: "new", label: "New", count: 8 },
            { value: "quiet", label: "Quiet", count: 5 },
          ]}
        />
      </section>

      <section className="dev-kit-section">
        <h2>Tabs</h2>
        <Tabs
          label="Card sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: "card", label: "Card" },
            { value: "rules", label: "Rules" },
            { value: "preview", label: "Preview" },
          ]}
        />
        <p className="pk-helper">Showing {tab}.</p>
      </section>

      <section className="dev-kit-section">
        <h2>Badges and pills</h2>
        <div className="dev-row">
          <Badge>Draft</Badge>
          <Badge tone="success">Sent</Badge>
          <Badge tone="warning">Needs a look</Badge>
          <Badge tone="danger">Failed</Badge>
          <Badge tone="accent">Ready</Badge>
          <Pill>8 of 8 stamps</Pill>
        </div>
      </section>

      <section className="dev-kit-section">
        <h2>Stat cards</h2>
        <StatGrid>
          <StatCard value="120" label="Stamps this week" change="+18 on last week" changeTone="good" />
          <StatCard value="R42.00" label="SMS credit" change="Enough for 60 messages" />
          <StatCard value="2" label="Rewards ready" change="One more than usual" changeTone="good" />
        </StatGrid>
      </section>

      <section className="dev-kit-section">
        <h2>Page header</h2>
        <div className="dev-panel">
          <PageHeader
            label="Overview"
            title="Your week at a glance"
            helper="One question, one clear next step."
            actions={<Button>Open the till</Button>}
          />
        </div>
      </section>

      <section className="dev-kit-section">
        <h2>Empty, loading and toast</h2>
        <div className="dev-stack">
          <EmptyState
            title="No campaigns yet."
            hint="When you send your first message, its results will appear here."
            action={<Button variant="secondary">New campaign</Button>}
          />
          <LoadingState label="Loading this week" />
          <Toast>Demo data is saved on this device.</Toast>
          <Toast tone="success">Reward redeemed.</Toast>
          <Toast tone="warning">Two messages are waiting to send.</Toast>
          <Toast tone="danger">That phone number could not be read.</Toast>
        </div>
      </section>

      <section className="dev-kit-section">
        <h2>Drawer</h2>
        <Button variant="secondary" onClick={() => setDrawer(true)}>
          Open side drawer
        </Button>
        <Drawer open={drawer} onClose={() => setDrawer(false)} title="Switch restaurant">
          <div className="dev-stack">
            <Field label="Restaurant">
              <Select defaultValue="daily">
                <option value="daily">The Daily Grind</option>
                <option value="sunrise">Sunrise Bakes</option>
              </Select>
            </Field>
            <Button>Use this restaurant</Button>
          </div>
        </Drawer>
      </section>

      <section className="dev-kit-section">
        <h2>Avatar, venue and stamps</h2>
        <div className="dev-row">
          <Avatar name="Thandi M." />
          <Avatar name="Mia" large />
          <VenueMark name="The Daily Grind" />
          <VenueMark name="Sunrise Bakes" size="sm" />
        </div>
        <StampCircles total={8} filled={6} />
      </section>

      <section className="dev-kit-section">
        <h2>Back link</h2>
        <KitBackLink to="/app" label="Back to owner" />
      </section>
    </main>
  );
}
