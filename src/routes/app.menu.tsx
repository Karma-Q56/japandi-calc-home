import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { clock } from "@/lib/clock";
import type { MenuItem } from "@/data/types";
import { useDemoState } from "@/data/useDemoState";
import { EmptyState, FormField, PageHeader } from "@/components/patron/dash";

export const Route = createFileRoute("/app/menu")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  component: MenuEditor,
});
const asDateField = (value: number) => new Date(value).toISOString().slice(0, 16);
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
  const [specialTitle, setSpecialTitle] = useState("");
  const [specialBody, setSpecialBody] = useState("");
  const [startsAt, setStartsAt] = useState(asDateField(clock.now()));
  const [endsAt, setEndsAt] = useState(asDateField(clock.now() + 14 * 86400000));
  const [notice, setNotice] = useState("");
  const sections = state.sections
    .filter((value) => value.restaurantId === restaurant.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const sectionItems = state.items
    .filter((value) => value.sectionId === sectionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const restaurantSpecials = state.specials.filter(
    (value) => value.restaurantId === restaurant.id,
  );
  const save = () => {
    const result = api.menu.saveItem({
      ...item,
      restaurantId: restaurant.id,
      sectionId: item.sectionId || sectionId,
      priceCents: Number(item.priceCents),
    } as Partial<MenuItem> & Pick<MenuItem, "restaurantId" | "sectionId" | "name" | "priceCents">);
    setNotice(result.ok ? "Menu item saved." : result.error.message);
    if (result.ok)
      setItem({
        restaurantId: restaurant.id,
        sectionId: item.sectionId || sectionId,
        name: "",
        description: "",
        priceCents: 0,
        available: true,
      });
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
  const createSpecial = () => {
    const result = api.menu.saveSpecial({
      restaurantId: restaurant.id,
      title: specialTitle,
      body: specialBody,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      active: true,
    });
    setNotice(result.ok ? "Special saved." : result.error.message);
  };
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`${restaurant.name} · Menu`}
        title="Menu and specials"
        intro="Write the menu, keep prices current and hide anything you have run out of."
      />
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
            hint="Add the first item below and it appears on your menu right away."
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
                  <button aria-label={`Move ${value.name} down`} onClick={() => move(value.id, 1)}>
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
        <h3>{item.id ? "Edit item" : "Add menu item"}</h3>
        <div className="builder-fields">
          <FormField label="Name">
            <input
              value={item.name ?? ""}
              onChange={(event) => setItem((current) => ({ ...current, name: event.target.value }))}
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
          <button className="builder-primary" onClick={save}>
            Save menu item
          </button>
        </div>
      </section>
      <section className="builder-panel">
        <h2>Specials</h2>
        {restaurantSpecials.length === 0 ? (
          <EmptyState
            title="No specials yet."
            hint="A special shows as a banner on your public page while it is on."
          />
        ) : (
          restaurantSpecials.map((special) => (
            <article className="special-owner-row" key={special.id}>
              <div>
                <strong>{special.title}</strong>
                <p>{special.body}</p>
              </div>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={special.active}
                  onChange={(event) =>
                    api.menu.saveSpecial({ ...special, active: event.target.checked })
                  }
                />
                Show banner
              </label>
            </article>
          ))
        )}
        <h3>Add a special</h3>
        <div className="builder-fields">
          <FormField label="Title">
            <input value={specialTitle} onChange={(event) => setSpecialTitle(event.target.value)} />
          </FormField>
          <FormField label="Details">
            <textarea
              value={specialBody}
              onChange={(event) => setSpecialBody(event.target.value)}
            />
          </FormField>
          <FormField label="Starts">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </FormField>
          <FormField label="Ends">
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </FormField>
          <button className="builder-primary" onClick={createSpecial}>
            Save special
          </button>
        </div>
      </section>
      {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}
    </main>
  );
}
