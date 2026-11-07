import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import type { FeedbackCategory, FeedbackScreenshot } from "@/data/types";
import { useDemoState } from "@/data/useDemoState";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_MAX,
  FEEDBACK_MIN,
  FEEDBACK_SHOT_MAX_BYTES,
  FEEDBACK_STATUS_LABELS,
} from "@/domain/feedback";
import {
  Badge,
  EmptyState,
  FormField,
  Helper,
  PageHeader,
} from "@/components/patron/dash";
import {
  HELP_ASK_LIMIT,
  HELP_ASK_MIN,
  HELP_DRAFT_LABEL,
  HELP_PHOTOS_MAX,
  HELP_PHOTO_MAX_BYTES,
} from "@/domain/help";

export const Route = createFileRoute("/app/feedback")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: FeedbackPage,
});

function FeedbackPage() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const [category, setCategory] = useState<FeedbackCategory>("broken");
  const [message, setMessage] = useState("");
  const [contactOk, setContactOk] = useState(false);
  const [contact, setContact] = useState("");
  const [shot, setShot] = useState<FeedbackScreenshot | null>(null);
  const [notice, setNotice] = useState("");
  const past = api.feedback.mine(restaurant.id);
  const [ask, setAsk] = useState("");
  const [askPhotos, setAskPhotos] = useState<FeedbackScreenshot[]>([]);
  const [requestNotice, setRequestNotice] = useState("");
  const requestsResult = api.help.requests({ restaurantId: restaurant.id, session: state.session });
  const requests = requestsResult.ok ? requestsResult.data : [];
  const draftsResult = api.help.drafts({ restaurantId: restaurant.id, session: state.session });
  const drafts = draftsResult.ok ? draftsResult.data : [];
  const draftFor = (id: string | undefined) => drafts.find((draft) => draft.id === id);

  const pickShot = (file: File | undefined) => {
    if (!file) {
      setShot(null);
      return;
    }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setNotice("Choose a picture in PNG, JPG or WebP format.");
      return;
    }
    if (file.size > FEEDBACK_SHOT_MAX_BYTES) {
      setNotice("Choose a picture under 300 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setShot({ name: file.name, type: file.type, dataUrl: String(reader.result) });
      setNotice("");
    };
    reader.readAsDataURL(file);
  };

  const pickAskPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = HELP_PHOTOS_MAX - askPhotos.length;
    if (room <= 0) {
      setRequestNotice(`You can attach up to ${HELP_PHOTOS_MAX} pictures.`);
      return;
    }
    for (const file of Array.from(files).slice(0, room)) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        setRequestNotice("Choose pictures in PNG, JPG or WebP format.");
        continue;
      }
      if (file.size > HELP_PHOTO_MAX_BYTES) {
        setRequestNotice("Choose pictures under 300 KB each.");
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAskPhotos((current) =>
          current.length >= HELP_PHOTOS_MAX
            ? current
            : [...current, { name: file.name, type: file.type, dataUrl: String(reader.result) }],
        );
      };
      reader.readAsDataURL(file);
    }
  };

  const askForHelp = () => {
    const result = api.help.ask({
      restaurantId: restaurant.id,
      ask,
      photos: askPhotos,
      session: state.session,
    });
    if (!result.ok) {
      setRequestNotice(result.error.message);
      return;
    }
    setAsk("");
    setAskPhotos([]);
    setRequestNotice("Asked. Your request is in the Patron queue.");
  };

  const applyDraft = (draftId: string) => {
    const result = api.help.use({ draftId, session: state.session });
    setRequestNotice(
      result.ok ? "The words are live on your page now." : result.error.message,
    );
  };

  const dropDraft = (draftId: string) => {
    const result = api.help.discard({ draftId, session: state.session });
    setRequestNotice(result.ok ? "Draft thrown away. Nothing changed." : result.error.message);
  };

  const send = () => {
    const result = api.feedback.submit({
      source: "owner",
      restaurantId: restaurant.id,
      category,
      message,
      contactOk,
      contact: contact || undefined,
      screenshot: shot,
    });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice("Thank you. Your note is with the Patron team.");
    setMessage("");
    setContact("");
    setContactOk(false);
    setShot(null);
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Feedback · ${restaurant.name}`}
        title="Tell us what to fix."
        intro="A bug, a feature you want, or something that confused you. We read every note. This is separate from guest ideas, which asks for a place to join Patron."
      />
      <section className="builder-panel">
        <h2>Requests</h2>
        <p className="demo-data-note">
          Ask the Patron team for a piece of work and attach up to {HELP_PHOTOS_MAX} pictures.
          An answer arrives as a draft labelled "{HELP_DRAFT_LABEL}". Nothing goes live until you
          use it.
        </p>
        <FormField
          label="What do you need?"
          hint={`Between ${HELP_ASK_MIN} and ${HELP_ASK_LIMIT} characters.`}
        >
          <textarea
            rows={4}
            value={ask}
            maxLength={HELP_ASK_LIMIT}
            onChange={(event) => setAsk(event.target.value)}
            placeholder="For example: please rewrite our page story for the winter menu."
          />
        </FormField>
        <FormField label="Add pictures (optional)">
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              pickAskPhotos(event.target.files);
              event.target.value = "";
            }}
          />
        </FormField>
        {askPhotos.length > 0 && (
          <div className="help-photos">
            {askPhotos.map((photo) => (
              <figure key={photo.dataUrl.slice(-32)}>
                <img src={photo.dataUrl} alt={photo.name} />
                <button
                  type="button"
                  onClick={() => setAskPhotos((current) => current.filter((item) => item !== photo))}
                >
                  Remove
                </button>
              </figure>
            ))}
          </div>
        )}
        <div className="page-actions">
          <button className="builder-secondary" onClick={askForHelp}>
            Send request
          </button>
          <Helper>
            Pictures are seen only by you and the Patron team. Guest phone numbers stay masked.
          </Helper>
        </div>
        {requestNotice && (
          <p role="status" className="demo-data-note">
            {requestNotice}
          </p>
        )}
        {requests.length === 0 ? (
          <EmptyState title="No requests yet." hint="Anything you ask for appears here with its answer." />
        ) : (
          <div className="menu-owner-list">
            {requests.map((item) => {
              const draft = draftFor(item.draftId);
              return (
                <article className="menu-owner-row" key={item.id}>
                  <div>
                    <strong>{item.ask}</strong>
                    <small>
                      {formatTime(item.createdAt)}
                      {item.photos.length > 0
                        ? ` · ${item.photos.length} ${
                            item.photos.length === 1 ? "picture" : "pictures"
                          }`
                        : ""}
                    </small>
                    {item.photos.length > 0 && (
                      <div className="help-photos">
                        {item.photos.map((photo) => (
                          <img key={photo.dataUrl.slice(-32)} src={photo.dataUrl} alt={photo.name} />
                        ))}
                      </div>
                    )}
                    {item.reply && <small>Patron said: {item.reply}</small>}
                    {draft && draft.status === "draft" && (
                      <div className="help-draft">
                        <small>{draft.label}</small>
                        <strong>{draft.tagline}</strong>
                        <p>{draft.about}</p>
                        <small>Prepared by {draft.preparedBy}</small>
                        <div className="page-actions">
                          <button className="builder-primary" onClick={() => applyDraft(draft.id)}>
                            Use these words
                          </button>
                          <button onClick={() => dropDraft(draft.id)}>Throw away</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <Badge tone={item.status === "answered" ? "sent" : undefined}>
                    {item.status === "answered"
                      ? "Draft ready"
                      : item.status === "closed"
                        ? "Closed"
                        : "With Patron"}
                  </Badge>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="builder-panel">
        <h2>Write a note</h2>
        <FormField label="What is it about?">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
          >
            {FEEDBACK_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {FEEDBACK_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          label="Your note"
          hint={`Between ${FEEDBACK_MIN} and ${FEEDBACK_MAX} characters.`}
        >
          <textarea
            rows={5}
            value={message}
            maxLength={FEEDBACK_MAX}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="For example: the Preview button did nothing on my phone."
          />
        </FormField>
        <FormField label="Add a picture (optional)">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => pickShot(event.target.files?.[0])}
          />
        </FormField>
        {shot && (
          <p className="builder-hint">
            {shot.name} attached. Pictures are seen only by you and the Patron team.
          </p>
        )}
        <label className="builder-check">
          <input
            type="checkbox"
            checked={contactOk}
            onChange={(event) => setContactOk(event.target.checked)}
          />
          You may contact me about this
        </label>
        {contactOk && (
          <FormField label="How should we reach you? (optional)">
            <input
              value={contact}
              maxLength={120}
              onChange={(event) => setContact(event.target.value)}
              placeholder="Phone or email"
            />
          </FormField>
        )}
        <div className="page-actions">
          <button className="builder-primary" onClick={send}>
            Send feedback
          </button>
          <Helper>We reply only if you tick the contact box.</Helper>
        </div>
        {notice && (
          <p role="status" className="demo-data-note">
            {notice}
          </p>
        )}
      </section>

      <section className="builder-panel">
        <h2>Your past feedback</h2>
        {past.length === 0 ? (
          <EmptyState
            title="No notes yet."
            hint="When you send one, you can follow its status here."
          />
        ) : (
          <div className="menu-owner-list">
            {past.map((item) => (
              <article className="menu-owner-row" key={item.id}>
                <div>
                  <strong>{FEEDBACK_CATEGORY_LABELS[item.category]}</strong>
                  <small>
                    {formatTime(item.createdAt)} · {item.message}
                    {item.screenshot ? " · Picture attached" : ""}
                  </small>
                </div>
                <Badge
                  tone={
                    item.status === "done"
                      ? "sent"
                      : item.status === "seen" || item.status === "planned"
                        ? "active"
                        : undefined
                  }
                >
                  {FEEDBACK_STATUS_LABELS[item.status]}
                </Badge>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));
}
