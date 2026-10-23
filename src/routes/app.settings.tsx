import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";

export const Route = createFileRoute("/app/settings")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: Settings,
});

function Settings() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const [name, setName] = useState(restaurant.name);
  const [suburb, setSuburb] = useState(restaurant.suburb);
  const [sender, setSender] = useState(restaurant.senderName);
  const [capRestaurant, setCapRestaurant] = useState(restaurant.smsCapRestaurant);
  const [capMember, setCapMember] = useState(restaurant.smsCapMember);
  const [contact, setContact] = useState(restaurant.contact);
  const [notice, setNotice] = useState("");

  const save = () => {
    if (!/^[A-Za-z0-9 ]{1,11}$/.test(sender)) {
      setNotice("Sender name: up to 11 letters and numbers.");
      return;
    }
    const result = api.restaurant.update(restaurant.id, {
      name: name.trim() || restaurant.name,
      suburb: suburb.trim() || restaurant.suburb,
      senderName: sender,
      smsCapRestaurant: Math.max(1, capRestaurant),
      smsCapMember: Math.max(1, capMember),
      contact: contact.trim(),
    });
    setNotice(result.ok ? "Settings saved." : result.error.message);
  };

  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Settings · {restaurant.name}
      </p>
      <h1>The fine details.</h1>
      <div className="builder-fields">
        <label className="builder-field">
          Business name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="builder-field">
          Suburb
          <input value={suburb} onChange={(event) => setSuburb(event.target.value)} />
        </label>
        <label className="builder-field">
          SMS sender name (11 chars, letters and numbers)
          <input
            value={sender}
            maxLength={11}
            onChange={(event) => setSender(event.target.value)}
          />
        </label>
        <label className="builder-field">
          Max messages per restaurant per week
          <input
            type="number"
            min={1}
            value={capRestaurant}
            onChange={(event) => setCapRestaurant(Number(event.target.value))}
          />
        </label>
        <label className="builder-field">
          Max messages per member per week
          <input
            type="number"
            min={1}
            value={capMember}
            onChange={(event) => setCapMember(Number(event.target.value))}
          />
        </label>
        <label className="builder-field">
          Contact shown on the public page
          <input value={contact} onChange={(event) => setContact(event.target.value)} />
        </label>
      </div>
      <button className="builder-primary" onClick={save}>
        Save settings
      </button>
      {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}
    </main>
  );
}
