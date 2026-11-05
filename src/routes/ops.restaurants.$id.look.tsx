import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { api } from "@/api";
import { can } from "@/clients/registry";
import { ThemeEditor } from "@/components/patron/ThemeEditor";
import { Badge, EmptyState, FormField, Helper, PageHeader } from "@/components/patron/dash";
import {
  helpDate,
  HELP_DRAFT_LABEL,
  HELP_REPLY_LIMIT,
  HELP_SUMMARY_LIMIT,
} from "@/domain/help";
import { ABOUT_LIMIT, TAGLINE_LIMIT } from "@/domain/page";
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
  const [operatorName, setOperatorName] = useState("");
  const [draftTagline, setDraftTagline] = useState(restaurant?.theme.tagline ?? "");
  const [draftAbout, setDraftAbout] = useState(restaurant?.aboutText ?? "");
  const [draftSummary, setDraftSummary] = useState("");
  const [helpNotice, setHelpNotice] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});

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
  const help = api.help.state(restaurant.id);
  const mode = api.help.mode();
  const helpingHere = mode.active && mode.restaurantId === restaurant.id;
  const guestsResult = helpingHere
    ? api.help.guests({ restaurantId: restaurant.id, session: state.session })
    : null;
  const guests = guestsResult?.ok ? guestsResult.data : [];
  const requestsResult = helpingHere
    ? api.help.requests({ restaurantId: restaurant.id, session: state.session })
    : null;
  const requests = requestsResult?.ok ? requestsResult.data : [];

  const openHelp = () => {
    const result = api.help.start({
      restaurantId: restaurant.id,
      operator: operatorName,
      session: state.session,
    });
    setHelpNotice(result.ok ? "Help mode is open. Everything you change stays a draft." : result.error.message);
  };

  const closeHelp = () => {
    const result = api.help.stop({ session: state.session });
    setHelpNotice(result.ok ? "Help mode closed. The owner can see what you did." : result.error.message);
  };

  const saveDraft = () => {
    const result = api.help.prepare({
      restaurantId: restaurant.id,
      tagline: draftTagline,
      about: draftAbout,
      summary: draftSummary,
      session: state.session,
    });
    if (!result.ok) {
      setHelpNotice(result.error.message);
      return;
    }
    setDraftSummary("");
    setHelpNotice(`Draft saved for the owner, labelled "${HELP_DRAFT_LABEL}".`);
  };

  const answer = (requestId: string) => {
    const result = api.help.answer({
      requestId,
      reply: replies[requestId] ?? "",
      tagline: draftTagline,
      about: draftAbout,
      session: state.session,
    });
    setHelpNotice(
      result.ok
        ? "Answered with a draft. The owner decides whether it goes live."
        : result.error.message,
    );
  };

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
      {helpingHere && (
        <div className="help-banner" role="status">
          <strong>You are helping {restaurant.name}.</strong>
          <p>
            Everything you change is saved as a draft labelled "{HELP_DRAFT_LABEL}". You cannot
            publish, send messages or spend credit. Guest phone numbers stay masked. Help ends on{" "}
            {helpDate(mode.until ?? "")}.
          </p>
          <button onClick={closeHelp}>Stop helping</button>
        </div>
      )}
      {help.active && !helpingHere && (
        <section className="builder-panel">
          <h2>Help from Patron</h2>
          <p>
            The owner turned help on until {help.expiresAt ? helpDate(help.expiresAt) : "soon"}. Open
            help mode to work on this restaurant. Nothing you do here goes live without the owner.
          </p>
          <FormField label="Your name" hint="The owner sees this on every action in the activity log.">
            <input
              value={operatorName}
              maxLength={60}
              onChange={(event) => setOperatorName(event.target.value)}
              placeholder="For example: Thandi from Patron"
            />
          </FormField>
          <div className="page-actions">
            <button className="builder-primary" onClick={openHelp}>
              Open help mode
            </button>
          </div>
        </section>
      )}
      {!help.active && (
        <section className="builder-panel">
          <h2>Help from Patron</h2>
          <p>
            {help.expiresAt
              ? `Help ended on ${helpDate(help.expiresAt)}.`
              : "This restaurant has not turned on help from Patron."}{" "}
            The owner can switch it on in Settings.
          </p>
        </section>
      )}
      {helpingHere && (
        <section className="builder-panel">
          <h2>Page draft</h2>
          <p className="demo-data-note">
            Write the words you suggest. They wait for the owner and never change the live page on
            their own.
          </p>
          <FormField label="Tagline" hint={`2 to ${TAGLINE_LIMIT} characters.`}>
            <input
              value={draftTagline}
              maxLength={TAGLINE_LIMIT}
              onChange={(event) => setDraftTagline(event.target.value)}
            />
          </FormField>
          <FormField label="Story" hint={`Up to ${ABOUT_LIMIT} characters.`}>
            <textarea
              rows={5}
              value={draftAbout}
              maxLength={ABOUT_LIMIT}
              onChange={(event) => setDraftAbout(event.target.value)}
            />
          </FormField>
          <FormField label="What changed" hint={`Up to ${HELP_SUMMARY_LIMIT} characters.`}>
            <input
              value={draftSummary}
              maxLength={HELP_SUMMARY_LIMIT}
              onChange={(event) => setDraftSummary(event.target.value)}
              placeholder="For example: shorter story with the winter menu."
            />
          </FormField>
          <div className="page-actions">
            <button className="builder-primary" onClick={saveDraft}>
              Save draft for the owner
            </button>
            <Helper>Drafts are labelled "{HELP_DRAFT_LABEL}" and the owner chooses what to use.</Helper>
          </div>
          {helpNotice && (
            <p role="status" className="demo-data-note">
              {helpNotice}
            </p>
          )}
        </section>
      )}
      {helpingHere && (
        <section className="builder-panel">
          <h2>Owner requests</h2>
          {requests.length === 0 ? (
            <EmptyState title="Nothing waiting" hint="The owner has not asked for work here yet." />
          ) : (
            <div className="menu-owner-list">
              {requests.map((item) => (
                <article className="menu-owner-row" key={item.id}>
                  <div>
                    <strong>{item.ask}</strong>
                    <small>
                      {item.photos.length > 0
                        ? `${item.photos.length} ${
                            item.photos.length === 1 ? "picture" : "pictures"
                          } attached`
                        : "No pictures"}
                    </small>
                    {item.reply && <small>Answered: {item.reply}</small>}
                    {item.status === "open" && (
                      <>
                        <FormField label="Your answer" hint="Short note for the owner.">
                          <textarea
                            rows={3}
                            value={replies[item.id] ?? ""}
                            maxLength={HELP_REPLY_LIMIT}
                            onChange={(event) =>
                              setReplies((current) => ({ ...current, [item.id]: event.target.value }))
                            }
                          />
                        </FormField>
                        <button className="builder-primary" onClick={() => answer(item.id)}>
                          Answer with the draft above
                        </button>
                      </>
                    )}
                  </div>
                  <Badge tone={item.status === "answered" ? "sent" : undefined}>
                    {item.status === "answered"
                      ? "Draft ready"
                      : item.status === "closed"
                        ? "Closed"
                        : "Waiting"}
                  </Badge>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {helpingHere && (
        <section className="builder-panel">
          <h2>Guests</h2>
          <p className="demo-data-note">Phone numbers stay masked while you help and cannot be revealed.</p>
          <div className="menu-owner-list">
            {guests.map((guest) => (
              <article className="menu-owner-row" key={`${guest.name}-${guest.phone}`}>
                <div>
                  <strong>{guest.name}</strong>
                  <small>{guest.phone}</small>
                </div>
                <Badge>{guest.stamps} stamps</Badge>
              </article>
            ))}
          </div>
        </section>
      )}
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
          {helpingHere ? (
            <Helper>
              Look changes wait for the owner while you help. Only page drafts can be saved here.
            </Helper>
          ) : (
            <button className="builder-primary" onClick={save}>
              Save look
            </button>
          )}
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
