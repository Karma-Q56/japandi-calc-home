import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { ArrowUpRight, ArrowRight, Check, Coffee, Heart, Smartphone, MessageSquare, Users, ChartNoAxesColumnIncreasing, QrCode, ScanLine, Plus, Menu, X, MapPin, Sprout, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { brand, commercial, plans, rand, whatsappLink } from '@/lib/patron';
import { useRevealAll } from '@/components/patron/motion';
import { StampProgress } from '@/components/patron/StampProgress';
import { QuietDay } from '@/components/patron/QuietDay';
import { Planner } from '@/components/patron/Planner';
import { MenuSection, SeeItWorking } from '@/components/patron/MenuAndScreens';
import { LeadForm } from '@/components/patron/LeadForm';
import cafeHero from '@/assets/cafe-hero.jpg';

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'Patron — Give more customers a reason to come back' },
    { name: 'description', content: 'Simple loyalty cards and targeted offers for independent South African restaurants. We help you set it up and keep it working.' },
    { property: 'og:title', content: 'Patron — Give more customers a reason to come back' },
    { property: 'og:description', content: 'Digital stamp cards, your own guest list and thoughtful SMS specials for independent restaurants in South Africa.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: HomePage,
});

const visitMessage = 'Hi Patron! I’d like to book a 15-minute visit for my restaurant.';

function PixelStamp() {
  return <svg className="pixel-stamp" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 2h14v3h3v14h-3v3H5v-3H2V5h3V2zm2 3v2H5v10h2v2h10v-2h2V7h-2V5H7zm2 6h2v3h2v-3h2V9h2v5h-2v2h-4v-2H9v-3z" /></svg>;
}
function Wordmark() { return <a className="wordmark" href="#" aria-label="Patron home"><PixelStamp /><span>{brand.name}<span className="wordmark-dot">.</span></span></a>; }
function Eyebrow({ children }: { children: React.ReactNode }) { return <div className="eyebrow"><span className="eyebrow-line" />{children}</div>; }

const faqs = [
  ['Do my customers need to download an app?', 'Nope. They scan your QR code and join with their phone number. Their stamp card opens right in their phone’s browser. No app, no password, no lost paper card.'],
  ['How do customers collect stamps?', 'After a qualifying purchase, your staff scan the customer’s card or enter their phone number to confirm a stamp. Customers cannot award themselves stamps. You choose the reward.'],
  ['Will you message everyone on my list?', 'Only customers who have agreed to receive offers from your restaurant. Every SMS identifies your restaurant and includes an opt-out. Their loyalty card still works if they choose not to receive marketing.'],
  ['Are SMS costs included in my plan?', 'SMS credits are prepaid and separate from your monthly plan, estimated at R0.35 per message. You see the cost before sending, so there are no surprise SMS bills.'],
  ['What does being a founding partner mean?', 'The first three restaurants receive a reduced setup fee and a discounted monthly price for three months. In return, we ask for honest feedback and, if you’re happy, an approved testimonial. Exact pilot pricing is agreed together.'],
];

