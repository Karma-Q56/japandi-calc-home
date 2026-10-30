import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import type { MenuItem, PageTemplate } from "@/data/types";
import { useDemoState } from "@/data/useDemoState";
import { EmptyState, FormField, PageHeader } from "@/components/patron/dash";
import { PhoneFrame, PreviewOnly, PublishSteps } from "@/components/patron/preview";
import { PublicTemplate, type VenueSection } from "@/components/patron/PublicTemplates";
import { ThemeProvider } from "@/theme";

export const Route = createFileRoute("/app/menu")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  component: MenuEditor,
});

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
