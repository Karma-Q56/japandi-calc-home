import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import type { MenuItem, MenuVersion, PageTemplate } from "@/data/types";
import { useDemoState } from "@/data/useDemoState";
import { EmptyState, FormField, PageHeader } from "@/components/patron/dash";
import { PhoneFrame, PreviewOnly, PublishSteps } from "@/components/patron/preview";
import { PublicTemplate, type VenueSection } from "@/components/patron/PublicTemplates";
import { ThemeProvider } from "@/theme";
import {
  createMenuItemFn,
  createMenuSectionFn,
  getDataModeFn,
  getMenuFn,
  setMenuItemAvailableFn,
} from "@/server/live";
import type { LiveMenu } from "@/server/live-menu";
import { formatRand } from "@/lib/money";

export const Route = createFileRoute("/app/menu")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await getMenuFn() };
  },
  component: MenuEditor,
});

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));
}

const TEMPLATES: ReadonlyArray<{ id: PageTemplate; label: string }> = [
  { id: "classic", label: "Classic" },
  { id: "hero", label: "Hero" },
  { id: "menu-first", label: "Menu first" },
  { id: "minimal", label: "Minimal" },
];

type PendingItem = Partial<MenuItem> & {
  restaurantId: string;
  sectionId: string;
  name: string;
  priceCents: number;
};

function MenuEditor() {
  const data = Route.useLoaderData();
  if (data.mode === "live") return <LiveMenuEditor data={data.live} />;
  return <DemoMenuEditor />;
}

