import { safely } from "@/lib/server-call";
import { useState } from "react";
import { FormField, PageHeader } from "@/components/patron/dash";
import { createRestaurantForOwnerFn } from "@/server/live-ops-fns";

/** Create a restaurant for an owner. Live only; the server checks the operator again. */
export function LiveOpsNewRestaurant() {
  const [ownerEmail, setOwnerEmail] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMessage(null);
    const result = await safely(createRestaurantForOwnerFn({ data: { ownerEmail, name, slug, suburb, city } }));
    if (result.ok) {
      setMessage("Restaurant created. It is a draft until it is set to live.");
      window.location.assign(`/ops/restaurants/${result.restaurantId}`);
      return;
    }
    setMessage(result.message);
    setBusy(false);
  }

  return (
    <main className="demo-hub page-width">
      <PageHeader eyebrow="Operator workspace" title="Add a restaurant" intro="The restaurant starts as a draft. Its owner needs an existing Patron account with this email." />
      {message ? <p role="status">{message}</p> : null}
      <FormField label="Owner email">
        <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
      </FormField>
      <FormField label="Restaurant name">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Web address (letters, numbers and dashes)" hint="For example daily-grind. Shown on the public page.">
        <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
      </FormField>
      <FormField label="Suburb">
        <input value={suburb} onChange={(e) => setSuburb(e.target.value)} />
      </FormField>
      <FormField label="City">
        <input value={city} onChange={(e) => setCity(e.target.value)} />
      </FormField>
      <button className="builder-primary" onClick={submit} disabled={busy}>
        Create restaurant
      </button>
    </main>
  );
}
