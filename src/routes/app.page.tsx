import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import type { PageEdit, PageVersion } from "@/data/types";
import { useDemoState } from "@/data/useDemoState";
import { PAGE_DAYS, TAGLINE_LIMIT, ABOUT_LIMIT } from "@/domain/page";
import { ConfirmDialog, FormField, PageHeader } from "@/components/patron/dash";
import { PhoneFrame, PreviewOnly, PublishSteps } from "@/components/patron/preview";
import { PublicTemplate, type VenueSection } from "@/components/patron/PublicTemplates";
import { ThemeProvider } from "@/theme";

export const Route = createFileRoute("/app/page")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: PageWordsEditor,
});

type TimeInput = { open: string; close: string } | null;

function TimeEditor({
  span,
  day,
  onChange,
}: {
  span: TimeInput;
  day: string;
  onChange: (next: TimeInput) => void;
}) {
  const closed = span === null;
  return (
    <div className="menu-owner-row" key={day}>
      <div>
        <strong>{day}</strong>
        {closed && <small>Closed</small>}
      </div>
      <div className="menu-row-actions">
        <FormField label="Opens">
          <input
            type="time"
            value={span?.open ?? ""}
            aria-label={`${day} opening time`}
            disabled={closed}
            onChange={(event) =>
              onChange({ open: event.target.value, close: span?.close ?? "" })
            }
          />
        </FormField>
        <FormField label="Closes">
          <input
            type="time"
            value={span?.close ?? ""}
            aria-label={`${day} closing time`}
            disabled={closed}
            onChange={(event) =>
              onChange({ close: event.target.value, open: span?.open ?? "" })
            }
          />
        </FormField>
        <button onClick={() => onChange(closed ? { open: "07:00", close: "16:00" } : null)}>
          {closed ? "Set hours" : "Closed that day"}
        </button>
      </div>
    </div>
  );
}

