import { PAGE_DAYS, fullWeek } from "@/lib/live-page";

/**
 * The top of a live public page: logo, name, line under the name, story, address and opening hours.
 * The public page and the "Your page" preview both use it, so the owner sees what guests see.
 */
export function PageIdentity({
  name,
  suburb,
  tagline,
  about,
  address,
  hours,
  logoUrl,
}: {
  name: string;
  suburb: string | null;
  tagline: string;
  about: string;
  address: string;
  hours: Record<string, unknown> | null | undefined;
  logoUrl: string | null;
}) {
  const week = fullWeek(hours);
  return (
    <>
      <section className="guest-section page-identity" aria-label="About this restaurant">
        {logoUrl && <img className="page-identity-logo" src={logoUrl} alt={`${name} logo`} width={72} height={72} />}
        <h1>{name}</h1>
        {tagline && <p className="page-identity-tagline">{tagline}</p>}
        {about && <p>{about}</p>}
        {(suburb || address) && (
          <p className="page-identity-where">{[address, suburb].filter(Boolean).join(", ")}</p>
        )}
      </section>
      <section className="guest-section" aria-label="Opening hours">
        <h2>Hours</h2>
        <ul>
          {PAGE_DAYS.map((day) => {
            const span = week[day];
            return (
              <li key={day}>
                {day}: {span ? `${span.open} to ${span.close}` : "Closed"}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
