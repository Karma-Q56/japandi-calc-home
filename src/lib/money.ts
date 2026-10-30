/**
 * One money format for the whole app: R1,250 for whole rand, R12.50 when
 * cents matter. We format by hand because the browser and the server
 * disagree about the en-ZA thousands separator (space or comma), and a
 * page must not render two different prices during hydration.
 */
export function formatRand(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const rem = abs % 100;
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const text = rem > 0 ? `R${whole}.${rem.toString().padStart(2, "0")}` : `R${wholeText}`;
  return negative ? `-${text}` : text;
}
