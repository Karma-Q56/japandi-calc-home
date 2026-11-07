import { useState } from "react";

/** The guest's personal bring a friend link, with a Copy button. */
export function ReferralShare({ slug, code }: { slug: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/r/${slug}/join?ref=${code}&src=friend_referral`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="gx-panel" aria-labelledby="referral-share-heading">
      <h2 id="referral-share-heading">Bring a friend</h2>
      <p>Send this link to a friend. When they get their first stamp, you both earn a reward.</p>
      <p>
        <code>{link}</code>
      </p>
      <button type="button" className="builder-secondary" onClick={copy}>
        {copied ? "Copied" : "Copy link"}
      </button>
    </section>
  );
}
