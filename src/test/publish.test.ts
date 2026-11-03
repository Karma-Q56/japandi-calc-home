import { describe, expect, it } from "vitest";
import {
  canPublish,
  goTo,
  markEdited,
  primaryLabel,
  publish,
  startFlow,
  startPublished,
  type PublishFlow,
} from "@/domain/publish";

describe("draft, preview and publish", () => {
  it("starts as a draft that is not live and cannot publish straight away", () => {
    const flow = startFlow();
    expect(flow.step).toBe("draft");
    expect(flow.live).toBe("draft");
    expect(flow.changed).toBe(false);
    expect(canPublish(flow)).toBe(false);
    expect(primaryLabel(flow)).toBe("Preview");
  });

  it("a draft cannot jump straight to publish without a preview", () => {
    const jumped = goTo(startFlow(), "publish");
    expect(jumped.step).toBe("draft");
    expect(jumped.live).toBe("draft");
  });

  it("previewing still changes nothing for guests", () => {
    const previewing = goTo(startFlow(), "preview");
    expect(previewing.step).toBe("preview");
    expect(previewing.live).toBe("draft");
    expect(canPublish(previewing)).toBe(true);
    expect(primaryLabel(previewing)).toBe("Publish");
  });

  it("publishing makes it live and clears the changed flag", () => {
    const live = publish(goTo(startFlow(), "preview"));
    expect(live.live).toBe("published");
    expect(live.changed).toBe(false);
    expect(live.step).toBe("publish");
    expect(canPublish(live)).toBe(true);
  });

  it("editing a published item asks for a preview of the changes", () => {
    const edited = markEdited(startPublished());
    expect(edited.changed).toBe(true);
    expect(edited.live).toBe("published");
    expect(primaryLabel(edited)).toBe("Preview changes");
  });

  it("editing a draft never looks like a published change", () => {
    const edited = markEdited(startFlow());
    expect(edited.changed).toBe(false);
  });

  it("publishing the changed version clears the change and stays live", () => {
    const edited = markEdited(startPublished());
    const previewing = goTo(edited, "preview");
    const live = publish(previewing);
    expect(live.live).toBe("published");
    expect(live.changed).toBe(false);
    expect(canPublish(live)).toBe(true);
  });

  it("keeps the flow immutable", () => {
    const flow: PublishFlow = startFlow();
    const next = goTo(flow, "preview");
    expect(flow.step).toBe("draft");
    expect(next).not.toBe(flow);
  });
});
