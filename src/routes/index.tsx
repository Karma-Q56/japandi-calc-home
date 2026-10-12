import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { ArrowUpRight, ArrowRight, Check, Coffee, Heart, Smartphone, MessageSquare, Users, ChartNoAxesColumnIncreasing, QrCode, ScanLine, Plus, Menu, X, ShieldCheck, Info, MapPin, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { brand, commercial, estimateRegulars, plans, rand } from '@/lib/patron';
import cafeHero from '@/assets/cafe-hero.jpg';

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'Patron — Turn first-timers into regulars' },
    { name: 'description', content: 'A little loyalty goes a long way. Digital stamp cards, your own regulars list and thoughtful SMS specials for independent South African restaurants.' },
    { property: 'og:title', content: 'Patron — Turn first-timers into regulars' },
    { property: 'og:description', content: 'Fill your slow days. Keep your regulars coming back. Meet a simpler way to build restaurant loyalty in South Africa.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: HomePage,
});

function PixelStamp() {
  return <svg className="pixel-stamp" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 2h14v3h3v14h-3v3H5v-3H2V5h3V2zm2 3v2H5v10h2v2h10v-2h2V7h-2V5H7zm2 6h2v3h2v-3h2V9h2v5h-2v2h-4v-2H9v-3z" /></svg>;
}
function Wordmark() { return <a className="wordmark" href="#" aria-label="Patron home"><PixelStamp /><span>{brand.name}<span className="wordmark-dot">.</span></span></a>; }
function Eyebrow({ children }: { children: React.ReactNode }) { return <div className="eyebrow"><span className="eyebrow-line" />{children}</div>; }

function RegularsCalculator() {
  const [spend, setSpend] = useState(150);
  const [guests, setGuests] = useState(300);
  const [returning, setReturning] = useState(8);
  const estimate = estimateRegulars(spend, guests, returning);
  const controls = [
    { id: 'spend', label: 'Average spend per guest', value: spend, display: rand(spend), min: 50, max: 500, step: 10, setter: setSpend },
    { id: 'guests', label: 'Guests per week', value: guests, display: guests.toString(), min: 50, max: 2000, step: 50, setter: setGuests },
    { id: 'returning', label: 'Extra guests returning each week', value: returning, display: `${returning}%`, min: 0, max: 25, step: 1, setter: setReturning },
  ];
  return <section className="section calculator-section page-width" id="calculator">
    <Eyebrow>A few more familiar faces</Eyebrow>
    <h2 className="section-heading">What could <span className="editorial">regulars</span><br />be worth?</h2>
    <p className="section-description">A little more loyalty can make a real difference to your month.</p>
    <div className="calculator">
      {controls.map(control => <div className="calculator-control" key={control.id}>
        <div className="calculator-control-top"><label id={`${control.id}-label`}>[ {control.label} ]</label><output>{control.display}</output></div>
        <Slider aria-labelledby={`${control.id}-label`} min={control.min} max={control.max} step={control.step} value={[control.value]} onValueChange={values => { const value = values[0]; if (value !== undefined) control.setter(value); }} />
      </div>)}
      <div className="calculator-results" aria-live="polite" aria-atomic="true">
        <div className="calculator-result"><strong>{estimate.monthlyVisits}</strong><span>extra visits per month</span></div>
        <div className="calculator-result"><strong>{rand(estimate.monthlyRevenue)}</strong><span>extra revenue per month</span></div>
        <div className="calculator-result"><strong>{rand(estimate.annualRevenue)}</strong><span>extra revenue per year</span></div>
      </div>
    </div>
    <p className="estimate-note"><Info />An illustration, not a promise. Based on 4.33 weeks per month. Revenue is before costs, not profit.</p>
  </section>;
}

const faqs = [
  ['Do my customers need to download an app?', 'Nope. They scan your QR code and join with their phone number. Their stamp card opens right in their phone’s browser. No app, no password, no lost paper card.'],
  ['How do customers collect stamps?', 'After a qualifying purchase, your staff scan the customer’s card or enter their phone number to confirm a stamp. Customers cannot award themselves stamps. You choose the reward.'],
  ['Will you message everyone on my list?', 'Only customers who have agreed to receive offers from your restaurant. Every SMS identifies your restaurant and includes an opt-out. Their loyalty card still works if they choose not to receive marketing.'],
  ['Are SMS costs included in my plan?', 'SMS credits are prepaid and separate from your monthly plan, estimated at R0.35 per message. You see the cost before sending, so there are no surprise SMS bills.'],
  ['What does being a founding partner mean?', 'The first three restaurants receive a reduced setup fee and a discounted monthly price for three months. In return, we ask for honest feedback and, if you’re happy, an approved testimonial. Exact pilot pricing is agreed together.'],
];

