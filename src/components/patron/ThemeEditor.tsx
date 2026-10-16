import { createSeed } from '@/data/seed';
import type { Theme } from '@/data/types';
import { ThemeProvider, themeHasAccessibleContrast } from '@/theme';

const presets = createSeed().restaurants.map(restaurant => ({ name: restaurant.name, theme: restaurant.theme }));
const blankTheme: Theme = { ink:'#26332a',paper:'#faf7ef',accent:'#b6633f',accentSoft:'#ecd6c8',stampFilled:'#b6633f',stampEmpty:'#ddd7ca',headingFont:'Bricolage Grotesque',bodyFont:'DM Sans',radius:16,stampShape:'circle',cardBackground:'flat',tagline:'A little perk, made for you' };

export function ThemeEditor({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const color = (label: string, key: keyof Theme) => <label className="builder-field theme-color-field">{label}<input type="color" value={theme[key] as string} onChange={event=>onChange({...theme,[key]:event.target.value})}/></label>;
  const uploadLogo = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 300 * 1024) { window.alert('Choose an image under 300 KB.'); return; }
    const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === 'string') onChange({...theme,logo:reader.result}); }; reader.readAsDataURL(file);
  };
  const removeLogo = () => { const { logo: _logo, ...rest } = theme; onChange(rest); };
  return <div className="theme-editor"><div className="theme-controls">
    <label className="builder-field">Start with<select value="custom" onChange={event=>{const selected=presets[Number(event.target.value)]; if(selected)onChange({...selected.theme});else if(event.target.value==='blank')onChange({...blankTheme});}}><option value="custom">Current look</option><option value="blank">Start from blank</option>{presets.map((preset,i)=><option key={preset.name} value={i}>{preset.name} preset</option>)}</select></label>
    <div className="theme-color-grid">{color('Ink','ink')}{color('Paper','paper')}{color('Accent','accent')}{color('Soft accent','accentSoft')}{color('Filled stamp','stampFilled')}{color('Empty stamp','stampEmpty')}</div>
    <label className="builder-field">Heading font<select value={theme.headingFont} onChange={event=>onChange({...theme,headingFont:event.target.value})}><option>Bricolage Grotesque</option><option>DM Sans</option><option>Georgia</option></select></label>
    <label className="builder-field">Body font<select value={theme.bodyFont} onChange={event=>onChange({...theme,bodyFont:event.target.value})}><option>DM Sans</option><option>Bricolage Grotesque</option><option>Arial</option></select></label>
    <label className="builder-field">Stamp shape<select value={theme.stampShape} onChange={event=>onChange({...theme,stampShape:event.target.value as Theme['stampShape']})}>{['circle','square','pixel-star','coffee-cup','croissant'].map(shape=><option key={shape} value={shape}>{shape.replace('-',' ')}</option>)}</select></label>
    <label className="builder-field">Card background<select value={theme.cardBackground} onChange={event=>onChange({...theme,cardBackground:event.target.value as Theme['cardBackground']})}>{['flat','paper','gradient','photo'].map(background=><option key={background}>{background}</option>)}</select></label>
    <label className="builder-field">Corner radius<input type="range" min="0" max="32" value={theme.radius} onChange={event=>onChange({...theme,radius:Number(event.target.value)})}/><span>{theme.radius}px</span></label>
    <label className="builder-field">Tagline<input value={theme.tagline} maxLength={70} onChange={event=>onChange({...theme,tagline:event.target.value})}/></label>
    <label className="builder-field">Logo · optional · max 300 KB<input type="file" accept="image/*" onChange={event=>uploadLogo(event.target.files?.[0])}/>{theme.logo&&<button type="button" className="builder-secondary" onClick={removeLogo}>Remove logo</button>}</label>
    {!themeHasAccessibleContrast(theme)&&<p className="theme-warning" role="alert">Text contrast is below 4.5:1. Choose a darker ink or lighter paper colour.</p>}
  </div><ThemeProvider theme={theme}><div className="theme-previews"><article className="theme-preview-card">{theme.logo&&<img className="venue-logo-preview" src={theme.logo} alt="Restaurant logo preview"/>}<span className="theme-preview-label">Guest card</span><h3>Daily ritual card</h3><p>{theme.tagline}</p><div className="theme-preview-stamps">{Array.from({length:8},(_,i)=><span key={i} className={i<5?'filled':''}>{i<5?'✓':''}</span>)}</div><small>5 of 8 stamps</small></article><article className="theme-preview-page"><span className="theme-preview-label">Public page</span><p className="eyebrow">GOOD FOOD · FAMILIAR FACES</p><h3>Your place, your people.</h3><p>{theme.tagline}</p><button type="button">Join our card</button></article></div></ThemeProvider></div>;
}