function HomePage() {
  useRevealAll();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);
  const nav = <><a href="#how-it-works" onClick={close}>How it works</a><a href="#what-you-get" onClick={close}>What you get</a><a href="#pricing" onClick={close}>Pricing</a></>;
  const wa = whatsappLink(visitMessage);
  return <>
    <header className="site-header"><div className="page-width header-inner"><Wordmark /><nav className="nav-links" aria-label="Main navigation">{nav}<a href="/app">Product preview</a></nav><Button variant="patron" className="header-book" asChild><a href="#visit">Let’s chat <ArrowUpRight /></a></Button><Button variant="ghost" size="icon" className="mobile-menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</Button></div>{menuOpen && <nav className="mobile-nav" aria-label="Mobile navigation">{nav}<a href="/app" onClick={close}>Product preview</a><Button variant="patron" asChild><a href="#visit" onClick={close}>Let’s chat <ArrowUpRight /></a></Button></nav>}</header>
    <StampProgress />
    <main>
      <section className="hero">
        <img src={cafeHero} alt="A cappuccino, fresh croissant and digital loyalty card on a sunlit cafe table" width={1920} height={1024} className="hero-photo" fetchPriority="high" />
        <div className="page-width hero-inner"><Eyebrow>Good food. Familiar faces.</Eyebrow><h1>Give more customers a reason to <span className="editorial">come back.</span></h1><p className="hero-description">Simple loyalty cards and targeted offers for independent restaurants. We help you set it up and keep it working.</p><div className="hero-actions"><Button variant="patron" className="primary-cta" asChild><a href={wa} target="_blank" rel="noopener noreferrer">Book a 15-minute visit <ArrowUpRight /></a></Button><a href="#calculator" className="text-link">See what a few more visits could be worth <ArrowRight size={14} /></a></div><p className="hero-note"><MapPin />Made for independent spots. Starting in Joburg.</p></div>
      </section>
      <div className="benefits-strip"><div className="page-width benefits-inner">{[[Smartphone, 'No app to download'], [Heart, 'Your customers. Your list.'], [MessageSquare, 'SMS, not another inbox'], [Sprout, 'Local & hands-on']].map(([Icon, text], i) => { const BenefitIcon = Icon as typeof Smartphone; return <div className="benefit" key={i}><BenefitIcon /><span>{text as string}</span></div>; })}</div></div>
      <section className="section page-width" id="how-it-works">
        <div className="section-head-row" data-reveal><div><Eyebrow>Less admin. More regulars.</Eyebrow><h2 className="section-heading">They came for the coffee.<br />Give them a reason to <span className="editorial">stay.</span></h2></div><p className="section-description">Paper cards get lost. Slow Tuesdays stay slow. Keeping in touch shouldn’t be another full-time job.</p></div>
        <div className="steps-grid">{[
          { icon: QrCode, title: 'Scan. Join. Sorted.', text: 'A QR code on your counter or table. A phone number. And just like that, they’re on your regulars list.' },
          { icon: ScanLine, title: 'A little stamp. A little love.', text: 'Your staff confirm a stamp after a purchase. Your customer collects them towards a reward worth coming back for.' },
          { icon: MessageSquare, title: 'Make Tuesday their day.', text: 'Haven’t seen someone in a while? Send a thoughtful SMS special and give them a reason to pop in.' },
        ].map((step, i) => <div className="step" key={step.title} data-reveal><div className="step-top"><span className="step-number">0{i + 1}</span><step.icon /></div><h3>{step.title}</h3><p>{step.text}</p></div>)}</div>
      </section>
      <section className="section features-section" id="what-you-get"><div className="page-width">
        <div className="section-head-row" data-reveal><div><Eyebrow>The good stuff, all together</Eyebrow><h2 className="section-heading">Small tools.<br /><span className="editorial">More reasons to return.</span></h2></div><p className="section-description">Everything you need to keep your customers close. Nothing you need a manual for.</p></div>
        <div className="bento-grid" data-reveal>
          <article className="bento bento-loyalty"><div className="bento-copy"><Smartphone className="bento-icon" /><h3>A stamp card.<br />Minus the paper.</h3><p>Your brand, your reward, on their phone. Always in their pocket. Never in the wash.</p></div><div className="loyalty-demo" aria-label="Example cafe loyalty card"><div className="demo-cafe">the daily grind.</div><div className="demo-subtitle">A little perk for your daily ritual</div><div className="demo-stamps">{Array.from({ length: 8 }, (_, i) => <span key={i} className={`demo-stamp ${i < 5 ? 'filled' : ''}`}>{i < 5 ? <Coffee /> : i === 7 ? <Heart /> : null}</span>)}</div><div className="demo-reward">Your 8th coffee is on us.</div><span className="demo-progress">5 of 8 stamps collected</span></div></article>
          <article className="bento bento-list"><Users className="bento-icon" /><h3>Your regulars.<br />Your list.</h3><p>Know who’s been in, who’s been away, and who might fancy a visit.</p><div className="list-demo">{[['TM', 'Thandi M.', 'Visited today'], ['JN', 'James N.', 'Away 30 days'], ['SP', 'Sipho P.', 'Visited yesterday']].map(([initials, name, visit]) => <div className="list-demo-row" key={name}><span className="demo-avatar">{initials}</span><span>{name}</span><span>{visit}</span></div>)}</div></article>
          <article className="bento bento-message"><MessageSquare className="bento-icon" /><h3>A special.<br />Not spam.</h3><p>Reach the right people with prepaid SMS offers they’ve opted into.</p><div className="sms-demo">Hey Thandi, we miss your face! Pop into The Daily Grind this Tuesday for a coffee on us with any breakfast. Just say TUESDAY.<span>The Daily Grind · Reply STOP to opt out</span></div></article>
          <article className="bento bento-results"><div className="bento-copy"><ChartNoAxesColumnIncreasing className="bento-icon" /><h3>Less guessing.<br />More “that worked”.</h3><p>See who joined, who came back, and which specials brought people through your door. Simple numbers that mean something.</p></div><div className="results-demo"><div className="demo-label">Tuesday breakfast special</div><strong>12 <span className="text-sm font-normal">came back</span></strong><div className="demo-bars"><i /><i /><i /><i /><i /><i /></div></div></article>
        </div><p className="demo-disclaimer">Demo data — example cards, customers and campaign, not real results.</p>
      </div></section>
      <MenuSection />
      <SeeItWorking />
      <QuietDay />
      <Planner />
      <section className="section pricing-section" id="pricing"><div className="page-width"><div className="center-heading" data-reveal><Eyebrow>A plan for your kind of place</Eyebrow><h2 className="section-heading">Keep it simple.<br />Make it <span className="editorial">worth it.</span></h2><p className="section-description">Do it yourself, or let us lend a hand.<br />Month to month. No long contracts.</p></div>
        <div className="pricing-grid">{plans.map((plan, i) => <article data-reveal className={`price-card ${i === 1 ? 'featured' : ''}`} key={plan.name}>{i === 1 && <span className="price-tag">An extra pair of hands</span>}<h3>{plan.name}</h3><p className="price-description">{plan.description}</p><div className="price-amount">{rand(plan.min)}–{rand(plan.max)}</div><span className="price-period">per month · proposed pricing</span><ul>{plan.features.map(feature => <li key={feature}><Check />{feature}</li>)}</ul><Button variant={i === 1 ? 'patron' : 'quiet'} className="price-cta" asChild><a href="#visit">Let’s talk {plan.name} <ArrowUpRight /></a></Button></article>)}</div>
        <div className="pricing-notes"><p>Once-off setup: {rand(commercial.setupMin)}–{rand(commercial.setupMax)}. Includes your page, QR cards, staff training & first campaign.</p><p>SMS credits sold separately, estimated at R0.35 per message. All prices are proposals for the pilot.</p></div>
      </div></section>
      <section className="founding-section" id="founding"><div className="page-width founding-inner" data-reveal><div className="founding-copy"><Eyebrow>Built together, right here</Eyebrow><h2 className="section-heading">Your neighbourhood.<br />Our first <span className="editorial">three.</span></h2><p>We’re looking for {commercial.foundingSpots} founding restaurants in {brand.location}. Get hands-on setup, a reduced setup fee and a discounted monthly plan for your first {commercial.discountMonths} months. Help us shape something useful.</p></div><div className="founding-cta"><Button variant="patron" className="primary-cta" asChild><a href="#visit">Be a founding partner <ArrowUpRight /></a></Button><p>Independent cafes, bakeries & restaurants welcome.</p></div></div></section>
      <section className="section page-width faq-section"><div className="center-heading" data-reveal><Eyebrow>A few things you might wonder</Eyebrow><h2 className="section-heading">Good questions.<br /><span className="editorial">Straight answers.</span></h2></div><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<Plus /></summary><p>{answer}</p></details>)}</div></section>
      <LeadForm />
    </main>
    <div className="marquee" aria-hidden="true"><div className="marquee-track">{Array.from({ length: 2 }, (_, k) => <span key={k}>A little loyalty goes a long way · Good food, familiar faces · Make Tuesday their day · For the places that make a neighbourhood · </span>)}</div></div>
    <footer className="site-footer"><div className="page-width"><div className="footer-top"><div><Wordmark /><p>A little loyalty goes a long way.</p></div><nav className="footer-links" aria-label="Footer navigation"><a href="#how-it-works">How it works</a><a href="#pricing">Pricing</a><a href="#visit">Book a visit</a></nav></div><div className="footer-bottom"><span>© 2026 Patron. For the places that make a neighbourhood.</span><span>Made with a little <Heart /> in South Africa.</span></div></div></footer>
    <a className="wa-float" href={wa} target="_blank" rel="noopener noreferrer" aria-label="Message us on WhatsApp"><MessageCircle /></a>
  </>;
}
