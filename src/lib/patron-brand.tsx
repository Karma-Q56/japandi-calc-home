import { APP_NAME } from "@/config/app";

export function PatronBrand({ href = "/", className = "wordmark" }: { href?: string; className?: string }) {
  return (
    <a className={className} href={href} aria-label={`${APP_NAME} home`}>
      <svg className="pixel-stamp brand-stamp" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5 2h14v3h3v14h-3v3H5v-3H2V5h3V2zm2 3v2H5v10h2v2h10v-2h2V7h-2V5H7zm2 6h2v3h2v-3h2V9h2v5h-2v2h-4v-2H9v-3z" />
      </svg>
      <span>{APP_NAME}<span className="wordmark-dot">.</span></span>
    </a>
  );
}