function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const book = () => { setMenuOpen(false); setBookingOpen(true); };
  const nav = <><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a href="#what-you-get" onClick={() => setMenuOpen(false)}>What you get</a><a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a></>;
  return <>
    <header className="site-header"><div className="page-width header-inner"><Wordmark /><nav className="nav-links" aria-label="Main navigation">{nav}</nav><Button variant="patron" className="header-book" onClick={book}>Let’s chat <ArrowUpRight /></Button><Button variant="ghost" size="icon" className="mobile-menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</Button></div>{menuOpen && <nav className="mobile-nav" aria-label="Mobile navigation">{nav}<Button variant="patron" onClick={book}>Let’s chat <ArrowUpRight /></Button></nav>}</header>
    <main>
      <section className="hero">
        <img src={cafeHero} alt="A cappuccino, fresh croissant and digital loyalty card on a sunlit cafe table" width={1920} height={1024} className="hero-photo" fetchPriority="high" />
        <div className="page-width hero-inner"><Eyebrow>Good food. Familiar faces.</Eyebrow><h1>Turn first-timers<br />into <span className="editorial">regulars.</span></h1><p className="hero-description">A stamp card on their phone. Your own regulars list. A well-timed special that brings them back.</p><div className="hero-actions"><Button variant="patron" className="primary-cta" onClick={book}>Book a 15-minute visit <ArrowUpRight /></Button><a href="#how-it-works" className="text-link">See how it works <ArrowRight size={14} /></a></div><p className="hero-note"><MapPin />Made for independent spots. Starting in Joburg.</p></div>
      </section>
      <div className="benefits-strip"><div className="page-width benefits-inner">{[[Smartphone, 'No app to download'], [Heart, 'Your customers. Your list.'], [MessageSquare, 'SMS, not another inbox'], [Sprout, 'Local & hands-on']].map(([Icon, text], i) => { const BenefitIcon = Icon as typeof Smartphone; return <div className="benefit" key={i}><BenefitIcon /><span>{text as string}</span></div>; })}</div></div>
      <section className="section page-width" id="how-it-works">
        <div className="section-head-row"><div><Eyebrow>Less admin. More regulars.</Eyebrow><h2 className="section-heading">They came for the coffee.<br />Give them a reason to <span className="editorial">stay.</span></h2></div><p className="section-description">Paper cards get lost. Slow Tuesdays stay slow. Keeping in touch shouldn’t be another full-time job.</p></div>
        <div className="steps-grid">{[
          { icon: QrCode, title: 'Scan. Join. Sorted.', text: 'A QR code on your counter or table. A phone number. And just like that, they’re on your regulars list.' },
          { icon: ScanLine, title: 'A little stamp. A little love.', text: 'Your staff confirm a stamp after a purchase. Your customer collects them towards a reward worth coming back for.' },
          { icon: MessageSquare, title: 'Make Tuesday their day.', text: 'Haven’t seen someone in a while? Send a thoughtful SMS special and give them a reason to pop in.' },
        ].map((step, i) => <div className="step" key={step.title}><div className="step-top"><span className="step-number">0{i + 1}</span><step.icon /></div><h3>{step.title}</h3><p>{step.text}</p></div>)}</div>
      </section>
      <section className="section features-section" id="what-you-get"><div className="page-width">
        <div className="section-head-row"><div><Eyebrow>The good stuff, all together</Eyebrow><h2 className="section-heading">Small tools.<br /><span className="editorial">More reasons to return.</span></h2></div><p className="section-description">Everything you need to keep your customers close. Nothing you need a manual for.</p></div>
        <div className="bento-grid">
          <article className="bento bento-loyalty"><div className="bento-copy"><Smartphone className="bento-icon" /><h3>A stamp card.<br />Minus the paper.</h3><p>Your brand, your reward, on their phone. Always in their pocket. Never in the wash.</p></div><div className="loyalty-demo" aria-label="Example cafe loyalty card"><div className="demo-cafe">the daily grind.</div><div className="demo-subtitle">A little perk for your daily ritual</div><div className="demo-stamps">{Array.from({ length: 8 }, (_, i) => <span key={i} className={`demo-stamp ${i < 5 ? 'filled' : ''}`}>{i < 5 ? <Coffee /> : i === 7 ? <Heart /> : null}</span>)}</div><div className="demo-reward">Your 8th coffee is on us.</div><span className="demo-progress">5 of 8 stamps collected</span></div></article>
          <article className="bento bento-list"><Users className="bento-icon" /><h3>Your regulars.<br />Your list.</h3><p>Know who’s been in, who’s been away, and who might fancy a visit.</p><div className="list-demo">{[['TM', 'Thandi M.', 'Visited today'], ['JN', 'James N.', 'Away 30 days'], ['SP', 'Sipho P.', 'Visited yesterday']].map(([initials, name, visit]) => <div className="list-demo-row" key={name}><span className="demo-avatar">{initials}</span><span>{name}</span><span>{visit}</span></div>)}</div></article>
          <article className="bento bento-message"><MessageSquare className="bento-icon" /><h3>A special.<br />Not spam.</h3><p>Reach the right people with prepaid SMS offers they’ve opted into.</p><div className="sms-demo">Hey Thandi, we miss your face! Pop into The Daily Grind this Tuesday for a coffee on us with any breakfast. Just say TUESDAY.<span>The Daily Grind · Reply STOP to opt out</span></div></article>
          <article className="bento bento-results"><div className="bento-copy"><ChartNoAxesColumnIncreasing className="bento-icon" /><h3>Less guessing.<br />More “that worked”.</h3><p>See who joined, who came back, and which specials brought people through your door. Simple numbers that mean something.</p></div><div className="results-demo"><div className="demo-label">Tuesday breakfast special</div><strong>12 <span className="text-sm font-normal">came back</span></strong><div className="demo-bars"><i /><i /><i /><i /><i /><i /></div></div></article>
        </div><p className="demo-disclaimer">Example cards, customers and campaign — not real results.</p>
      </div></section>
      <RegularsCalculator />
      <section className="section pricing-section" id="pricing"><div className="page-width"><div className="center-heading"><Eyebrow>A plan for your kind of place</Eyebrow><h2 className="section-heading">Keep it simple.<br />Make it <span className="editorial">worth it.</span></h2><p className="section-description">Do it yourself, or let us lend a hand.<br />Month to month. No long contracts.</p></div>
        <div className="pricing-grid">{plans.map((plan, i) => <article className={`price-card ${i === 1 ? 'featured' : ''}`} key={plan.name}>{i === 1 && <span className="price-tag">An extra pair of hands</span>}<h3>{plan.name}</h3><p className="price-description">{plan.description}</p><div className="price-amount">{rand(plan.min)}–{rand(plan.max)}</div><span className="price-period">per month · proposed pricing</span><ul>{plan.features.map(feature => <li key={feature}><Check />{feature}</li>)}</ul><Button variant={i === 1 ? 'patron' : 'quiet'} className="price-cta" onClick={book}>Let’s talk {plan.name} <ArrowUpRight /></Button></article>)}</div>
        <div className="pricing-notes"><p>Once-off setup: {rand(commercial.setupMin)}–{rand(commercial.setupMax)}. Includes your page, QR cards, staff training & first campaign.</p><p>SMS credits sold separately, estimated at R0.35 per message. All prices are proposals for the pilot.</p></div>
      </div></section>
      <section className="founding-section" id="founding"><div className="page-width founding-inner"><div className="founding-copy"><Eyebrow>Built together, right here</Eyebrow><h2 className="section-heading">Your neighbourhood.<br />Our first <span className="editorial">three.</span></h2><p>We’re looking for {commercial.foundingSpots} founding restaurants in {brand.location}. Get hands-on setup, a reduced setup fee and a discounted monthly plan for your first {commercial.discountMonths} months. Help us shape something useful.</p></div><div className="founding-cta"><Button variant="patron" className="primary-cta" onClick={book}>Be a founding partner <ArrowUpRight /></Button><p>Independent cafes, bakeries & restaurants welcome.</p></div></div></section>
      <section className="section page-width faq-section"><div className="center-heading"><Eyebrow>A few things you might wonder</Eyebrow><h2 className="section-heading">Good questions.<br /><span className="editorial">Straight answers.</span></h2></div><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<Plus /></summary><p>{answer}</p></details>)}</div></section>
    </main>
    <footer className="site-footer"><div className="page-width"><div className="footer-top"><div><Wordmark /><p>A little loyalty goes a long way.</p></div><nav className="footer-links" aria-label="Footer navigation"><a href="#how-it-works">How it works</a><a href="#pricing">Pricing</a><a href="#founding">Founding partners</a></nav></div><div className="footer-bottom"><span>© 2026 Patron. For the places that make a neighbourhood.</span><span>Made with a little <Heart /> in South Africa.</span></div></div></footer>
    <Dialog open={bookingOpen} onOpenChange={setBookingOpen}><DialogContent className="booking-dialog"><PixelStamp /><DialogTitle>Let’s make you<br />a neighbourhood favourite.</DialogTitle><DialogDescription>Patron is getting ready for its first Johannesburg partners. A 15-minute visit is a chance to chat about your restaurant, your regulars and your slow days.</DialogDescription><div className="booking-info">Visit bookings aren’t open just yet. The pilot’s contact details and booking times will be added here before launch.</div><Button variant="patron" className="primary-cta" onClick={() => setBookingOpen(false)}>Sounds good <Check /></Button></DialogContent></Dialog>
  </>;
}