function DemoMenuEditor() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const [firstSection] = restaurant.menuSectionIds;
  const [sectionId, setSectionId] = useState(firstSection ?? "");
  const [item, setItem] = useState<Partial<MenuItem>>({
    restaurantId: restaurant.id,
    sectionId: firstSection ?? "",
    name: "",
    description: "",
    priceCents: 0,
    available: true,
  });
  const [newSection, setNewSection] = useState("");
  const [notice, setNotice] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pending, setPending] = useState<PendingItem | null>(null);
  const [publishedName, setPublishedName] = useState("");
  const [template, setTemplate] = useState<PageTemplate>(restaurant.pageTemplate ?? "classic");
  const [templateNotice, setTemplateNotice] = useState("");
  const [restoring, setRestoring] = useState<MenuVersion | null>(null);

  const versions = api.menu.versions(restaurant.id);
  const sections = state.sections
    .filter((value) => value.restaurantId === restaurant.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const itemsIn = (id: string) =>
    state.items
      .filter((value) => value.sectionId === id && value.available)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  const sectionItems = state.items
    .filter((value) => value.sectionId === sectionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  /** Keep the typed item as a draft until the owner has seen it as a guest. */
  const previewItem = () => {
    const name = (item.name ?? "").trim();
    const priceCents = Math.round(Number(item.priceCents));
    if (!name) {
      setNotice("Give the item a name before previewing it.");
      return;
    }
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setNotice("Enter a price of zero or more.");
      return;
    }
    if (!sectionId) {
      setNotice("Add a menu section before previewing an item.");
      return;
    }
    setNotice("");
    setTemplateNotice("");
    setPublishedName("");
    setPending({
      ...item,
      restaurantId: restaurant.id,
      sectionId: item.sectionId || sectionId,
      name,
      priceCents,
    });
    setStep(2);
  };

  /** The only place a menu item reaches the live menu. */
  const publishItem = () => {
    if (!pending) return;
    const result = api.menu.saveItem(pending);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    api.menu.snapshot(restaurant.id, `${pending.name} published`);
    const nextSection = pending.sectionId;
    setPublishedName(pending.name);
    setPending(null);
    setItem({
      restaurantId: restaurant.id,
      sectionId: nextSection,
      name: "",
      description: "",
      priceCents: 0,
      available: true,
    });
    setNotice("");
    setStep(3);
  };

  const backToDraft = () => {
    setPending(null);
    setStep(1);
  };

  /** The restored menu is only a draft until the owner publishes it. */
  const publishRestore = () => {
    if (!restoring) return;
    const result = api.menu.restore(restaurant.id, restoring.id);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setRestoring(null);
    setPublishedName("Restored menu");
    setNotice("");
    setStep(3);
  };

  const useTemplate = () => {
    const result = api.restaurant.update(restaurant.id, {
      theme: restaurant.theme,
      pageConfig: restaurant.pageConfig,
      pageTemplate: template,
    });
    setTemplateNotice(
      result.ok
        ? `Your public page now uses the ${TEMPLATES.find((entry) => entry.id === template)?.label} template.`
        : result.error.message,
    );
  };

  const move = (itemId: string, delta: number) => {
    const ids = state.items
      .filter((value) => value.sectionId === sectionId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((value) => value.id);
    const index = ids.indexOf(itemId);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    api.menu.reorder(sectionId, ids);
  };

  const previewSections: VenueSection[] = sections.map((section) => {
    const items = itemsIn(section.id).filter((value) => value.id !== pending?.id);
    if (pending && pending.sectionId === section.id) {
      items.push({
        id: pending.id ?? "preview-item",
        restaurantId: restaurant.id,
        sectionId: section.id,
        name: pending.name,
        description: pending.description ?? "",
        priceCents: pending.priceCents,
        available: true,
        sortOrder: pending.sortOrder ?? Number.MAX_SAFE_INTEGER,
      });
    }
    return { id: section.id, name: section.name, items };
  });
  const special =
    api.special.publicFor(restaurant.id).find((value) => value.title && value.active) ?? null;
  const templateLabel = TEMPLATES.find((entry) => entry.id === template)?.label ?? "Classic";

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`${restaurant.name} · Menu`}
        title="Menu"
        intro="Write the menu and keep prices current. A new or edited item is shown to you as a guest sees it before it goes live."
      />
      <PublishSteps step={step} labels={["Write", "Preview", "Publish"]} />
      {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}

      {step === 1 && (
        <>
          {restoring && (
            <section className="builder-panel">
              <PreviewOnly>
                Preview only. Your live menu stays as it is until you publish this restored
                menu.
              </PreviewOnly>
              <h2>Menu from {timeLabel(restoring.at)}</h2>
              <p className="builder-hint">{restoring.summary}</p>
              {restoring.sections.map((section) => {
                const items = restoring.items.filter(
                  (entry) => entry.sectionId === section.id,
                );
                return (
                  <div key={section.id}>
                    <strong>{section.name}</strong>
                    {items.length === 0 ? (
                      <p className="builder-hint">No items in this section.</p>
                    ) : (
                      <ul>
                        {items.map((entry) => (
                          <li key={entry.id}>
                            {entry.name} · R
                            {(entry.priceCents / 100).toFixed(
                              entry.priceCents % 100 ? 2 : 0,
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              <div className="page-actions">
                <button className="builder-primary" onClick={publishRestore}>
                  Publish this menu
                </button>
                <button
                  className="builder-secondary"
                  onClick={() => setRestoring(null)}
                >
                  Cancel
                </button>
              </div>
            </section>
          )}
          <section className="builder-panel">
            <h2>Menu sections</h2>
            <div className="menu-add-section">
              <FormField label="Section name">
                <input value={newSection} onChange={(event) => setNewSection(event.target.value)} />
              </FormField>
              <button
                className="builder-secondary"
                onClick={() => {
                  const result = api.menu.createSection(restaurant.id, newSection);
                  setNotice(result.ok ? "Section added." : result.error.message);
                  if (result.ok) {
                    setNewSection("");
                    setSectionId(result.data.id);
                  }
                }}
              >
                Add section
              </button>
            </div>
            <FormField label="Editing section">
              <select
                value={sectionId}
                onChange={(event) => {
                  setSectionId(event.target.value);
                  setItem((current) => ({ ...current, sectionId: event.target.value }));
                }}
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </FormField>
            {sectionItems.length === 0 ? (
              <EmptyState
                title="No items in this section yet."
                hint="Write the first item below, preview it as a guest, then publish it."
              />
            ) : (
              <div className="menu-owner-list">
                {sectionItems.map((value) => (
                  <article
                    className={`menu-owner-row ${value.available ? "" : "is-hidden"}`}
                    key={value.id}
                  >
                    <div>
                      <strong>{value.name}</strong>
                      <small>
                        {value.description} · R
                        {(value.priceCents / 100).toFixed(value.priceCents % 100 ? 2 : 0)}
                      </small>
                    </div>
                    <div className="menu-row-actions">
                      <button aria-label={`Move ${value.name} up`} onClick={() => move(value.id, -1)}>
                        ↑
                      </button>
                      <button
                        aria-label={`Move ${value.name} down`}
                        onClick={() => move(value.id, 1)}
                      >
                        ↓
                      </button>
                      <button onClick={() => setItem(value)}>Edit</button>
                      <button onClick={() => api.menu.hideItem(value.id, value.available)}>
                        {value.available ? "Hide" : "Show"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <p className="demo-data-note">
              Showing, hiding and reordering take effect at once. Changing a name, description or
              price goes through Preview first.
            </p>
            <h3>{item.id ? "Edit item" : "Add menu item"}</h3>
            <div className="builder-fields">
              <FormField label="Name">
                <input
                  value={item.name ?? ""}
                  onChange={(event) =>
                    setItem((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </FormField>
              <FormField label="Description">
                <input
                  value={item.description ?? ""}
                  onChange={(event) =>
                    setItem((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </FormField>
              <FormField label="Price in rand">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={(item.priceCents ?? 0) / 100}
                  onChange={(event) =>
                    setItem((current) => ({
                      ...current,
                      priceCents: Math.round(Number(event.target.value) * 100),
                    }))
                  }
                />
              </FormField>
              <button className="builder-primary" onClick={previewItem}>
                Preview item
              </button>
            </div>
          </section>
          <section className="builder-panel">
            <h2>Previous versions</h2>
            <p className="builder-hint">
              The last published menus, newest first. Restore loads one as a draft. Your live
              menu does not change until you publish it.
            </p>
            {versions.length === 0 ? (
              <p className="builder-hint">No published menu yet. Publish an item to start.</p>
            ) : (
              <div className="menu-owner-list">
                {versions.map((version) => (
                  <article className="menu-owner-row" key={version.id}>
                    <div>
                      <strong>
                        {timeLabel(version.at)} · {version.by}
                      </strong>
                      <small>{version.summary}</small>
                    </div>
                    <div className="menu-row-actions">
                      <button onClick={() => setRestoring(version)}>Restore</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <p className="demo-data-note">
            Specials have their own page. <a href="/app/specials">Write and publish a special</a>.
          </p>
        </>
      )}

      {step === 2 && pending && (
        <section className="builder-panel">
          <PreviewOnly>Preview only. Guests still see the previous version until you publish.</PreviewOnly>
          <h2>What your guest will see</h2>
          <p>
            <strong>{pending.name}</strong>
            {pending.description ? ` · ${pending.description}` : ""} · R
            {(pending.priceCents / 100).toFixed(pending.priceCents % 100 ? 2 : 0)}
          </p>
          <div className="pv-template-switch" role="group" aria-label="Public page template">
            {TEMPLATES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="builder-secondary"
                aria-pressed={template === entry.id}
                onClick={() => {
                  setTemplate(entry.id);
                  setTemplateNotice("");
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <PhoneFrame label={`Public page preview, ${templateLabel} template`}>
            <ThemeProvider theme={restaurant.theme}>
              <PublicTemplate
                template={template}
                restaurant={restaurant}
                sections={previewSections}
                special={special}
                open={false}
                now={state.now}
                joinHref={`/r/${restaurant.slug}/join`}
                memberOffers={[]}
              />
            </ThemeProvider>
          </PhoneFrame>
          <div className="page-actions">
            <button className="builder-primary" onClick={publishItem}>
              Publish to my menu
            </button>
            <button className="builder-secondary" onClick={backToDraft}>
              Back to editing
            </button>
          </div>
          <div className="page-actions">
            <button className="guest-back" onClick={useTemplate}>
              Use the {templateLabel} template on my public page
            </button>
          </div>
          {templateNotice && (
            <p role="status" className="demo-data-note">
              {templateNotice}
            </p>
          )}
          <p className="demo-data-note">
            Publishing the item changes your menu. Publishing a template changes the whole public
            page for every guest.
          </p>
        </section>
      )}

      {step === 3 && (
        <section className="builder-panel">
          <h2>{publishedName} is live.</h2>
          <p>Guests can see it on your menu and public page now.</p>
          <div className="page-actions">
            <button className="builder-primary" onClick={backToDraft}>
              Add or edit another item
            </button>
            <a
              className="builder-secondary"
              href={`/r/${restaurant.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              See my public page
            </a>
          </div>
        </section>
      )}
    </main>
  );
}

function LiveMenuEditor({ data }: { data: LiveMenu | null }) {
  const router = useRouter();
  const [sectionName, setSectionName] = useState("");
  const [activeSection, setActiveSection] = useState(data?.sections[0]?.id ?? "");
  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (!data) {
    return (
      <main className="demo-hub page-width">
        <PageHeader
          eyebrow="Live mode"
          title="This login is not linked to a restaurant."
          intro="Ask Patron to link your owner account to a restaurant, then sign in again."
        />
      </main>
    );
  }

  const sectionId = activeSection || data.sections[0]?.id || "";
  const addSection = async () => {
    setBusy(true);
    const result = await createMenuSectionFn({ data: { name: sectionName } });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setSectionName("");
    setActiveSection(result.id);
    setNotice("Section added.");
    await router.invalidate();
  };
  const addItem = async () => {
    if (!sectionId) {
      setNotice("Add a section before adding an item.");
      return;
    }
    setBusy(true);
    const result = await createMenuItemFn({
      data: {
        sectionId,
        name: itemName,
        description,
        priceCents: Math.round(Number(price) * 100),
      },
    });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setItemName("");
    setDescription("");
    setPrice("");
    setNotice("Item added to the live menu.");
    await router.invalidate();
  };
  const toggle = async (itemId: string, available: boolean) => {
    setBusy(true);
    const result = await setMenuItemAvailableFn({ data: { itemId, available } });
    setBusy(false);
    setNotice(result.ok ? (available ? "Item is visible." : "Item hidden.") : result.message);
    if (result.ok) await router.invalidate();
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Menu · ${data.restaurantName}`}
        title="Build your menu."
        intro="These items are live on your public page. New sections and items save directly and write an activity log entry."
      />
      <section className="builder-panel">
        <h2>Sections</h2>
        <div className="builder-fields">
          <FormField label="New section" hint="For example Coffee, Breakfast or Cold drinks.">
            <input
              maxLength={80}
              value={sectionName}
              onChange={(event) => setSectionName(event.target.value)}
            />
          </FormField>
          <button
            className="builder-primary"
            type="button"
            disabled={busy || !sectionName.trim()}
            onClick={addSection}
          >
            Add section
          </button>
        </div>
        {data.sections.length === 0 ? (
          <EmptyState
            title="No sections yet."
            hint="Add a section first, then add items to it."
          />
        ) : (
          <div className="builder-fields">
            <FormField label="Working section">
              <select value={sectionId} onChange={(event) => setActiveSection(event.target.value)}>
                {data.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        )}
      </section>
      <section className="builder-panel">
        <h2>Add an item</h2>
        <div className="builder-fields">
          <FormField label="Item name">
            <input
              maxLength={120}
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
            />
          </FormField>
          <FormField label="Description" hint="Optional. Keep it short.">
            <input
              maxLength={300}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormField>
          <FormField label="Price in rand">
            <input
              type="number"
              min={0}
              step={0.01}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </FormField>
          <button
            className="builder-primary"
            type="button"
            disabled={busy || !sectionId || !itemName.trim()}
            onClick={addItem}
          >
            Add item
          </button>
        </div>
        {notice && (
          <p className="builder-hint" role="status">
            {notice}
          </p>
        )}
      </section>
      <section className="builder-panel">
        <h2>Live menu</h2>
        {data.sections.length === 0 ? (
          <p className="demo-data-note">Your menu is empty.</p>
        ) : (
          data.sections.map((section) => (
            <div className="venue-menu-section" key={section.id}>
              <h3>{section.name}</h3>
              {section.items.length === 0 ? (
                <p className="demo-data-note">No items in this section yet.</p>
              ) : (
                section.items.map((item) => (
                  <div className="venue-menu-item" key={item.id}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.description || "No description"} · {formatRand(item.priceCents)}
                      </small>
                    </span>
                    <button
                      className="builder-secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void toggle(item.id, !item.available);
                      }}
                    >
                      {item.available ? "Hide" : "Show"}
                    </button>
                  </div>
                ))
              )}
            </div>
          ))
        )}
        <p className="demo-data-note">
          Draft, preview and publish for the menu come next. This live builder saves each change
          directly.
        </p>
      </section>
    </main>
  );
}
