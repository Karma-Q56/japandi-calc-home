import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ChevronDown, Heart, Menu, X } from "lucide-react";
import { PatronBrand } from "@/lib/patron-brand";
import { APP_NAME } from "@/config/app";
import { HelpBubble } from "@/components/patron/HelpBubble";

const businessLinks: Array<{ href: string; label: string }> = [
  { href: "/for-business", label: "Overview" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/case-studies", label: "Case studies" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Book a visit" },
];

const businessPaths = businessLinks.map((link) => link.href);

function useCurrentPath() {
  return useRouterState({
    select: (state) => state.location.pathname.replace(/\/+$/, "") || "/",
  });
}

/** The one marketing header. Every marketing page renders this, and only this. */
export function SiteHeader() {
  const path = useCurrentPath();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const onBusiness = businessPaths.includes(path);
  const onDiners = path === "/for-diners";
  const onLogin = path === "/login";

  useEffect(() => {
    const closeDetails = () => {
      headerRef.current?.querySelectorAll("details[open]").forEach((item) => {
        item.removeAttribute("open");
      });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      closeDetails();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      headerRef.current?.querySelectorAll("details[open]").forEach((item) => {
        if (target && !item.contains(target)) item.removeAttribute("open");
      });
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  const closeNav = (event: React.MouseEvent<HTMLAnchorElement>) => {
    setMenuOpen(false);
    event.currentTarget.closest("details")?.removeAttribute("open");
  };

  return (
    <header className="site-header" ref={headerRef}>
      <div className="page-width header-inner">
        <PatronBrand />
        <nav className="nav-links" aria-label="Main navigation">
          <a href="/for-diners" aria-current={onDiners ? "page" : undefined}>
            For diners
          </a>
          <details className="nav-dropdown">
            <summary aria-current={onBusiness ? "page" : undefined}>
              For businesses <ChevronDown aria-hidden="true" size={14} />
            </summary>
            <div className="nav-dropdown-panel">
              {businessLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={closeNav}
                  aria-current={path === link.href ? "page" : undefined}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </details>
          <a href="/find" aria-current={path === "/find" ? "page" : undefined}>
            Find a restaurant
          </a>
        </nav>
        <Button variant="patron" className="header-book" asChild>
          <a href="/login" aria-current={onLogin ? "page" : undefined}>
            Log in <ArrowUpRight />
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
          <details className="mobile-accordion">
            <summary aria-current={onBusiness ? "page" : undefined}>
              For businesses <ChevronDown aria-hidden="true" size={16} />
            </summary>
            <div className="nav-dropdown-panel">
              {businessLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={closeNav}
                  aria-current={path === link.href ? "page" : undefined}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </details>
          <a href="/find" onClick={closeNav} aria-current={path === "/find" ? "page" : undefined}>
            Find a restaurant
          </a>
          <Button variant="patron" asChild>
            <a href="/login" onClick={closeNav}>
              Log in <ArrowUpRight />
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
            </nav>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 {APP_NAME}. For the places that make a neighbourhood.</span>
          <span className="footer-legal">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
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
}: {
  children: ReactNode;
  afterMain?: ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      {afterMain}
      <SiteFooter />
      <HelpBubble />
    </>
  );
}
