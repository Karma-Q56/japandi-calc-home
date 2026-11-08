import type { GuestSpecial } from "@/server/live-specials";

/**
 * Specials a guest can use at the till, shown on their card. The code is the one to
 * show at the till. Targeted specials show only this guest's own code.
 */
export function GuestSpecials({ specials }: { specials: GuestSpecial[] }) {
  if (specials.length === 0) return null;
  return (
    <section className="gx-panel" aria-labelledby="guest-specials-heading">
      <div className="guest-section-heading">
        <h2 id="guest-specials-heading">Specials</h2>
        <span>{specials.length}</span>
      </div>
      {specials.map((special) => (
        <article className="visit-row" key={special.id}>
          <span>
            <strong>{special.title}</strong>
            <br />
            <small>
              {special.reward}
              {special.code ? ` · Show code ${special.code} at the till` : ""}
            </small>
          </span>
        </article>
      ))}
    </section>
  );
}
