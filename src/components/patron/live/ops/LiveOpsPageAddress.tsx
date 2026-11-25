import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { FormField } from "@/components/patron/dash";
import { CHANGE_ADDRESS_WARNING, checkAddressChange } from "@/lib/live-ops-restaurants";
import { changeSlugFn } from "@/server/live-ops-restaurants-fns";

/**
 * Operator only: change a restaurant's page address. Owners cannot do this themselves, because a printed
 * QR code points at the old address. The old address keeps working: it redirects to the new one.
 */
export function LiveOpsPageAddress({ restaurantId, slug }: { restaurantId: string; slug: string }) {
  const router = useRouter({ warn: false });
  const [next, setNext] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const ask = () => {
    const check = checkAddressChange(slug, next, reason);
    if (!check.ok) {
      setMessage(check.message);
      setConfirming(false);
      return;
    }
    setMessage(null);
    setConfirming(true);
  };

  const change = async () => {
    const check = checkAddressChange(slug, next, reason);
    if (!check.ok) {
      setMessage(check.message);
      setConfirming(false);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await changeSlugFn({ data: { restaurantId, newSlug: check.slug, reason: check.reason } });
      setMessage(result.message ?? (result.ok ? "Page address changed." : "Nothing changed."));
      if (result.ok) {
        setNext("");
        setReason("");
        await router?.invalidate();
      }
    } catch {
      setMessage("Something went wrong. Nothing changed. Try again.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <section aria-label="Page address">
      <h2>Page address</h2>
      <p>
        Guests open this restaurant at <strong>/r/{slug}</strong>.
      </p>
      <FormField label="New page address" hint="Lowercase letters and numbers, with single dashes between words.">
        <input
          value={next}
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => {
            setNext(event.target.value);
            setConfirming(false);
          }}
        />
      </FormField>
      <FormField label="Reason for the record" hint="At least 3 characters. Shown in the activity log.">
        <input
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setConfirming(false);
          }}
        />
      </FormField>
      {confirming ? (
        <div role="alertdialog" aria-label="Confirm the address change">
          <p>{CHANGE_ADDRESS_WARNING}</p>
          <button className="builder-primary" type="button" disabled={busy} onClick={change}>
            Yes, change the address
          </button>{" "}
          <button className="builder-secondary" type="button" disabled={busy} onClick={() => setConfirming(false)}>
            Keep the current address
          </button>
        </div>
      ) : (
        <button className="builder-secondary" type="button" disabled={busy} onClick={ask}>
          Change address
        </button>
      )}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
