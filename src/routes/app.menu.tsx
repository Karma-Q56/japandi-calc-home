import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { clock } from "@/lib/clock";
import type { MenuItem } from "@/data/types";
import { useDemoState } from "@/data/useDemoState";

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
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Owner workspace · Demo data
      </p>
      <h1>Menu & specials.</h1>
      <section className="builder-panel">
        <h2>Menu sections</h2>
        <div className="menu-add-section">
          <label className="builder-field">
            Section name
            <input value={newSection} onChange={(event) => setNewSection(event.target.value)} />
          </label>
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
        <label className="builder-field">
          Editing section
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
        </label>
        <div className="menu-owner-list">
          {state.items
            .filter((value) => value.sectionId === sectionId)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((value) => (
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
        <h3>{item.id ? "Edit item" : "Add menu item"}</h3>
        <div className="builder-fields">
          <label className="builder-field">
            Name
            <input
              value={item.name ?? ""}
              onChange={(event) => setItem((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="builder-field">
            Description
            <input
              value={item.description ?? ""}
              onChange={(event) =>
                setItem((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <label className="builder-field">
            Price in rand
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
          </label>
          <button className="builder-primary" onClick={save}>
            Save menu item
          </button>
        </div>
      </section>
      <section className="builder-panel">
        <h2>Specials</h2>
        {state.specials
          .filter((value) => value.restaurantId === restaurant.id)
          .map((special) => (
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
          ))}
        <h3>Add a special</h3>
        <div className="builder-fields">
          <label className="builder-field">
            Title
            <input value={specialTitle} onChange={(event) => setSpecialTitle(event.target.value)} />
          </label>
          <label className="builder-field">
            Details
            <textarea
              value={specialBody}
              onChange={(event) => setSpecialBody(event.target.value)}
            />
          </label>
          <label className="builder-field">
            Starts
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </label>
          <label className="builder-field">
            Ends
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </label>
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
