export function VerificationStep({ onVerified }: { phone: string; onVerified: () => void }) {
  return (
    <section className="guest-step">
      <span className="eyebrow">A quick check</span>
      <h2>Almost done.</h2>
      <p>Quick check. In the full app we text you a code. Not needed for this demo.</p>
      <button className="builder-primary" onClick={onVerified}>
        Continue
      </button>
    </section>
  );
}
