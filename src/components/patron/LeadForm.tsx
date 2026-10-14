import { useState } from 'react';
import { ArrowUpRight, Check, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { whatsappLink } from '@/lib/patron';

export const CONSENT_VERSION = 'v1-2026-10';
const consentText = 'I agree that Patron may contact me on WhatsApp or by phone about a visit.';

type Status = 'idle' | 'loading' | 'success' | 'error';

export function LeadForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [name, setName] = useState('');
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? '').trim();
    if (get('website')) { setStatus('success'); return; }
    const contactName = get('contact_name');
    setName(contactName);
    setStatus('loading');
    const opt = (k: string) => get(k) || null;
    const { error } = await supabase.from('leads').insert({
      restaurant_name: get('restaurant_name'), contact_name: contactName, phone: get('phone'),
      area: opt('area'), restaurant_type: opt('restaurant_type'), quiet_day: opt('quiet_day'), notes: opt('notes'),
      consent: data.get('consent') === 'on', consent_version: CONSENT_VERSION, consented_at: new Date().toISOString(),
    });
    setStatus(error ? 'error' : 'success');
  };
  return <section className="founding-section form-section" id="visit"><div className="page-width form-inner">
    <div className="founding-copy" data-reveal><div className="eyebrow"><span className="eyebrow-line" />Book a 15-minute visit</div>
      <h2 className="section-heading">Let’s make you a<br /><span className="editorial">neighbourhood favourite.</span></h2>
      <p>Tell us a little about your place. We’ll pop round for 15 minutes to chat about your regulars and your slow days.</p></div>
    <div className="lead-card">
      {status === 'success' ? <div className="lead-success" role="status"><Check /><h3>Thanks{name ? `, ${name}` : ''}.</h3><p>We’ll message you on WhatsApp soon.</p></div> :
      <form onSubmit={onSubmit} className="lead-form">
        <label>Restaurant name<input name="restaurant_name" required maxLength={200} autoComplete="organization" /></label>
        <label>Your name<input name="contact_name" required maxLength={120} autoComplete="name" /></label>
        <label>Phone or WhatsApp<input name="phone" required type="tel" minLength={6} maxLength={30} autoComplete="tel" inputMode="tel" /></label>
        <div className="honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <details className="planner-adjust"><summary>A bit more about your place</summary>
          <label>Area<input name="area" maxLength={200} /></label>
          <label>Type of place<input name="restaurant_type" maxLength={120} placeholder="Cafe, bakery, restaurant…" /></label>
          <label>Quietest day<select name="quiet_day" defaultValue=""><option value="">Not sure</option>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => <option key={d}>{d}</option>)}</select></label>
          <label>Anything else?<textarea name="notes" maxLength={2000} rows={3} /></label>
        </details>
        <label className="lead-consent"><input type="checkbox" name="consent" required />{consentText}</label>
        <Button variant="patron" className="primary-cta" type="submit" disabled={status === 'loading'}>{status === 'loading' ? <><Loader2 className="animate-spin" /> Sending…</> : <>Book my visit <ArrowUpRight /></>}</Button>
        {status === 'error' && <div className="lead-error" role="alert"><p>Something went wrong. Message us on WhatsApp instead.</p><Button variant="quiet" asChild><a href={whatsappLink('Hi Patron! I’d like to book a 15-minute visit.')} target="_blank" rel="noopener noreferrer"><MessageCircle /> Open WhatsApp</a></Button></div>}
      </form>}
    </div>
  </div></section>;
}
