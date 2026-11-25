import { useState } from "react";
import { FormField, Helper, PageHeader } from "@/components/patron/dash";
import { TimeEditor } from "@/components/patron/TimeEditor";
import { useLogoPreview } from "@/components/patron/live/use-logo-preview";
import { PageIdentity } from "@/components/patron/live/PageIdentity";
import { VenueDetailsFields } from "@/components/patron/VenueDetailsFields";
import { validateAddress } from "@/lib/venue-fields";
import { saveOwnerPageFn } from "@/server/live-page-fns";
import type { OwnerPage } from "@/server/live-page";
import {
  ABOUT_LIMIT,
  ADDRESS_LIMIT,
  PAGE_DAYS,
  TAGLINE_LIMIT,
  validatePage,
  type Hours,
} from "@/lib/live-page";

/** The real "Your page" screen: words, address and opening hours, saved to the database. */
export function LivePage({ page }: { page: OwnerPage | null }) {
  if (!page) {
    return (
      <main className="demo-hub page-width">
        <PageHeader
          eyebrow="Your page"
          title="This login is not linked to a restaurant."
          intro="Ask Patron to link your owner account to a restaurant, then sign in again."
        />
      </main>
    );
  }
  return <LivePageEditor page={page} />;
}

function LivePageEditor({ page }: { page: OwnerPage }) {
  const [tagline, setTagline] = useState(page.tagline);
  const [about, setAbout] = useState(page.about);
  const [suburb, setSuburb] = useState(page.suburb);
  const [venueType, setVenueType] = useState(page.venueType);
  const [addressMessage, setAddressMessage] = useState<string | null>(null);
  const [address, setAddress] = useState(page.address);
  const [hours, setHours] = useState<Hours>(page.hours);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const input = { tagline, about, suburb, venueType, address, hours };
  const problem = validatePage(input);
  const [logoUrl] = useLogoPreview(page.logoVersion !== null);

  const save = async () => {
    const addressProblem = validateAddress(address, ADDRESS_LIMIT);
    setAddressMessage(addressProblem);
    if (problem) {
      setNotice(problem);
      return;
    }
    setBusy(true);
    try {
      const result = await saveOwnerPageFn({ data: input });
      setNotice(
        result.ok
          ? page.status === "active"
            ? "Saved. Guests see these words and hours now."
            : "Saved. Guests will see these words and hours once your page is published."
          : result.message,
      );
    } catch {
      setNotice("Could not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Your page · ${page.name}`}
        title="Your page"
        intro="The words, address and opening hours guests read when they find you. Colours, stamps and your logo are on the Loyalty page, under Stamp card."
      />
      <div className="live-page-grid">
        <div>
          <section className="builder-panel" aria-label="Words">
            <h2>Words</h2>
            <div className="live-page-fields">
              <FormField label={`Line under your name · up to ${TAGLINE_LIMIT} characters`}>
                <input
                  value={tagline}
                  maxLength={TAGLINE_LIMIT}
                  onChange={(event) => setTagline(event.target.value)}
                />
              </FormField>
              <FormField
                label={`Your story · up to ${ABOUT_LIMIT} characters`}
                hint="Leave it empty if you would rather not add one."
              >
                <textarea
                  rows={3}
                  value={about}
                  maxLength={ABOUT_LIMIT}
                  onChange={(event) => setAbout(event.target.value)}
                />
              </FormField>
              <VenueDetailsFields
                suburb={suburb}
                venueType={venueType}
                onChange={(next) => {
                  setSuburb(next.suburb);
                  setVenueType(next.venueType);
                }}
              />
              <FormField label="Street address" hint="Optional.">
                <input
                  value={address}
                  maxLength={ADDRESS_LIMIT}
                  onChange={(event) => setAddress(event.target.value)}
                  onBlur={() => setAddressMessage(validateAddress(address, ADDRESS_LIMIT))}
                />
              </FormField>
              {addressMessage ? (
                <p className="field-error" role="alert">
                  {addressMessage}
                </p>
              ) : null}
            </div>
            {about.length >= ABOUT_LIMIT - 20 && (
              <Helper>{ABOUT_LIMIT - about.length} characters left on your story.</Helper>
            )}
          </section>

          <section className="builder-panel" aria-label="Opening hours">
            <h2>Opening hours</h2>
            {PAGE_DAYS.map((day) => (
              <TimeEditor
                key={day}
                day={day}
                span={hours[day] ?? null}
                onChange={(next) => setHours((current) => ({ ...current, [day]: next }))}
              />
            ))}
            <Helper>A day marked closed shows as Closed on your page.</Helper>
          </section>

          <div className="page-actions">
            <button className="builder-primary" type="button" disabled={busy} onClick={save}>
              Save page
            </button>
            {problem && <p className="te-help">{problem}</p>}
            {notice && (
              <p className="builder-hint" role="status">
                {notice}
              </p>
            )}
          </div>
        </div>

        <aside className="builder-panel live-page-preview" aria-label="What guests see">
          <h2>What guests see</h2>
          <div className="live-page-preview-frame">
            <PageIdentity
              name={page.name}
              suburb={suburb.trim() || null}
              tagline={tagline.trim()}
              about={about.trim()}
              address={address.trim()}
              hours={hours}
              logoUrl={logoUrl}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
