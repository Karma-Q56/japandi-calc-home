export function VerificationStep({ onVerified }: { phone: string; onVerified: () => void }) {
  return (
    <section className="guest-step">
      <span className="eyebrow">A quick check</span>
      <h2>Almost done.</h2>
      <p>
        In the full app, we send a code by text to confirm your mobile number. This demo skips
        that step.
      </p>
      <button className="builder-primary" onClick={onVerified}>
        Continue
      </button>
    </section>
  );
}
