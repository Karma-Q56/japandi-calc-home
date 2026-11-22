import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0037_operator_inbox_dev.sql", "utf8");

describe("0037 operator inbox", () => {
  it("makes the read and write functions security definer with a fixed search path", () => {
    expect(sql.match(/^security definer\nset search_path = public, pg_temp/gim)?.length).toBe(10);
  });

  it("revokes every new function from public and grants them to the app role only", () => {
    for (const name of [
      "operator_list_pending_campaigns",
      "operator_list_leads",
      "operator_update_lead",
      "operator_list_feedback",
      "operator_feedback_screenshot",
      "operator_set_feedback",
      "operator_list_ideas",
      "operator_set_idea",
      "operator_list_outbox",
      "operator_outbox_summary",
    ]) {
      expect(sql).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public`, "i"));
      expect(sql).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to app_user`, "i"));
    }
  });

  it("takes the caller from the operator table and never from a browser value", () => {
    expect(sql).toMatch(/not_operator/);
  });

  it("gives feedback a reference with a unique index, backfilled from a sequence", () => {
    expect(sql).toMatch(/feedback_reference_seq/i);
    expect(sql).toMatch(/create unique index/i);
  });

  it("never returns a guest name or full phone number from the outbox read", () => {
    expect(sql).toMatch(/left\(cu\.phone_e164, 3\) \|\| '\*\*\*' \|\| right\(cu\.phone_e164, 3\) as phone_masked/);
  });

  it("never returns a feedback screenshot from the list read", () => {
    const listBody = sql.slice(
      sql.search(/function operator_list_feedback/i),
      sql.search(/function operator_feedback_screenshot/i),
    );
    expect(listBody).not.toMatch(/screenshot_data/i);
  });

  it("returns the feedback contact only when the sender allowed it", () => {
    expect(sql).toMatch(/contact_ok/);
  });
});
