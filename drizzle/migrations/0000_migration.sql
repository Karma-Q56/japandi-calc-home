CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name text NOT NULL CHECK (char_length(restaurant_name) BETWEEN 1 AND 200),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 1 AND 120),
  phone text NOT NULL CHECK (char_length(phone) BETWEEN 6 AND 30),
  area text CHECK (area IS NULL OR char_length(area) <= 200),
  restaurant_type text CHECK (restaurant_type IS NULL OR char_length(restaurant_type) <= 120),
  quiet_day text CHECK (quiet_day IS NULL OR char_length(quiet_day) <= 20),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  consent boolean NOT NULL DEFAULT false,
  consent_version text NOT NULL,
  consented_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.leads TO anon, authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit a lead with consent" ON public.leads FOR INSERT TO anon, authenticated WITH CHECK (consent = true);