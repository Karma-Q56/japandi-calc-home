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
