import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { api } from "@/api";
import { can } from "@/clients/registry";
import { ThemeEditor } from "@/components/patron/ThemeEditor";
import { EmptyState, PageHeader } from "@/components/patron/dash";
import type { PageTemplate, Restaurant } from "@/data/types";
import { useDemoState } from "@/data/useDemoState";

export const Route = createFileRoute("/ops/restaurants/$id/look")({
  beforeLoad: () => {
    if (!requireRole("operator")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  component: LookEditor,
});

function LookEditor() {
  const { id } = Route.useParams();
  const state = useDemoState();
  const restaurant = state.restaurants.find((item) => item.id === id);
  const [theme, setTheme] = useState<Restaurant["theme"] | null>(null);
  const [blocks, setBlocks] = useState<Restaurant["pageConfig"] | null>(null);
  const [template, setTemplate] = useState<PageTemplate | null>(null);
  const [notice, setNotice] = useState("");

  if (!restaurant) {
    return (
      <main className="demo-hub page-width">
        <EmptyState
          title="Restaurant not found"
          hint="It may have been removed, or the link is out of date."
          action={
            <a className="builder-secondary" href="/ops/restaurants">
              Back to restaurants
            </a>
          }
        />
      </main>
    );
  }

  const currentTheme = theme ?? restaurant.theme;
  const currentBlocks = blocks ?? restaurant.pageConfig;
  const currentTemplate = template ?? restaurant.pageTemplate;

  const move = (index: number, delta: number) => {
    const next = [...currentBlocks];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setBlocks(next);
  };

  const save = () => {
    const result = api.restaurant.update(restaurant.id, {
      theme: currentTheme,
      pageConfig: currentBlocks,
      pageTemplate: currentTemplate,
    });
    setNotice(result.ok ? "Look and page settings saved." : result.error.message);
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Theme editor · ${restaurant.name}`}
        title="Make it yours"
        intro="Colours, fonts, logo and the public page template. Changes stay on this screen until you save."
      />
      <ThemeEditor
        theme={currentTheme}
        onChange={setTheme}
        name={restaurant.name}
        template={currentTemplate}
        onTemplateChange={setTemplate}
      />
      <section className="builder-panel">
        <h2>Public page sections</h2>
        {can(restaurant.plan, "blockEditor") ? (
          <div className="block-list">
            {currentBlocks.map((block, index) => (
              <div className="block-row" key={block.type}>
                <label>
                  <input
                    type="checkbox"
                    checked={block.enabled}
                    onChange={(event) =>
                      setBlocks((current) =>
                        (current ?? currentBlocks).map((item, i) =>
                          i === index ? { ...item, enabled: event.target.checked } : item,
                        ),
                      )
                    }
                  />
                  {block.type}
                </label>
                <div>
                  <button aria-label={`Move ${block.type} up`} onClick={() => move(index, -1)}>
                    ↑
                  </button>
                  <button aria-label={`Move ${block.type} down`} onClick={() => move(index, 1)}>
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>
            Block editor is available on managed and above plans. Upgrade this demo restaurant to
            enable it.
          </p>
        )}
        <div className="page-actions">
          <button className="builder-primary" onClick={save}>
            Save look
          </button>
          <a
            className="builder-secondary"
            href={`/r/${restaurant.slug}`}
            target="_blank"
            rel="noreferrer"
          >
            Preview public page
          </a>
        </div>
        {notice && <p role="status">{notice}</p>}
      </section>
    </main>
  );
}
