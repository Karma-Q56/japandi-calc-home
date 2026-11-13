import { useState } from "react";
import { createSeed } from "@/data/seed";
import type { PageTemplate, Theme } from "@/data/types";
import { LOGO_STAMP_GRIDS, buildLogoStamp, validateLogoFile } from "@/lib/logo-stamp";
import { CARD_PALETTES, cardTextIsReadable } from "@/lib/card-palettes";
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
  { id: "heart", label: "Heart" },
  { id: "leaf", label: "Leaf" },
  { id: "moon", label: "Moon" },
  { id: "sun", label: "Sun" },
  { id: "bean", label: "Bean" },
  { id: "flame", label: "Flame" },
  { id: "diamond", label: "Diamond" },
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
                className={`vp-hero${theme.coverPhoto ? " has-uploaded-photo" : ""}`}
                style={theme.coverPhoto
                  ? { ["--vp-photo" as string]: `url(${theme.coverPhoto})` }
                  : { ["--vp-hero-accent" as string]: theme.accent, ["--vp-hero-paper" as string]: theme.paper }}
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
  template,
  onTemplateChange,
  live = false,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
  name?: string;
  template?: PageTemplate;
  onTemplateChange?: (template: PageTemplate) => void;
  /** A real restaurant: no sample looks, photo background, cover photo or old logo upload, and only the card preview. */
  live?: boolean;
}) {
  const [view, setView] = useState<"card" | "page">("card");
  const [grid, setGrid] = useState<number>(theme.logoStamp?.grid ?? LOGO_STAMP_GRIDS[0]);
  const [stampBusy, setStampBusy] = useState(false);
  const [stampError, setStampError] = useState("");
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [coverError, setCoverError] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  const [colourRefusal, setColourRefusal] = useState("");
  const set = <K extends keyof Theme>(key: K, value: Theme[K]) => onChange({ ...theme, [key]: value });
  const color = (label: string, key: keyof Theme) => (
    <label className="builder-field theme-color-field">
      {label}
      <input
        type="color"
        value={theme[key] as string}
        onChange={(event) => {
          const next = event.target.value;
          // Keep the pick so the owner sees it, but flag an unreadable pair.
          // The Design page refuses to preview or publish while it is unreadable.
          const ink = key === "ink" ? next : theme.ink;
          const paper = key === "paper" ? next : theme.paper;
          setColourRefusal(
            (key === "ink" || key === "paper") && !cardTextIsReadable(ink, paper)
              ? "Text and background are too close to read comfortably. Darken the text or lighten the background."
              : "",
          );
          set(key, next as never);
        }}
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
    const { logo: _logo, logoStamp: _logoStamp, ...rest } = theme;
    onChange(rest);
  };

  const uploadCover = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setCoverError("Choose a JPG, PNG or WebP image no larger than 2 MB.");
      return;
    }
    setCoverError("");
    setCoverBusy(true);
    try {
      const image = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image processing is not available in this browser.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not resize this image.")), "image/webp", 0.82),
      );
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") set("coverPhoto", reader.result);
        setCoverBusy(false);
      };
      reader.onerror = () => {
        setCoverError("Could not read this image.");
        setCoverBusy(false);
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : "Could not process this image.");
      setCoverBusy(false);
    }
  };

  const removeCover = () => {
    const { coverPhoto: _coverPhoto, ...rest } = theme;
    onChange(rest);
  };

  const makeStampArt = async (file: File | null, nextGrid = grid) => {
    if (!file) return;
    const invalid = validateLogoFile(file);
    if (invalid) {
      setStampError(invalid);
      return;
    }
    setStampBusy(true);
    setStampError("");
    try {
      const logoStamp = await buildLogoStamp({
        file,
        grid: nextGrid,
        palette: {
          ink: theme.ink,
          accent: theme.accent,
          paper: theme.paper,
          stampEmpty: theme.stampEmpty,
        },
      });
      setPendingLogo(file);
      onChange({ ...theme, logoStamp });
    } catch (error) {
      setStampError(error instanceof Error ? error.message : "Could not process that logo.");
    } finally {
      setStampBusy(false);
    }
  };

  return (
    <div className="te">
      <div className="te-controls">
        {!live && (
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
        )}

        <section className="te-group">
          <h3>Colours</h3>
          <div className="te-presets">
            {CARD_PALETTES.map((palette) => (
              <button
                key={palette.id}
                type="button"
                onClick={() =>
                  onChange({ ...theme, ink: palette.ink, paper: palette.paper, accent: palette.accent })
                }
              >
                <i style={{ background: palette.accent }} />
                {palette.name}
              </button>
            ))}
          </div>
          <div className="te-swatches">
            {color("Text", "ink")}
            {color("Background", "paper")}
            {color("Accent", "accent")}
            {color("Soft accent", "accentSoft")}
            {color("Stamp", "stampFilled")}
            {color("Empty stamp", "stampEmpty")}
          </div>
          {colourRefusal && (
            <p className="theme-warning" role="alert">
              {colourRefusal}
            </p>
          )}
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
            {BACKGROUNDS.filter((item) => !live || item.id !== "photo").map((item) => (
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
          <h3>Logo stamp</h3>
          <p className="te-help">
            Upload your logo and we pixelate it into the stamp grid, in your palette. It appears
            on every card and on your public page.
          </p>
          <label className="builder-field">
            Logo file · PNG, JPG or SVG · up to 300 KB
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file) void makeStampArt(file);
              }}
            />
          </label>
          <label className="builder-field">
            Grid size
            <select
              value={grid}
              onChange={(event) => {
                const next = Number(event.target.value);
                setGrid(next);
                if (pendingLogo) void makeStampArt(pendingLogo, next);
              }}
            >
              {LOGO_STAMP_GRIDS.map((size) => (
                <option key={size} value={size}>
                  {size} × {size}
                </option>
              ))}
            </select>
          </label>
          {stampBusy && <p className="te-help">Pixelating…</p>}
          {stampError && (
            <p className="theme-warning" role="alert">
              {stampError}
            </p>
          )}
          {theme.logoStamp && (
            <div className="logo-stamp-preview">
              <figure>
                <img src={theme.logoStamp.filled} alt="Filled stamp art" width={64} height={64} />
                <figcaption>Filled</figcaption>
              </figure>
              <figure>
                <img src={theme.logoStamp.empty} alt="Empty stamp art" width={64} height={64} />
                <figcaption>Empty</figcaption>
              </figure>
              <button
                type="button"
                className="builder-secondary"
                onClick={() => {
                  const { logoStamp: _stamp, ...rest } = theme;
                  setPendingLogo(null);
                  onChange(rest);
                }}
              >
                Remove stamp art
              </button>
            </div>
          )}
        </section>

        {onTemplateChange && (
          <section className="te-group">
            <h3>Public page template</h3>
            <div className="te-presets">
              {([
                ["classic", "Classic"],
                ["hero", "Hero"],
                ["menu-first", "Menu first"],
                ["minimal", "Minimal"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={template === id}
                  style={
                    template === id
                      ? { borderColor: "var(--primary)", color: "var(--primary)" }
                      : undefined
                  }
                  onClick={() => onTemplateChange(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        )}

        {!live && (
        <section className="te-group">
          <h3>Public hero photo</h3>
          <p className="te-help">Your own venue photo only. Without one, the page uses a calm pattern in your palette.</p>
          <label className="builder-field">
            Cover photo · JPG, PNG or WebP · up to 2 MB
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadCover(event.target.files?.[0])} />
          </label>
          {coverBusy && <p className="te-help">Resizing photo…</p>}
          {coverError && <p className="theme-warning" role="alert">{coverError}</p>}
          {theme.coverPhoto && <button type="button" className="builder-secondary" onClick={removeCover}>Remove cover photo</button>}
        </section>
        )}

        <section className="te-group">
          <h3>Words and type</h3>
          {!live && (
          <label className="builder-field">
            Tagline
            <input
              value={theme.tagline}
              maxLength={70}
              onChange={(event) => set("tagline", event.target.value)}
            />
          </label>
          )}
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
          {!live && (
          <label className="builder-field">
            Stamp logo · optional · up to 300 KB
            <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(event) => uploadLogo(event.target.files?.[0])} />
            {theme.logo && (
              <button type="button" className="builder-secondary" onClick={removeLogo}>
                Remove logo
              </button>
            )}
          </label>
          )}
        </section>
      </div>

      <aside className="te-preview" aria-label="Live preview">
        {!live && (
        <div className="te-tabs" role="group" aria-label="Preview">
          <button type="button" aria-pressed={view === "card"} onClick={() => setView("card")}>
            Guest card
          </button>
          <button type="button" aria-pressed={view === "page"} onClick={() => setView("page")}>
            Public page
          </button>
        </div>
        )}
        <ThemePreview theme={theme} name={name} view={live ? "card" : view} />
      </aside>
    </div>
  );
}
