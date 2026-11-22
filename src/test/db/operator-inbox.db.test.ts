// @vitest-environment node
// Real database tests for migration 0037 (operator inbox: campaign approvals, enquiries, feedback,
// ideas and the SMS outbox). The first version of this file ran four small checks. Review added a
// run of every function with real rows, because these functions compile lazily and a wrong column
// name would only show up the first time an operator opened the screen.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asApp,
  cleanup,
  connect,
  dbTestsEnabled,
  makeAppUser,
  makeGuest,
  makeMembership,
  makeRestaurant,
  newFixtures,
  token,
  type DbConnections,
  type Fixtures,
  type Tx,
} from "../db-fixture";

type Row = Record<string, unknown>;

describe.skipIf(!dbTestsEnabled)("operator inbox (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();
  const leadIds: string[] = [];
  const feedbackIds: string[] = [];
  const ideaIds: string[] = [];

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await db.owner`delete from audit_event where object_id = any(${[...leadIds, ...feedbackIds, ...ideaIds]})`;
    if (leadIds.length) await db.owner`delete from lead where id = any(${leadIds}::uuid[])`;
    if (feedbackIds.length) await db.owner`delete from feedback where id = any(${feedbackIds})`;
    if (ideaIds.length) await db.owner`delete from idea where id = any(${ideaIds})`;
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  const operator = () => makeAppUser(db.owner, fixtures, { role: "operator" });

  /** Run work as the app role with the operator flag on, and keep the result. */
  const persist = <T>(work: (tx: Tx) => Promise<T>) => asApp(db.app, { operator: true }, work, { rollback: false });

  /** The error text of one call, or "ok". Nothing is kept. */
  const outcome = (ctx: { operator?: boolean; restaurantId?: string }, run: (tx: Tx) => Promise<unknown>) =>
    asApp(db.app, ctx, async (tx) => {
      try {
        await run(tx);
        return "ok";
      } catch (error) {
        return String(error);
      }
    });

  async function seedLead(values: Partial<{
    restaurantName: string; contactName: string; phone: string; email: string | null; status: string;
    suburb: string; calculator: Record<string, string | number | boolean | null> | null;
  }> = {}) {
    const [row] = await db.owner<{ id: string; reference: string }[]>`
      insert into lead (kind, restaurant_name, contact_name, phone, email, suburb, consent, consent_version,
                        consent_at, status, calculator, visit_wanted, preferred_day, role, venue_type)
      values ('waitlist', ${values.restaurantName ?? `Lead Grill ${token().slice(0, 6)}`},
              ${values.contactName ?? "Thandi Test"}, ${values.phone ?? "+27835550001"},
              ${values.email === undefined ? `thandi-${token().slice(0, 8)}@example.test` : values.email},
              ${values.suburb ?? "Parktown"}, true, 'v1', now(), ${values.status ?? "new"}::lead_status,
              ${values.calculator ? db.owner.json(values.calculator) : null}, true, 'Tuesday', 'Owner', 'Cafe')
      returning id, reference`;
    leadIds.push(row!.id);
    return row!;
  }

  async function seedFeedback(values: { contactOk: boolean; screenshot?: boolean; status?: string; restaurantId?: string | null }) {
    const id = `fb-${token().slice(0, 16)}`;
    await db.owner`
      insert into feedback (id, restaurant_id, source, category, message, contact_ok, contact, status,
                            screenshot_name, screenshot_type, screenshot_data)
      values (${id}, ${values.restaurantId ?? null}, 'owner', 'feature', 'Please add a tip jar', ${values.contactOk},
              'sam@example.test', ${values.status ?? "new"},
              ${values.screenshot ? "shot.png" : null}, ${values.screenshot ? "image/png" : null},
              ${values.screenshot ? "data:image/png;base64,AAAA" : null})`;
    feedbackIds.push(id);
    return id;
  }

  it("refuses every inbox function when the caller is not an operator", async () => {
    const ownerId = await makeAppUser(db.owner, fixtures, { role: "owner" });
    const leadId = (await seedLead()).id;
    const feedbackId = await seedFeedback({ contactOk: true });
    const calls: Array<[string, (tx: Tx) => Promise<unknown>]> = [
      ["pending campaigns", (tx) => tx`select operator_list_pending_campaigns(${ownerId})`],
      ["list leads", (tx) => tx`select operator_list_leads(${ownerId}, '', '', 10, 0)`],
      ["update lead", (tx) => tx`select operator_update_lead(${ownerId}, ${leadId}::uuid, 'replied', 'note')`],
      ["list feedback", (tx) => tx`select operator_list_feedback(${ownerId}, '', 10, 0)`],
      ["screenshot", (tx) => tx`select operator_feedback_screenshot(${ownerId}, ${feedbackId})`],
      ["set feedback", (tx) => tx`select operator_set_feedback(${ownerId}, ${feedbackId}, 'seen', '')`],
      ["list ideas", (tx) => tx`select operator_list_ideas(${ownerId}, '', 10, 0)`],
      ["set idea", (tx) => tx`select operator_set_idea(${ownerId}, 'x', 'new', '')`],
      ["list outbox", (tx) => tx`select operator_list_outbox(${ownerId}, '', 10, 0)`],
      ["outbox summary", (tx) => tx`select operator_outbox_summary(${ownerId})`],
    ];
    for (const [name, run] of calls) {
      expect(await outcome({}, run), name).toMatch(/not_operator/);
    }
  });

  it("lists only campaigns waiting for approval, with the restaurant name", async () => {
    const op = await operator();
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { name: "Approval Cafe", status: "active" });
    const add = async (status: string) => {
      const [row] = await db.owner<{ id: string }[]>`
        insert into campaign (restaurant_id, name, message_body, channel, audience, code, status,
                              est_recipients, est_segments, est_cost_cents, created_by)
        values (${restaurantId}, ${`Camp ${status}`}, 'Hello there', 'sms', ${db.owner.json({ type: "everyone" })},
                ${token().slice(0, 8).toUpperCase()}, ${status}::campaign_status, 12, 1, 300, 'test')
        returning id`;
      return row!.id;
    };
    const waiting = await add("pending_approval");
    const draft = await add("draft");
    const rows = await persist(async (tx) => {
      const [r] = await tx`select operator_list_pending_campaigns(${op}) as r`;
      return r!["r"] as Row[];
    });
    const ids = rows.map((row) => row["id"]);
    expect(ids).toContain(waiting);
    expect(ids).not.toContain(draft);
    expect(rows.find((row) => row["id"] === waiting)).toMatchObject({ restaurant_name: "Approval Cafe", est_recipients: 12, est_cost_cents: 300 });
  });

  it("lists enquiries with the contact details the visitor gave, filtered by status", async () => {
    const op = await operator();
    const lead = await seedLead({ status: "contacted", calculator: { guests: 120, wants_sms: true } });
    const other = await seedLead({ status: "won" });
    const read = (status: string, search: string, limit = 200) =>
      persist(async (tx) => {
        const [r] = await tx`select operator_list_leads(${op}, ${status}, ${search}, ${limit}, 0) as r`;
        return r!["r"] as Row[];
      });
    const all = await read("", "");
    const mine = all.find((row) => row["id"] === lead.id)!;
    expect(mine).toMatchObject({ contact_name: "Thandi Test", suburb: "Parktown", visit_wanted: true, reference: lead.reference });
    expect(String(mine["phone"])).toMatch(/^\+27/);
    expect(String(mine["email"])).toContain("@example.test");
    expect(mine["calculator"]).toEqual({ guests: 120, wants_sms: true });
    const contacted = await read("contacted", "");
    expect(contacted.map((r) => r["id"])).toContain(lead.id);
    expect(contacted.map((r) => r["id"])).not.toContain(other.id);
    expect((await read("", "", 1)).length).toBe(1);
    expect((await read("", "", 0)).length).toBe(1); // a limit below 1 is raised to 1
    expect(await outcome({ operator: true }, (tx) => tx`select operator_list_leads(${op}, 'maybe', '', 10, 0)`)).toMatch(/invalid_value/);
  });

  it("searches enquiries by reference, restaurant, name, phone and email, and treats % and _ as plain characters", async () => {
    const op = await operator();
    const marker = token().slice(0, 8);
    const lead = await seedLead({ restaurantName: `Findable ${marker} Kitchen`, contactName: `Zola ${marker}`, email: `zola-${marker}@example.test` });
    const odd = await seedLead({ restaurantName: `100% Pure_Grill ${marker}`, email: null });
    const read = (search: string) =>
      persist(async (tx) => {
        const [r] = await tx`select operator_list_leads(${op}, '', ${search}, 200, 0) as r`;
        return (r!["r"] as Row[]).map((row) => row["id"]);
      });
    expect(await read(marker)).toEqual(expect.arrayContaining([lead.id, odd.id]));
    expect(await read(lead.reference)).toContain(lead.id);
    expect(await read(`zola ${marker}`)).toContain(lead.id);
    expect(await read(`zola-${marker}@`)).toContain(lead.id);
    // A lone % must not match everything, and an underscore must not match any single character.
    expect(await read("%")).toContain(odd.id);
    expect(await read("%")).not.toContain(lead.id);
    expect(await read("Pure_Grill")).toContain(odd.id);
    expect(await read("Pure.Grill")).not.toContain(odd.id);
    expect(await read("Pure%Grill")).not.toContain(odd.id);
  });

  it("updates an enquiry: first reply time, closed time, private note, and an audit row without the note", async () => {
    const op = await operator();
    const lead = await seedLead();
    const update = (status: string, notes: string) =>
      persist((tx) => tx`select operator_update_lead(${op}, ${lead.id}::uuid, ${status}, ${notes})`);
    const state = async () => {
      const [row] = await db.owner<{ status: string; admin_notes: string | null; replied_at: Date | null; closed_at: Date | null }[]>`
        select status::text as status, admin_notes, replied_at, closed_at from lead where id = ${lead.id}`;
      return row!;
    };

    await update("contacted", "  Called, asked for a demo  ");
    const first = await state();
    expect(first).toMatchObject({ status: "contacted", admin_notes: "Called, asked for a demo", closed_at: null });
    expect(first.replied_at).not.toBeNull();

    await update("won", "");
    const won = await state();
    expect(won.admin_notes).toBeNull(); // an empty note clears it
    expect(won.closed_at).not.toBeNull();
    expect(won.replied_at!.getTime()).toBe(first.replied_at!.getTime()); // the first reply time never moves

    await update("contacted", "Reopened");
    expect((await state()).closed_at).toBeNull();

    await update("new", "Back to new");
    expect((await state()).replied_at!.getTime()).toBe(first.replied_at!.getTime());

    expect(await outcome({ operator: true }, (tx) => tx`select operator_update_lead(${op}, ${lead.id}::uuid, 'archived', '')`)).toMatch(/invalid_value/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_update_lead(${op}, ${lead.id}::uuid, 'new', ${"x".repeat(1001)})`)).toMatch(/invalid_value/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_update_lead(${op}, ${crypto.randomUUID()}::uuid, 'new', '')`)).toMatch(/lead_not_found/);

    const audit = await db.owner<{ meta: Record<string, string> }[]>`
      select meta from audit_event where object_id = ${lead.id} and action = 'lead_updated' order by created_at`;
    expect(audit).toHaveLength(4);
    expect(audit[0]!.meta).toEqual({ from: "new", to: "contacted" });
    expect(JSON.stringify(audit)).not.toContain("Called, asked");
  });

  it("lists feedback with contact only when the sender allowed it, and never with the picture", async () => {
    const op = await operator();
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { name: "Feedback Bistro", status: "active" });
    const allowed = await seedFeedback({ contactOk: true, screenshot: true, restaurantId });
    const private_ = await seedFeedback({ contactOk: false });
    const rows = await persist(async (tx) => {
      const [r] = await tx`select operator_list_feedback(${op}, '', 200, 0) as r`;
      return r!["r"] as Row[];
    });
    const a = rows.find((row) => row["id"] === allowed)!;
    const b = rows.find((row) => row["id"] === private_)!;
    expect(a).toMatchObject({ contact: "sam@example.test", contact_ok: true, has_screenshot: true, restaurant_name: "Feedback Bistro" });
    expect(b).toMatchObject({ contact: null, contact_ok: false, has_screenshot: false });
    expect(JSON.stringify(rows)).not.toContain("data:image");
    expect(String(a["reference"])).toMatch(/^FB-\d{4}-\d{3,}$/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_list_feedback(${op}, 'bogus', 10, 0)`)).toMatch(/invalid_value/);
    const filtered = await persist(async (tx) => {
      const [r] = await tx`select operator_list_feedback(${op}, 'done', 200, 0) as r`;
      return (r!["r"] as Row[]).map((row) => row["id"]);
    });
    expect(filtered).not.toContain(allowed);
  });

  it("returns one screenshot to the operator, and refuses an unknown feedback id", async () => {
    const op = await operator();
    const id = await seedFeedback({ contactOk: false, screenshot: true });
    const picture = await persist(async (tx) => {
      const [r] = await tx`select operator_feedback_screenshot(${op}, ${id}) as r`;
      return r!["r"];
    });
    expect(picture).toBe("data:image/png;base64,AAAA");
    expect(await outcome({ operator: true }, (tx) => tx`select operator_feedback_screenshot(${op}, 'nope')`)).toMatch(/feedback_not_found/);
  });

  it("sets feedback status and note, with checks and an audit row that has no note text", async () => {
    const op = await operator();
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const id = await seedFeedback({ contactOk: false, restaurantId });
    await persist((tx) => tx`select operator_set_feedback(${op}, ${id}, 'planned', 'Planned for the next release')`);
    const [row] = await db.owner<{ status: string; note: string }[]>`select status, note from feedback where id = ${id}`;
    expect(row).toEqual({ status: "planned", note: "Planned for the next release" });
    expect(await outcome({ operator: true }, (tx) => tx`select operator_set_feedback(${op}, ${id}, 'later', '')`)).toMatch(/invalid_value/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_set_feedback(${op}, ${id}, 'seen', ${"x".repeat(501)})`)).toMatch(/bad_reason/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_set_feedback(${op}, 'nope', 'seen', '')`)).toMatch(/feedback_not_found/);
    const audit = await db.owner<{ restaurant_id: string; meta: Record<string, string> }[]>`
      select restaurant_id, meta from audit_event where object_id = ${id} and action = 'feedback_updated'`;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ restaurant_id: restaurantId, meta: { status: "planned" } });
    expect(JSON.stringify(audit)).not.toContain("next release");
  });

  it("lists ideas most asked first, and sets an idea's status and note", async () => {
    const op = await operator();
    const marker = token().slice(0, 6);
    const add = async (place: string, asks: number) => {
      const id = `idea-${token().slice(0, 14)}`;
      await db.owner`insert into idea (id, place, suburb, asks) values (${id}, ${`${place} ${marker}`}, 'Rosebank', ${asks})`;
      ideaIds.push(id);
      return id;
    };
    const few = await add("Quiet Cafe", 2);
    const many = await add("Busy Cafe", 9);
    const rows = await persist(async (tx) => {
      const [r] = await tx`select operator_list_ideas(${op}, '', 200, 0) as r`;
      return (r!["r"] as Row[]).map((row) => row["id"]);
    });
    expect(rows.indexOf(many)).toBeGreaterThanOrEqual(0);
    expect(rows.indexOf(many)).toBeLessThan(rows.indexOf(few));
    await persist((tx) => tx`select operator_set_idea(${op}, ${many}, 'exploring', 'Called the owner')`);
    const [row] = await db.owner<{ status: string; admin_notes: string }[]>`select status, admin_notes from idea where id = ${many}`;
    expect(row).toEqual({ status: "exploring", admin_notes: "Called the owner" });
    expect(await outcome({ operator: true }, (tx) => tx`select operator_set_idea(${op}, ${many}, 'later', '')`)).toMatch(/invalid_value/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_set_idea(${op}, ${many}, 'added', ${"x".repeat(501)})`)).toMatch(/bad_reason/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_set_idea(${op}, 'nope', 'added', '')`)).toMatch(/idea_not_found/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_list_ideas(${op}, 'bogus', 10, 0)`)).toMatch(/invalid_value/);
    const [audit] = await db.owner<{ n: number }[]>`select count(*)::int as n from audit_event where object_id = ${many} and action = 'idea_updated'`;
    expect(audit!.n).toBe(1);
  });

  it("lists outbox messages with a masked phone and no guest name, and counts them in the summary", async () => {
    const op = await operator();
    const { id: restaurantId } = await makeRestaurant(db.owner, fixtures, { name: "Outbox Diner", status: "active" });
    const guest = await makeGuest(db.owner, fixtures);
    const membershipId = await makeMembership(db.owner, restaurantId, guest.id);
    const [camp] = await db.owner<{ id: string }[]>`
      insert into campaign (restaurant_id, name, message_body, channel, audience, code, status,
                            est_recipients, est_segments, est_cost_cents, created_by)
      values (${restaurantId}, 'Outbox test', 'Hi', 'sms', ${db.owner.json({ type: "everyone" })},
              ${token().slice(0, 8).toUpperCase()}, 'sent', 1, 1, 30, 'test') returning id`;
    const summary = () =>
      persist(async (tx) => {
        const [r] = await tx`select operator_outbox_summary(${op}) as r`;
        return r!["r"] as Record<string, number>;
      });
    const before = await summary();
    await db.owner`
      insert into message (campaign_id, restaurant_id, membership_id, channel, status, segments, cost_cents, error_code)
      values (${camp!.id}, ${restaurantId}, ${membershipId}, 'sms', 'failed', 1, 30, 'invalid_number')`;
    const after = await summary();
    expect(after["failed"]).toBe((before["failed"] ?? 0) + 1);

    const rows = await persist(async (tx) => {
      const [r] = await tx`select operator_list_outbox(${op}, 'failed', 200, 0) as r`;
      return r!["r"] as Row[];
    });
    const mine = rows.find((row) => row["campaign_name"] === "Outbox test")!;
    expect(mine).toMatchObject({ restaurant_name: "Outbox Diner", status: "failed", error_code: "invalid_number", channel: "sms" });
    expect(String(mine["phone_masked"])).toMatch(/^\+27\*\*\*\d{3}$/);
    const text = JSON.stringify(rows);
    expect(text).not.toContain("Test guest");
    expect(text).not.toMatch(/\+2782\d{7}/);
    expect(await outcome({ operator: true }, (tx) => tx`select operator_list_outbox(${op}, 'bogus', 10, 0)`)).toMatch(/invalid_value/);
    const none = await persist(async (tx) => {
      const [r] = await tx`select operator_list_outbox(${op}, 'delivered', 200, 0) as r`;
      return (r!["r"] as Row[]).map((row) => row["campaign_name"]);
    });
    expect(none).not.toContain("Outbox test");
  });
});