function PageWordsEditor() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const [edit, setEdit] = useState<PageEdit>(() => api.page.editFor(restaurant));
  const [step, setStep] = useState(1);
  const [notice, setNotice] = useState("");
  const [published, setPublished] = useState(false);
  const [restoredAt, setRestoredAt] = useState("");
  const versions = api.page.versions(restaurant.id);

  const set = (patch: Partial<PageEdit>) => setEdit((current) => ({ ...current, ...patch }));

  const problems = api.page.validate(edit);
  const shown = problems[0] ?? "";

  /** Preview exactly what a guest would see with these words. */
  const previewRestaurant = api.page.apply(restaurant, edit);
  const previewSections: VenueSection[] = restaurant.menuSectionIds.map((sectionId) => ({
    id: sectionId,
    name: state.sections.find((item) => item.id === sectionId)?.name ?? "Menu",
    items: state.items
      .filter((item) => item.sectionId === sectionId && item.available)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));
  const special = api.special.publicFor(restaurant.id).find((item) => item.title && item.active) ?? null;

  const publish = () => {
    const result = api.page.publish(restaurant.id, edit);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice("");
    setPublished(true);
    setStep(1);
  };

  /** Restore loads the old words as a draft. The live page changes only on Publish. */
  const restore = (version: PageVersion) => {
    const result = api.page.restoreDraft(restaurant.id, version.id);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setEdit(result.data);
    setPublished(false);
    setRestoredAt(version.at);
    setStep(1);
    setNotice("");
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Public page · ${restaurant.name}`}
        title="Public page"
        intro="The words and opening hours on your public page. You see every change before it goes live, and the last versions are kept so you can undo by hand."
      />
      <PublishSteps step={step} labels={["Edit", "Preview", "Publish"]} />
      {restoredAt && step === 1 && (
        <p className="preview-banner" role="status">
          You are editing the version from {timeLabel(restoredAt)} as a draft. Guests still see
          the live page until you preview it and publish.
        </p>
      )}
      {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}

      {step === 1 && (
        <>
          <section className="builder-panel">
            <h2>Words</h2>
            <div className="builder-fields">
              <FormField label={`Tagline · up to ${TAGLINE_LIMIT} letters`}>
                <input
                  value={edit.tagline}
                  maxLength={TAGLINE_LIMIT}
                  onChange={(event) => set({ tagline: event.target.value })}
                />
              </FormField>
              <FormField label={`Your story · up to ${ABOUT_LIMIT} letters`}>
                <input
                  value={edit.about}
                  maxLength={ABOUT_LIMIT}
                  placeholder="Leave empty for our calm default wording"
                  onChange={(event) => set({ about: event.target.value })}
                />
              </FormField>
              <FormField label="Suburb">
                <input value={edit.suburb} onChange={(event) => set({ suburb: event.target.value })} />
              </FormField>
              <FormField label="Street address · optional">
                <input value={edit.address} onChange={(event) => set({ address: event.target.value })} />
              </FormField>
            </div>
            {edit.about.length >= ABOUT_LIMIT - 20 && (
              <p className="te-help">{ABOUT_LIMIT - edit.about.length} letters left on your story.</p>
            )}
          </section>

          <section className="builder-panel">
            <h2>Opening hours</h2>
            {PAGE_DAYS.map((day) => (
              <TimeEditor
                key={day}
                day={day}
                span={edit.hours[day] ?? null}
                onChange={(next) => set({ hours: { ...edit.hours, [day]: next } })}
              />
            ))}
            <p className="demo-data-note">
              Mark a day closed and the page shows Closed, and counts as closed even before your
              opening hour.
            </p>
          </section>

          <div className="page-actions">
            <button
              className="builder-primary"
              disabled={problems.length > 0}
              onClick={() => {
                setNotice(shown);
                setStep(2);
              }}
            >
              Preview my page
            </button>
            {problems.length > 0 && <p className="te-help">{generatedProblems(problems)}</p>}
            {published && (
              <p role="status" className="gx-note">
                Published. Guests see this now. Any further edit needs Preview again.
              </p>
            )}
          </div>

          {versions.length > 0 && (
            <section className="builder-panel">
              <h2>Earlier versions</h2>
              <p className="te-help">
                The last published versions, newest first. Restore loads one as a draft. Nothing
                on the live page changes until you preview it and publish.
              </p>
              <div className="menu-owner-list">
                {versions.map((version) => (
                  <article className="menu-owner-row" key={version.id}>
                    <div>
                      <strong>
                        {timeLabel(version.at)} · {version.by}
                      </strong>
                      <small>
                        {version.summary} · {summariseHours(version.edit)}
                      </small>
                    </div>
                    <div className="menu-row-actions">
                      <button onClick={() => restore(version)}>Restore</button>
                    </div>
                  </article>
                ))}
              </div>
              <p className="demo-data-note">
                Choose a version, change what you like, then preview and publish. That is the whole
                flow.
              </p>
            </section>
          )}
        </>
      )}

      {step === 2 && (
        <section className="builder-panel">
          <PreviewOnly>Preview only. Guests still see the previous page until you publish.</PreviewOnly>
          <h2>What your guests will see</h2>
          <PhoneFrame label="Public page preview">
            <ThemeProvider theme={previewRestaurant.theme}>
              <PublicTemplate
                template={restaurant.pageTemplate ?? "classic"}
                restaurant={previewRestaurant}
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
            <ConfirmDialog
              label="Publish my page"
              question="Publish this page? Guests see the new words and hours straight away."
              confirmLabel="Yes, publish"
              buttonClass="builder-primary"
              onConfirm={publish}
            />
            <button className="builder-secondary" onClick={() => setStep(1)}>
              Back to editing
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function generatedProblems(problems: string[]): string {
  return problems.join(" ");
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));
}

function summariseHours(edit: PageEdit): string {
  const open = PAGE_DAYS.filter((day) => edit.hours[day] !== undefined && edit.hours[day] !== null);
  return `${open.length} of ${PAGE_DAYS.length} days open`;
}
