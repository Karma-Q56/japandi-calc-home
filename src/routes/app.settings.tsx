import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { Switch } from "@/components/patron/Switch";
import { FormField, PageHeader } from "@/components/patron/dash";
import {
  helpDate,
  HELP_DAY_CHOICES,
  HELP_DEFAULT_DAYS,
  HELP_DRAFT_LABEL,
} from "@/domain/help";

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
  const [enquiryNotifyEmail, setEnquiryNotifyEmail] = useState(
    restaurant.enquiryNotifyEmail ?? "",
  );
  const [notice, setNotice] = useState("");
  const [autoApprove, setAutoApprove] = useState(restaurant.campaignAutoApprove ?? false);
  const [defaultDiscount, setDefaultDiscount] = useState(restaurant.defaultDiscountPercent ?? 10);
  const [emailUpdates, setEmailUpdates] = useState<"weekly" | "monthly" | "off">(
    restaurant.emailUpdates ?? "weekly",
  );
  const [lowCreditAlert, setLowCreditAlert] = useState(
    Math.round((restaurant.lowCreditAlertCents ?? 2000) / 100),
  );
  const [trackOrders, setTrackOrders] = useState(restaurant.trackOrders ?? false);
  const [ordersMode, setOrdersMode] = useState<"items" | "categories">(
    restaurant.ordersMode ?? "items",
  );
  const help = api.help.state(restaurant.id);
  const [helpOn, setHelpOn] = useState(restaurant.patronHelp?.enabled ?? false);
  const [helpDays, setHelpDays] = useState(HELP_DEFAULT_DAYS);

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
      enquiryNotifyEmail: enquiryNotifyEmail.trim(),
      campaignAutoApprove: autoApprove,
      defaultDiscountPercent: Math.min(100, Math.max(0, defaultDiscount)),
      emailUpdates,
      lowCreditAlertCents: Math.max(0, Math.round(lowCreditAlert)) * 100,
    });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    const ordersResult = api.orders.setTracking({
      restaurantId: restaurant.id,
      trackOrders,
      ordersMode,
      session: state.session.restaurantId
        ? { role: state.session.role, restaurantId: state.session.restaurantId }
        : { role: state.session.role },
    });
    setNotice(ordersResult.ok ? "Settings saved." : ordersResult.error.message);
  };

  const saveHelp = (enabled = helpOn) => {
    const result = api.help.enable({
      restaurantId: restaurant.id,
      enabled,
      days: helpDays,
      session: state.session,
    });
    setHelpOn(enabled);
    setNotice(
      result.ok
        ? enabled
          ? `Patron can help until ${helpDate(result.data.expiresAt ?? "")}.`
          : "Help from Patron is off."
        : result.error.message,
    );
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Settings · ${restaurant.name}`}
        title="The fine details"
        intro="Your business details, message limits and whether the till asks what guests ordered."
      />
      <section className="builder-panel">
        <h2>Business details</h2>
        <div className="builder-fields">
          <FormField label="Business name">
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <FormField label="Suburb">
            <input value={suburb} onChange={(event) => setSuburb(event.target.value)} />
          </FormField>
          <FormField label="Contact shown on the public page">
            <input value={contact} onChange={(event) => setContact(event.target.value)} />
          </FormField>
        </div>
      </section>
      <section className="builder-panel">
        <h2>Enquiries</h2>
        <p className="demo-data-note">
          Where Patron should send a note when someone fills in the contact form on the website.
        </p>
        <div className="builder-fields">
          <FormField
            label="Email that gets new enquiries"
            hint="Placeholder only in demo. No real email is sent until the live mail service is switched on."
          >
            <input
              type="email"
              value={enquiryNotifyEmail}
              maxLength={254}
              onChange={(event) => setEnquiryNotifyEmail(event.target.value)}
              placeholder="you@example.co.za"
            />
          </FormField>
        </div>
      </section>
      <section className="builder-panel">
        <h2>Messages</h2>
        <div className="builder-fields">
          <FormField label="SMS sender name" hint="Up to 11 letters and numbers.">
            <input
              value={sender}
              maxLength={11}
              onChange={(event) => setSender(event.target.value)}
            />
          </FormField>
          <FormField
            label="Max messages per restaurant per week"
            hint="A safety limit for the whole venue."
          >
            <input
              type="number"
              min={1}
              value={capRestaurant}
              onChange={(event) => setCapRestaurant(Number(event.target.value))}
            />
          </FormField>
          <FormField
            label="Max messages per member per week"
            hint="How often one guest can hear from you."
          >
            <input
              type="number"
              min={1}
              value={capMember}
              onChange={(event) => setCapMember(Number(event.target.value))}
            />
          </FormField>
        </div>
      </section>
      <section className="builder-panel">
        <h2>Offers and alerts</h2>
        <div className="builder-fields">
          <FormField
            label="Default discount for a new offer"
            hint="A starting percentage when you write a special. You can change it on each offer."
          >
            <input
              type="number"
              min={0}
              max={100}
              value={defaultDiscount}
              onChange={(event) => setDefaultDiscount(Number(event.target.value))}
            />
          </FormField>
          <FormField
            label="Email updates"
            hint="A short results email. Placeholder only until the mail service is connected."
          >
            <select
              value={emailUpdates}
              onChange={(event) =>
                setEmailUpdates(
                  event.target.value === "monthly"
                    ? "monthly"
                    : event.target.value === "off"
                      ? "off"
                      : "weekly",
                )
              }
            >
              <option value="weekly">Every week</option>
              <option value="monthly">Once a month</option>
              <option value="off">No email</option>
            </select>
          </FormField>
          <FormField
            label="Low SMS credit alert (rand)"
            hint="We will flag it in the dashboard when your balance drops below this."
          >
            <input
              type="number"
              min={0}
              value={lowCreditAlert}
              onChange={(event) => setLowCreditAlert(Number(event.target.value))}
            />
          </FormField>
        </div>
      </section>
      <section className="builder-panel">
        <h2>Done for you campaigns</h2>
        <Switch
          label="Auto approve Patron's campaign drafts"
          hint="Off by default. When off, every campaign Patron writes waits for your approval and nothing sends until you say yes."
          checked={autoApprove}
          onChange={setAutoApprove}
        />
        <p className="demo-data-note">
          Even with auto approve on, a campaign only sends after its cost and audience are confirmed.
        </p>
      </section>
      <section className="builder-panel">
        <h2>Help from Patron</h2>
        <p className="demo-data-note">
          When this is on, a Patron operator can work inside {restaurant.name} for a set time.
          Everything they change is saved as a draft labelled "{HELP_DRAFT_LABEL}". They cannot
          publish, send messages or spend your credit. Guest phone numbers stay masked.
        </p>
        <Switch
          label="Let Patron help"
          hint="Off by default. Help stops on its own when the time runs out."
          checked={helpOn}
          onChange={setHelpOn}
        />
        <div className="builder-fields">
          <FormField label="Help stops after" hint="Pick a short window. You can stop it sooner.">
            <select
              value={helpDays}
              disabled={!helpOn}
              onChange={(event) => setHelpDays(Number(event.target.value))}
            >
              {HELP_DAY_CHOICES.map((days) => (
                <option key={days} value={days}>
                  {days === 1 ? "1 day" : `${days} days`}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <p className="demo-data-note">
          {help.active && help.expiresAt
            ? `On now. Help stops on ${helpDate(help.expiresAt)} (${help.daysLeft} ${
                help.daysLeft === 1 ? "day" : "days"
              } left).`
            : help.enabled && help.expiresAt
              ? `Help ended on ${helpDate(help.expiresAt)}. Turn it on again if you want more help.`
              : "Off. Patron cannot open this restaurant in help mode."}
        </p>
        <div className="page-actions">
          <button className="builder-primary" onClick={() => saveHelp(helpOn)}>
            Save help setting
          </button>
          {help.enabled ? (
            <button onClick={() => saveHelp(false)}>Stop help now</button>
          ) : null}
        </div>
      </section>
      <section className="builder-panel">
        <h2>Orders at the till</h2>
        <Switch
          label="Track what guests order"
          hint="After each stamp, staff can tap what the guest had. Nothing gets blocked or slowed."
          checked={trackOrders}
          onChange={setTrackOrders}
        />
        <div className="builder-fields">
          <FormField label="Quick buttons show">
            <select
              value={ordersMode}
              onChange={(event) =>
                setOrdersMode(event.target.value === "categories" ? "categories" : "items")
              }
              disabled={!trackOrders}
            >
              <option value="items">Single items from the menu</option>
              <option value="categories">Simple categories (breakfast, coffee, lunch)</option>
            </select>
          </FormField>
        </div>
      </section>
      <div className="page-actions">
        <button className="builder-primary" onClick={save}>
          Save settings
        </button>
      </div>
      {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}
    </main>
  );
}
