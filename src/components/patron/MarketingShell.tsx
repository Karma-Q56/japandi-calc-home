import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Heart, Menu, X } from "lucide-react";
import { PatronBrand } from "@/lib/patron-brand";
import { APP_NAME } from "@/config/app";
import { HelpBubble } from "@/components/patron/HelpBubble";
import { BackLink } from "@/components/patron/BackLink";

/** Business pages. How it works and Case studies are tabs on the business page, not nav items. */
const businessLinks: Array<{ href: string; label: string }> = [
  { href: "/for-business", label: "Overview" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/case-studies", label: "Case studies" },
  { href: "/faq", label: "FAQ" },
];

const businessPaths = ["/for-business", "/how-it-works", "/case-studies", "/faq", "/pricing", "/contact"];

function useCurrentPath() {
  return useRouterState({
    select: (state) => state.location.pathname.replace(/\/+$/, "") || "/",
  });
}

/** The one marketing header. Every marketing page renders this, and only this. */
export function SiteHeader() {
  const path = useCurrentPath();
  const [menuOpen, setMenuOpen] = useState(false);

  const onBusiness = businessPaths.includes(path);
  const onDiners = path === "/for-diners";
  const onLogin = path === "/login";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const closeNav = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <div className="page-width header-inner">
        <PatronBrand />
        <nav className="nav-links" aria-label="Main navigation">
          <a href="/for-diners" aria-current={onDiners ? "page" : undefined}>
            For diners
          </a>
          <a href="/for-business" aria-current={onBusiness ? "page" : undefined}>
            For businesses
          </a>
          <a href="/pricing" aria-current={path === "/pricing" ? "page" : undefined}>
            Pricing
          </a>
          <a href="/find" aria-current={path === "/find" ? "page" : undefined}>
            Find a restaurant
          </a>
          <a href="/login" aria-current={onLogin ? "page" : undefined}>
            Log in
          </a>
        </nav>
        <Button variant="patron" className="header-book" asChild>
          <a href="/contact" aria-current={path === "/contact" ? "page" : undefined}>
            Talk to us <ArrowUpRight />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="mobile-menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X /> : <Menu />}
        </Button>
      </div>
      {menuOpen && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <a href="/for-diners" onClick={closeNav} aria-current={onDiners ? "page" : undefined}>
            For diners
          </a>
          <a href="/for-business" onClick={closeNav} aria-current={onBusiness ? "page" : undefined}>
            For businesses
          </a>
          <a href="/pricing" onClick={closeNav} aria-current={path === "/pricing" ? "page" : undefined}>
            Pricing
          </a>
          <a href="/find" onClick={closeNav} aria-current={path === "/find" ? "page" : undefined}>
            Find a restaurant
          </a>
          <a href="/login" onClick={closeNav} aria-current={onLogin ? "page" : undefined}>
            Log in
          </a>
          <Button variant="patron" asChild>
            <a href="/contact" onClick={closeNav}>
              Talk to us <ArrowUpRight />
            </a>
          </Button>
        </nav>
      )}
    </header>
  );
}

/** The one marketing footer, with the same links as the header. */
export function SiteFooter() {
  const path = useCurrentPath();
  return (
    <footer className="site-footer">
      <div className="page-width">
        <div className="footer-top">
          <div className="footer-brand">
            <PatronBrand />
            <p>A little loyalty goes a long way.</p>
          </div>
          <div className="footer-columns">
            <nav aria-label="Footer: for diners">
              <h2>For diners</h2>
              <a href="/for-diners" aria-current={path === "/for-diners" ? "page" : undefined}>
                What you get
              </a>
              <a href="/find" aria-current={path === "/find" ? "page" : undefined}>
                Find a restaurant
              </a>
              <a href="/suggest" aria-current={path === "/suggest" ? "page" : undefined}>
                Ask for a place
              </a>
              <a href="/feedback" aria-current={path === "/feedback" ? "page" : undefined}>
                Send feedback
              </a>
              <a href="/login" aria-current={path === "/login" ? "page" : undefined}>
                Log in
              </a>
            </nav>
            <nav aria-label="Footer: for businesses">
              <h2>For businesses</h2>
              {businessLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={path === link.href ? "page" : undefined}
                >
                  {link.label}
                </a>
              ))}
              <a href="/blog" aria-current={path === "/blog" ? "page" : undefined}>
                Notes
              </a>
            </nav>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 {APP_NAME}. For the places that make a neighbourhood.</span>
          <span className="footer-legal">
            <a href="/privacy" aria-current={path === "/privacy" ? "page" : undefined}>
              Privacy
            </a>
            <a href="/terms" aria-current={path === "/terms" ? "page" : undefined}>
              Terms
            </a>
            <a href="/feedback" aria-current={path === "/feedback" ? "page" : undefined}>
              Send feedback
            </a>
            <a href="/find" aria-current={path === "/find" ? "page" : undefined}>
              Find a restaurant
            </a>
          </span>
          <span>
            Made with a little <Heart /> in South Africa.
          </span>
        </div>
      </div>
    </footer>
  );
}

/**
 * Marketing page frame: the shared header, the page body, and the shared footer.
 * `afterMain` renders between the two (the home page keeps its marquee there).
 */
export function MarketingShell({
  children,
  afterMain,
  back,
}: {
  children: ReactNode;
  afterMain?: ReactNode;
  back?: { to: string; label?: string };
}) {
  return (
    <>
      <SiteHeader />
      <main>
        {back && (
          <div className="marketing-back page-width">
            <BackLink to={back.to} {...(back.label ? { label: back.label } : {})} />
          </div>
        )}
        {children}
      </main>
      {afterMain}
      <SiteFooter />
      <HelpBubble />
    </>
  );
}
