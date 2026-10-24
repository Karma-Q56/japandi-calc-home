export function VerificationStep({ phone, onVerified }: { phone: string; onVerified: () => void }) {
  return <section className="guest-step"><span className="eyebrow">A quick check</span><h2>All set for this demo.</h2><p>We’d verify {phone} by SMS in the full product. Verification is intentionally skipped in this preview.</p><p className="demo-data-note">M9 seam: replace this component with the phone-verification provider.</p><button className="builder-primary" onClick={onVerified}>Continue</button></section>;
}
