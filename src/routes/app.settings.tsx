import { VenueDetailsFields } from "@/components/patron/VenueDetailsFields";
import { validateAddress } from "@/lib/venue-fields";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { Switch } from "@/components/patron/Switch";
import { FormField, PageHeader } from "@/components/patron/dash";
import { getDataModeFn } from "@/server/live";
import {
  getOwnerSettingsFn,
  requestOwnerCampaignFn,
  saveOwnerSettingsFn,
  setOwnerHelpFn,
} from "@/server/live-admin-fns";
import type { OwnerSettings } from "@/server/live-admin";
import { checkCampaignNote, type SettingsInput } from "@/lib/live-admin";
import {
  helpDate,
  HELP_DAY_CHOICES,
  HELP_DEFAULT_DAYS,
  HELP_DRAFT_LABEL,
} from "@/domain/help";

export const Route = createFileRoute("/app/settings")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await getOwnerSettingsFn() };
  },
  component: Settings,
});

function Settings() {
  const data = Route.useLoaderData();
  if (data.mode === "live") return <LiveSettings initial={data.live} />;
  return <DemoSettings />;
}

/** Live settings: business details, enquiries, alerts and orders at the till. */
function LiveSettings({ initial }: { initial: OwnerSettings | null }) {
  const [form, setForm] = useState<SettingsInput | null>(initial);
  const [notice, setNotice] = useState("");
  const [addressMessage, setAddressMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [helpOn, setHelpOn] = useState<boolean>(initial?.helpOn ?? false);
  const [helpDays, setHelpDays] = useState<number>(HELP_DEFAULT_DAYS);
  const [helpBusy, setHelpBusy] = useState(false);
  const [campaignNote, setCampaignNote] = useState("");
  const [campaignNotice, setCampaignNotice] = useState("");
  if (!initial || !form) {
    return (
      <main className="demo-hub page-width">
        <PageHeader eyebrow="Settings" title="The fine details" intro="Only the owner or a manager can change these." />
        <p role="status">We could not load your settings. Refresh the page or sign in again.</p>
      </main>
    );
  }
  const canEdit = initial.canEdit;
  const set = <K extends keyof SettingsInput>(key: K, value: SettingsInput[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  async function setHelp(enabled: boolean) {
    setHelpBusy(true);
    setNotice("");
    try {
      const result = await setOwnerHelpFn({ data: { enabled, days: helpDays } });
      setNotice(result.ok ? (enabled ? "Help from Patron is on." : "Help from Patron is off.") : result.message);
      if (result.ok) setHelpOn(enabled);
    } catch {
      setNotice("We could not change Help from Patron. Try again.");
    } finally {
      setHelpBusy(false);
    }
  }
  async function requestCampaign() {
    const check = checkCampaignNote(campaignNote);
    if (!check.ok) {
      setCampaignNotice(check.message);
      return;
    }
    setCampaignNotice("");
    try {
      const result = await requestOwnerCampaignFn({ data: { note: check.note } });
      if (result.ok) {
        setCampaignNote("");
        setCampaignNotice("Request saved. Patron will read it. Nothing has been sent to your guests.");
      } else {
        setCampaignNotice(result.message);
      }
    } catch {
      setCampaignNotice("We could not save your request. Try again.");
    }
  }
  async function save() {
    if (!form) return;
    const addressProblem = validateAddress(form.address);
    setAddressMessage(addressProblem);
    if (addressProblem) {
      setNotice(addressProblem);
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const result = await saveOwnerSettingsFn({ data: form });
      setNotice(result.ok ? "Settings saved." : result.message);
    } catch {
      setNotice("We could not save your settings. Try again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={"Settings · " + initial.name}
        title="The fine details"
        intro="Your business details, who gets enquiries, and whether the till asks what guests ordered."
      />
      <section className="builder-panel">
        <h2>Business details</h2>
        <div className="builder-fields">
          <FormField label="Business name">
            <input value={form.name} disabled={!canEdit} onChange={(e) => set("name", e.target.value)} />
          </FormField>
          <FormField label="Phone">
            <input value={form.phone} disabled={!canEdit} onChange={(e) => set("phone", e.target.value)} />
          </FormField>
          <FormField label="Address">
            <input
              value={form.address}
              disabled={!canEdit}
              onChange={(e) => set("address", e.target.value)}
              onBlur={() => setAddressMessage(validateAddress(form.address))}
            />
          </FormField>
          {addressMessage ? (
            <p className="field-error" role="alert">
              {addressMessage}
            </p>
          ) : null}
          <VenueDetailsFields
            suburb={form.suburb}
            venueType={form.venueType}
            disabled={!canEdit}
            onChange={(next) => {
              set("suburb", next.suburb);
              set("venueType", next.venueType);
            }}
          />
          <FormField label="City">
            <input value={form.city} disabled={!canEdit} onChange={(e) => set("city", e.target.value)} />
          </FormField>
        </div>
      </section>
      <section className="builder-panel">
        <h2>Messages</h2>
        <div className="builder-fields">
          <FormField label="Max messages to guests per week" hint="A number from 0 to 14.">
            <input
              type="number"
              min={0}
              max={14}
              value={form.marketingWeeklyCap}
              disabled={!canEdit}
              onChange={(e) => set("marketingWeeklyCap", Number(e.target.value))}
            />
          </FormField>
          <FormField label="Max messages to each member per week" hint="A number from 0 to 14.">
            <input
              type="number"
              min={0}
              max={14}
              value={form.memberWeeklyCap}
              disabled={!canEdit}
              onChange={(e) => set("memberWeeklyCap", Number(e.target.value))}
            />
          </FormField>
        </div>
      </section>
      <section className="builder-panel">
        <h2>Enquiries and alerts</h2>
        <FormField label="Who gets enquiries (email)">
          <input value={form.enquiryEmail} disabled={!canEdit} onChange={(e) => set("enquiryEmail", e.target.value)} />
        </FormField>
        <Switch
          checked={form.offersAlerts}
          disabled={!canEdit}
          onChange={(next) => set("offersAlerts", next)}
          label="Send me offers and alerts"
        />
        <Switch
          checked={form.ordersAtTill}
          disabled={!canEdit}
          onChange={(next) => set("ordersAtTill", next)}
          label="Ask the till what guests ordered"
        />
      </section>
      <section className="builder-panel">
        <h2>Help from Patron</h2>
        <p className="demo-data-note">
          When this is on, a Patron operator can look at your settings and help you set up for a set time. They can only change what you ask them to change. They cannot send messages or spend your credit.
        </p>
        <div className="builder-fields">
          <FormField label="Help stops after" hint="Pick a short window. You can turn it off sooner.">
            <select
              value={helpDays}
              disabled={!canEdit || helpBusy}
              onChange={(e) => setHelpDays(Number(e.target.value))}
            >
              {HELP_DAY_CHOICES.map((days) => (
                <option key={days} value={days}>
                  {days === 1 ? "1 day" : `${days} days`}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <p className="demo-data-note">{helpOn ? "On now." : "Off. Patron cannot open this restaurant in help mode."}</p>
        {canEdit ? (
          <div className="page-actions">
            <button type="button" onClick={() => setHelp(true)} disabled={helpBusy}>
              Turn on help
            </button>
            {helpOn ? (
              <button type="button" onClick={() => setHelp(false)} disabled={helpBusy}>
                Turn help off
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
      <section className="builder-panel">
        <h2>Done for you campaigns</h2>
        <p className="demo-data-note">
          Ask Patron to write and run a campaign for you. This only saves your request. Nothing is sent to your guests. Patron will get in touch before anything goes out.
        </p>
        {canEdit ? (
          <>
            <FormField label="What should the campaign say?" hint="Between 10 and 500 characters.">
              <textarea value={campaignNote} maxLength={500} onChange={(e) => setCampaignNote(e.target.value)} />
            </FormField>
            <button type="button" onClick={requestCampaign}>
              Send campaign request
            </button>
          </>
        ) : null}
        {campaignNotice ? <p role="status">{campaignNotice}</p> : null}
      </section>
      {canEdit ? (
        <button type="button" onClick={save} disabled={saving}>
          Save settings
        </button>
      ) : (
        <p>Only the owner or a manager can change these settings.</p>
      )}
      {notice ? <p role="status">{notice}</p> : null}
    </main>
  );
}

/**
 * The first render uses the fixed seed and only then switches to the stored demo data, so the form is keyed
 * on the signed-in restaurant: it starts over with the stored values instead of keeping the seed's.
 */
function DemoSettings() {
  const state = useDemoState();
  return <DemoSettingsForm key={state.session.restaurantId ?? "seed"} />;
}

function DemoSettingsForm() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const [name, setName] = useState(restaurant.name);
  const [suburb, setSuburb] = useState(restaurant.suburb);
  const [venueType, setVenueType] = useState<string>(restaurant.venueType ?? "other");
  const [address, setAddress] = useState(restaurant.address ?? "");
  const [addressMessage, setAddressMessage] = useState<string | null>(null);
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
    const addressProblem = validateAddress(address);
    setAddressMessage(addressProblem);
    if (addressProblem) {
      setNotice(addressProblem);
      return;
    }
    if (!/^[A-Za-z0-9 ]{1,11}$/.test(sender)) {
      setNotice("Sender name: up to 11 letters and numbers.");
      return;
    }
    const result = api.restaurant.update(restaurant.id, {
      name: name.trim() || restaurant.name,
      suburb: suburb.trim() || restaurant.suburb,
      venueType: venueType as NonNullable<typeof restaurant.venueType>,
      address: address.trim(),
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
          <FormField label="Address">
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onBlur={() => setAddressMessage(validateAddress(address))}
            />
          </FormField>
          {addressMessage ? (
            <p className="field-error" role="alert">
              {addressMessage}
            </p>
          ) : null}
          <VenueDetailsFields
            suburb={suburb}
            venueType={venueType}
            onChange={(next) => {
              setSuburb(next.suburb);
              setVenueType(next.venueType);
            }}
          />
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
          <button className="builder-secondary" onClick={() => saveHelp(helpOn)}>
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
