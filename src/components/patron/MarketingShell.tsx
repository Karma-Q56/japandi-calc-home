import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Heart, Menu, X } from "lucide-react";
import { brand } from "@/lib/patron";
import { APP_NAME } from "@/config/app";

export function MarketingShell({
  children,
  current,
}: {
  children: ReactNode;
  current: "diners" | "login";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);
  return (
    <>
      <header className="site-header">
        <div className="page-width header-inner">
          <a className="wordmark" href="/" aria-label={`${brand.name} home`}>
            <span>
              {APP_NAME}
              <span className="wordmark-dot">.</span>
            </span>
          </a>
          <nav className="nav-links" aria-label="Main navigation">
            <a href="/#how-it-works">For restaurants</a>
            <a href="/for-diners" aria-current={current === "diners" ? "page" : undefined}>
              For diners
            </a>
            <a href="/#pricing">Pricing</a>
          </nav>
          <Button variant="patron" className="header-book" asChild>
            <a href="/login">
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
            <a href="/#how-it-works" onClick={close}>
              For restaurants
            </a>
            <a href="/for-diners" onClick={close} aria-current={current === "diners" ? "page" : undefined}>
              For diners
            </a>
            <a href="/#pricing" onClick={close}>
              Pricing
            </a>
            <a href="/login" onClick={close} aria-current={current === "login" ? "page" : undefined}>
              Log in
            </a>
          </nav>
        )}
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div className="page-width">
          <div className="footer-top">
            <div>
              <a className="wordmark" href="/">
                <span>
                  {APP_NAME}
                  <span className="wordmark-dot">.</span>
                </span>
              </a>
              <p>A little loyalty goes a long way.</p>
            </div>
            <nav className="footer-links" aria-label="Footer navigation">
              <a href="/for-diners">For diners</a>
              <a href="/login">Log in</a>
              <a href="/#pricing">Pricing</a>
              <a href="/demo/status">Demo status</a>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
            </nav>
          </div>
          <div className="footer-bottom">
            <span>© 2026 {APP_NAME}. For the places that make a neighbourhood.</span>
            <span>
              Made with a little <Heart /> in South Africa.
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
