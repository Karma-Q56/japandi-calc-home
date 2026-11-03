import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhoneFrame, PreviewOnly, PublishSteps, PushPreview, SmsPreview } from "@/components/patron/preview";

describe("guest preview surfaces", () => {
  it("shows the SMS a guest reads with its length, message count and cost", () => {
    render(
      <SmsPreview
        sender="The Daily Grind"
        body="Hi {first_name}, your flat white is waiting."
        sampleName="Naledi"
        recipients={10}
      />,
    );
    expect(screen.getByText(/Hi Naledi, your flat white is waiting\./)).toBeInTheDocument();
    expect(screen.getByText(/10 guests/)).toBeInTheDocument();
    expect(screen.getByText(/\d+ letters/)).toBeInTheDocument();
    expect(screen.getByText(/1 message/)).toBeInTheDocument();
    expect(screen.getByText(/R3\.50/)).toBeInTheDocument();
  });

  it("adds a segment when the message crosses the single message limit", () => {
    render(
      <SmsPreview
        sender="The Daily Grind"
        body={"a".repeat(200)}
        sampleName="Naledi"
        recipients={1}
      />,
    );
    expect(screen.getByText(/2 messages/)).toBeInTheDocument();
    expect(screen.getByText(/1 guest/)).toBeInTheDocument();
  });

  it("shows the push notification and that it is free", () => {
    render(
      <PushPreview sender="The Daily Grind" title="A treat" body="Come back this week." recipients={4} />,
    );
    expect(screen.getByText("A treat")).toBeInTheDocument();
    expect(screen.getByText(/Free/)).toBeInTheDocument();
    expect(screen.getByText(/4 guests have notifications on/)).toBeInTheDocument();
  });

  it("says preview only on every preview", () => {
    render(<PreviewOnly />);
    expect(screen.getByRole("status")).toHaveTextContent("Preview only, nothing was sent.");
  });

  it("marks the current publish step", () => {
    render(<PublishSteps step={2} labels={["Draft", "Preview", "Publish"]} />);
    expect(screen.getByRole("list", { name: "Step 2 of 3" })).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });

  it("wraps a preview in a labelled phone frame", () => {
    render(
      <PhoneFrame label="Your loyalty card">
        <p>Five stamps</p>
      </PhoneFrame>,
    );
    expect(screen.getByRole("group", { name: "Your loyalty card" })).toBeInTheDocument();
    expect(screen.getByText("Five stamps")).toBeInTheDocument();
  });
});
