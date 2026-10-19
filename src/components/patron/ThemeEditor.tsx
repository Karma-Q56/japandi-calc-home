import { useState } from "react";
import { createSeed } from "@/data/seed";
import type { Theme } from "@/data/types";
import { ThemeProvider, themeHasAccessibleContrast } from "@/theme";
import cafePhoto from "@/assets/cafe-hero.jpg";
import { LoyaltyCard } from "./LoyaltyCard";
import { StampGlyph } from "./StampIcon";

const presets = createSeed().restaurants.map((restaurant) => ({
  name: restaurant.name,
  theme: restaurant.theme,
}));

const blankTheme: Theme = {
  ink: "#26332a",
  paper: "#faf7ef",
  accent: "#b6633f",
  accentSoft: "#ecd6c8",
  stampFilled: "#b6633f",
  stampEmpty: "#ddd7ca",
  headingFont: "Bricolage Grotesque",
  bodyFont: "DM Sans",
  radius: 16,
  stampShape: "circle",
  cardBackground: "flat",
  tagline: "A little perk, made for you",
};

const SHAPES: { id: Theme["stampShape"]; label: string }[] = [
  { id: "circle", label: "Tick" },
  { id: "square", label: "Square" },
  { id: "pixel-star", label: "Star" },
  { id: "coffee-cup", label: "Cup" },
  { id: "croissant", label: "Bake" },
];
const BACKGROUNDS: { id: Theme["cardBackground"]; label: string }[] = [
  { id: "flat", label: "Plain" },
  { id: "paper", label: "Paper dots" },
  { id: "gradient", label: "Soft glow" },
  { id: "photo", label: "Photo" },
];

export function ThemePreview({
  theme,
  name,
  view,
}: {
  theme: Theme;
  name: string;
  view: "card" | "page";
}) {
  return (
    <ThemeProvider theme={theme}>
      <div className="te-phone">
        <div className="te-screen">
          {view === "card" ? (
            <div className="te-card-screen">
              <LoyaltyCard
                key={theme.stampShape + theme.cardBackground}
                theme={theme}
                name={name}
                memberName="Thandi"
                filled={5}
                total={8}
                footnote="3 more for a free coffee"
              />
            </div>
          ) : (
            <>
              <section
                className="vp-hero"
                style={{ ["--vp-photo" as string]: `url(${theme.logo ? theme.logo : cafePhoto})` }}
              >
                <p>Johannesburg</p>
                <h2>{name}</h2>
                <p>{theme.tagline}</p>
                <button type="button" className="vp-pill">
                  Join our card
                </button>
              </section>
              <section className="vp-block">
                <h3>Opening hours</h3>
                <div className="vp-row">
                  <span>Mon to Fri</span>
                  <b>07:00 to 16:00</b>
                </div>
                <div className="vp-row">
                  <span>Saturday</span>
                  <b>08:00 to 15:00</b>
                </div>
              </section>
              <section className="vp-block vp-soft">
                <h3>This week</h3>
                <p>Tuesday treat: a free pastry with any coffee.</p>
              </section>
            </>
          )}
        </div>
      </div>
    </ThemeProvider>
  );
}

export function ThemeEditor({
  theme,
  onChange,
  name = "Your restaurant",
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
  name?: string;
}) {
  const [view, setView] = useState<"card" | "page">("card");
  const set = <K extends keyof Theme>(key: K, value: Theme[K]) => onChange({ ...theme, [key]: value });
  const color = (label: string, key: keyof Theme) => (
    <label className="builder-field theme-color-field">
      {label}
      <input
        type="color"
        value={theme[key] as string}
        onChange={(event) => set(key, event.target.value as never)}
      />
    </label>
  );
  const uploadLogo = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 300 * 1024) {
      window.alert("Choose an image under 300 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") set("logo", reader.result);
    };
    reader.readAsDataURL(file);
  };
  const removeLogo = () => {
    const { logo: _logo, ...rest } = theme;
    onChange(rest);
  };

  return (
    <div className="te">
      <div className="te-controls">
        <section className="te-group">
          <h3>Start from a look</h3>
          <div className="te-presets">
            {presets.map((preset) => (
              <button key={preset.name} type="button" onClick={() => onChange({ ...preset.theme })}>
                <i style={{ background: preset.theme.accent }} />
                {preset.name}
              </button>
            ))}
            <button type="button" onClick={() => onChange({ ...blankTheme })}>
              <i style={{ background: blankTheme.accent }} />
              Blank
            </button>
          </div>
        </section>

        <section className="te-group">
          <h3>Colours</h3>
          <div className="te-swatches">
            {color("Text", "ink")}
            {color("Background", "paper")}
            {color("Accent", "accent")}
            {color("Soft accent", "accentSoft")}
            {color("Stamp", "stampFilled")}
            {color("Empty stamp", "stampEmpty")}
          </div>
          {!themeHasAccessibleContrast(theme) && (
            <p className="theme-warning" role="alert">
              Text and background are too close to read comfortably. Make the text darker or the
              background lighter.
            </p>
          )}
        </section>

        <section className="te-group">
          <h3>Stamp</h3>
          <div className="te-shapes">
            {SHAPES.map((shape) => (
              <button
                key={shape.id}
                type="button"
                aria-pressed={theme.stampShape === shape.id}
                onClick={() => set("stampShape", shape.id)}
              >
                <StampGlyph shape={shape.id} size={24} />
                {shape.label}
              </button>
            ))}
          </div>
        </section>

        <section className="te-group">
          <h3>Card</h3>
          <div className="te-presets">
            {BACKGROUNDS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={theme.cardBackground === item.id}
                style={
                  theme.cardBackground === item.id
                    ? { borderColor: "var(--primary)", color: "var(--primary)" }
                    : undefined
                }
                onClick={() => set("cardBackground", item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="builder-field">
            Corner roundness · {theme.radius}px
            <input
              type="range"
              min="0"
              max="32"
              value={theme.radius}
              onChange={(event) => set("radius", Number(event.target.value))}
            />
          </label>
        </section>

        <section className="te-group">
          <h3>Words and type</h3>
          <label className="builder-field">
            Tagline
            <input
              value={theme.tagline}
              maxLength={70}
              onChange={(event) => set("tagline", event.target.value)}
            />
          </label>
          <label className="builder-field">
            Heading font
            <select value={theme.headingFont} onChange={(event) => set("headingFont", event.target.value)}>
              <option>Bricolage Grotesque</option>
              <option>DM Sans</option>
              <option>Georgia</option>
            </select>
          </label>
          <label className="builder-field">
            Body font
            <select value={theme.bodyFont} onChange={(event) => set("bodyFont", event.target.value)}>
              <option>DM Sans</option>
              <option>Bricolage Grotesque</option>
              <option>Arial</option>
            </select>
          </label>
          <label className="builder-field">
            Logo · optional · up to 300 KB
            <input type="file" accept="image/*" onChange={(event) => uploadLogo(event.target.files?.[0])} />
            {theme.logo && (
              <button type="button" className="builder-secondary" onClick={removeLogo}>
                Remove logo
              </button>
            )}
          </label>
        </section>
      </div>

      <aside className="te-preview" aria-label="Live preview">
        <div className="te-tabs" role="group" aria-label="Preview">
          <button type="button" aria-pressed={view === "card"} onClick={() => setView("card")}>
            Guest card
          </button>
          <button type="button" aria-pressed={view === "page"} onClick={() => setView("page")}>
            Public page
          </button>
        </div>
        <ThemePreview theme={theme} name={name} view={view} />
      </aside>
    </div>
  );
}
