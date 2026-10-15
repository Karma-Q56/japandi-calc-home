-- Migration: 0001_initial_schema
-- Created: Initial schema for Patron
-- Up: Apply this migration

-- Enums
CREATE TYPE restaurant_status AS ENUM ('draft', 'active', 'paused', 'closed');
CREATE TYPE plan_tier AS ENUM ('starter', 'managed', 'partner', 'custom');
CREATE TYPE marketing_status AS ENUM ('not_opted_in', 'opted_in', 'opted_out');
CREATE TYPE consent_purpose AS ENUM ('loyalty', 'marketing_sms', 'marketing_push');
CREATE TYPE consent_action AS ENUM ('granted', 'withdrawn');
CREATE TYPE stamp_status AS ENUM ('valid', 'undone');
CREATE TYPE reward_status AS ENUM ('available', 'redeemed', 'void');
CREATE TYPE campaign_status AS ENUM ('draft', 'pending_approval', 'scheduled', 'sending', 'sent', 'cancelled', 'failed');
CREATE TYPE campaign_channel AS ENUM ('sms', 'push', 'both');
CREATE TYPE message_channel AS ENUM ('sms', 'push');
CREATE TYPE message_status AS ENUM ('queued', 'sending', 'sent', 'delivered', 'failed', 'skipped');
CREATE TYPE ledger_entry_type AS ENUM ('topup', 'reserve', 'release', 'charge', 'refund', 'adjustment');
CREATE TYPE payment_kind AS ENUM ('setup', 'subscription', 'topup');
CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'rejected');
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'demo_booked', 'won', 'lost');

-- Restaurants
CREATE TABLE restaurant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text UNIQUE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  status restaurant_status NOT NULL DEFAULT 'draft',
  plan plan_tier NOT NULL DEFAULT 'starter',
  suburb text,
  city text NOT NULL DEFAULT 'Johannesburg',
  public_listed boolean NOT NULL DEFAULT false,
  logo_url text,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  visit_window_minutes integer NOT NULL DEFAULT 240 CHECK (visit_window_minutes BETWEEN 0 AND 1440),
  stamps_required integer NOT NULL DEFAULT 8 CHECK (stamps_required BETWEEN 2 AND 30),
  welcome_stamp boolean NOT NULL DEFAULT false,
  reward_description text NOT NULL DEFAULT 'A free item on us',
  marketing_weekly_cap integer NOT NULL DEFAULT 3 CHECK (marketing_weekly_cap BETWEEN 0 AND 14),
  member_weekly_cap integer NOT NULL DEFAULT 2 CHECK (member_weekly_cap BETWEEN 0 AND 14),
  sms_sender_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff_member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  pin_hmac text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, pin_hmac)
);

CREATE TABLE menu_section (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE menu_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  section_id uuid REFERENCES menu_section(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  price_cents integer CHECK (price_cents >= 0),
  available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE special (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Customers
CREATE TABLE customer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  phone_e164 text NOT NULL UNIQUE CHECK (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  birthday date,
  qr_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  erased_at timestamptz
);

CREATE TABLE membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'qr',
  stamps_current integer NOT NULL DEFAULT 0 CHECK (stamps_current >= 0),
  stamps_total integer NOT NULL DEFAULT 0 CHECK (stamps_total >= 0),
  rewards_earned integer NOT NULL DEFAULT 0 CHECK (rewards_earned >= 0),
  last_visit_at timestamptz,
  marketing_sms marketing_status NOT NULL DEFAULT 'not_opted_in',
  marketing_push marketing_status NOT NULL DEFAULT 'not_opted_in',
  UNIQUE (restaurant_id, customer_id)
);

CREATE INDEX membership_restaurant_last_visit ON membership (restaurant_id, last_visit_at);
CREATE INDEX membership_customer ON membership (customer_id);

-- Consent events
CREATE TABLE consent_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES membership(id) ON DELETE CASCADE,
  purpose consent_purpose NOT NULL,
  action consent_action NOT NULL,
  wording_version text NOT NULL,
  wording_text text NOT NULL,
  source text NOT NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX consent_event_lookup ON consent_event (membership_id, purpose, created_at DESC);

-- Loyalty
CREATE TABLE stamp_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES membership(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff_member(id),
  status stamp_status NOT NULL DEFAULT 'valid',
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by text,
  undo_reason text,
  UNIQUE (restaurant_id, idempotency_key)
);

CREATE INDEX stamp_event_member ON stamp_event (membership_id, created_at DESC);
CREATE INDEX stamp_event_restaurant_day ON stamp_event (restaurant_id, created_at);

CREATE TABLE reward (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES membership(id) ON DELETE CASCADE,
  description text NOT NULL,
  status reward_status NOT NULL DEFAULT 'available',
  earned_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  redeemed_by_staff uuid REFERENCES staff_member(id)
);

CREATE INDEX reward_member ON reward (membership_id, status);

-- Money
CREATE TABLE payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  kind payment_kind NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status payment_status NOT NULL DEFAULT 'pending',
  reference text NOT NULL UNIQUE,
  provider text NOT NULL DEFAULT 'manual_eft',
  provider_ref text,
  requested_by text,
  confirmed_by text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Campaigns
CREATE TABLE campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  name text NOT NULL,
  message_body text NOT NULL CHECK (length(message_body) BETWEEN 1 AND 600),
  channel campaign_channel NOT NULL DEFAULT 'sms',
  audience jsonb NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9]{3,12}$'),
  valid_from timestamptz,
  valid_to timestamptz,
  status campaign_status NOT NULL DEFAULT 'draft',
  requires_approval boolean NOT NULL DEFAULT false,
  approved_by text,
  approved_at timestamptz,
  scheduled_at timestamptz,
  est_recipients integer,
  est_segments integer,
  est_cost_cents integer,
  actual_cost_cents integer NOT NULL DEFAULT 0,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (restaurant_id, code)
);

CREATE INDEX campaign_restaurant ON campaign (restaurant_id, created_at DESC);
CREATE INDEX campaign_due ON campaign (status, scheduled_at) WHERE status IN ('scheduled', 'sending');

CREATE TABLE message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES membership(id) ON DELETE CASCADE,
  channel message_channel NOT NULL,
  status message_status NOT NULL DEFAULT 'queued',
  segments integer NOT NULL DEFAULT 1 CHECK (segments >= 0),
  cost_cents integer NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  provider text,
  provider_message_id text,
  error_code text,
  attempts integer NOT NULL DEFAULT 0,
  queued_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  UNIQUE (campaign_id, membership_id, channel)
);

CREATE INDEX message_queue ON message (queued_at) WHERE status IN ('queued', 'sending');
CREATE UNIQUE INDEX message_provider_id ON message (provider, provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE redemption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES membership(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff_member(id),
  stamp_event_id uuid REFERENCES stamp_event(id),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  UNIQUE (campaign_id, membership_id)
);

-- Credit ledger
CREATE TABLE credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  entry_type ledger_entry_type NOT NULL,
  amount_cents integer NOT NULL,
  reference text NOT NULL UNIQUE,
  campaign_id uuid REFERENCES campaign(id),
  message_id uuid REFERENCES message(id),
  payment_id uuid REFERENCES payment(id),
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (entry_type IN ('topup', 'release', 'refund') AND amount_cents > 0) OR
    (entry_type IN ('reserve', 'charge') AND amount_cents < 0) OR
    (entry_type = 'adjustment' AND amount_cents <> 0)
  )
);

CREATE INDEX credit_ledger_restaurant ON credit_ledger (restaurant_id, created_at DESC);

CREATE VIEW restaurant_credit_balance AS
  SELECT restaurant_id, COALESCE(SUM(amount_cents), 0)::integer AS available_cents
  FROM credit_ledger
  GROUP BY restaurant_id;

-- Push
CREATE TABLE push_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  disabled_at timestamptz
);

CREATE INDEX push_subscription_customer ON push_subscription (customer_id) WHERE disabled_at IS NULL;

-- Marketing site, operations
CREATE TABLE lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('waitlist', 'test')),
  restaurant_name text NOT NULL,
  contact_name text NOT NULL,
  phone text NOT NULL,
  email text,
  role text,
  venue_type text,
  suburb text,
  quiet_time text,
  weekly_guests text,
  plan_interest text,
  consent boolean NOT NULL CHECK (consent),
  consent_version text NOT NULL,
  calculator jsonb,
  status lead_status NOT NULL DEFAULT 'new',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE data_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customer(id) ON DELETE SET NULL,
  restaurant_id uuid REFERENCES restaurant(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('access', 'correction', 'deletion')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'refused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  notes text
);

CREATE TABLE provider_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, event_id)
);

CREATE TABLE otp_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash text NOT NULL,
  ip_hash text,
  provider text,
  provider_message_id text,
  cost_cents integer,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX otp_send_log_phone ON otp_send_log (phone_hash, created_at DESC);

CREATE TABLE rate_limit_hit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket text NOT NULL,
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rate_limit_hit_lookup ON rate_limit_hit (bucket, key, created_at DESC);

CREATE TABLE audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('customer', 'owner', 'staff', 'operator', 'system')),
  actor_id text,
  restaurant_id uuid REFERENCES restaurant(id) ON DELETE SET NULL,
  action text NOT NULL,
  object_type text,
  object_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_event_restaurant ON audit_event (restaurant_id, created_at DESC);

-- One-time codes
CREATE TABLE one_time_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('till_pair', 'ios_handoff')),
  restaurant_id uuid REFERENCES restaurant(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customer(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX one_time_code_expiry ON one_time_code (expires_at);

-- RLS Functions
CREATE OR REPLACE FUNCTION app_restaurant() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.restaurant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_customer() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.customer_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_is_operator() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('app.is_operator', true), '') = 'true' $$;

-- RLS Policies
-- Tenant tables
do $$
  declare t text;
  begin
    foreach t in array array[
      'staff_member', 'menu_section', 'menu_item', 'special', 'membership',
      'stamp_event', 'reward', 'campaign', 'message', 'redemption',
      'credit_ledger', 'payment'
    ] loop
      execute format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      execute format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      execute format(
        'CREATE POLICY tenant_all ON %I USING (restaurant_id = app_restaurant() OR app_is_operator()) WITH CHECK (restaurant_id = app_restaurant() OR app_is_operator())', t);
    end loop;
  end $$;

-- Customer policies
CREATE POLICY customer_read_own ON membership FOR SELECT USING (customer_id = app_customer());
CREATE POLICY customer_read_own ON reward FOR SELECT USING (
  membership_id IN (SELECT id FROM membership WHERE customer_id = app_customer()));
CREATE POLICY customer_read_own ON stamp_event FOR SELECT USING (
  membership_id IN (SELECT id FROM membership WHERE customer_id = app_customer()));

-- Consent events
ALTER TABLE consent_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_or_owner ON consent_event USING (
  membership_id IN (SELECT id FROM membership WHERE restaurant_id = app_restaurant())
  OR membership_id IN (SELECT id FROM membership WHERE customer_id = app_customer())
  OR app_is_operator());

-- Customers
ALTER TABLE customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_self ON customer USING (id = app_customer() OR app_is_operator());
CREATE POLICY customer_via_membership ON customer FOR SELECT USING (
  id IN (SELECT customer_id FROM membership WHERE restaurant_id = app_restaurant()));

-- Push subscriptions
ALTER TABLE push_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscription FORCE ROW LEVEL SECURITY;
CREATE POLICY push_own ON push_subscription USING (customer_id = app_customer() OR app_is_operator());

-- Public pages
ALTER TABLE restaurant ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant FORCE ROW LEVEL SECURITY;
CREATE POLICY restaurant_read ON restaurant FOR SELECT USING (true);
CREATE POLICY restaurant_write ON restaurant FOR ALL
  USING (id = app_restaurant() OR app_is_operator())
  WITH CHECK (id = app_restaurant() OR app_is_operator());

-- Menu and specials public read
drop policy tenant_all on menu_section;
drop policy tenant_all on menu_item;
drop policy tenant_all on special;
create policy public_read on menu_section for select using (true);
create policy public_read on menu_item for select using (true);
create policy public_read on special for select using (true);
create policy tenant_write on menu_section for all using (restaurant_id = app_restaurant() or app_is_operator())
  with check (restaurant_id = app_restaurant() or app_is_operator());
create policy tenant_write on menu_item for all using (restaurant_id = app_restaurant() or app_is_operator())
  with check (restaurant_id = app_restaurant() or app_is_operator());
create policy tenant_write on special for all using (restaurant_id = app_restaurant() or app_is_operator())
  with check (restaurant_id = app_restaurant() or app_is_operator());

-- Stamp function
CREATE OR REPLACE FUNCTION record_stamp(
  p_restaurant uuid, p_membership uuid, p_staff uuid, p_key text
) RETURNS TABLE (out_result text, out_stamp_id uuid, out_stamps integer, out_reward_id uuid)
LANGUAGE plpgsql AS $$
declare
  m membership%rowtype;
  r restaurant%rowtype;
  prior stamp_event%rowtype;
  last_valid timestamptz;
  new_id uuid;
  new_reward uuid := null;
begin
  SELECT * INTO m FROM membership WHERE id = p_membership AND restaurant_id = p_restaurant FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_a_member'::text, null::uuid, null::integer, null::uuid;
    RETURN;
  END IF;

  SELECT * INTO prior FROM stamp_event WHERE restaurant_id = p_restaurant AND idempotency_key = p_key;
  IF FOUND THEN
    RETURN QUERY SELECT 'duplicate_retry'::text, prior.id, m.stamps_current, null::uuid;
    RETURN;
  END IF;

  SELECT * INTO r FROM restaurant WHERE id = p_restaurant;

  SELECT max(created_at) INTO last_valid
    FROM stamp_event WHERE membership_id = m.id AND status = 'valid';
  IF last_valid IS NOT NULL AND last_valid > now() - make_interval(mins => r.visit_window_minutes) THEN
    RETURN QUERY SELECT 'too_soon'::text, null::uuid, m.stamps_current, null::uuid;
    RETURN;
  END IF;

  INSERT INTO stamp_event (restaurant_id, membership_id, staff_id, idempotency_key)
    VALUES (p_restaurant, m.id, p_staff, p_key)
    RETURNING id INTO new_id;

  UPDATE membership
     SET stamps_current = stamps_current + 1,
         stamps_total = stamps_total + 1,
         last_visit_at = now()
   WHERE id = m.id
   RETURNING * INTO m;

  IF m.stamps_current >= r.stamps_required THEN
    INSERT INTO reward (restaurant_id, membership_id, description)
      VALUES (p_restaurant, m.id, r.reward_description)
      RETURNING id INTO new_reward;
    UPDATE membership
       SET stamps_current = stamps_current - r.stamps_required,
           rewards_earned = rewards_earned + 1
     WHERE id = m.id
     RETURNING * INTO m;
  END IF;

  RETURN QUERY SELECT 'stamped'::text, new_id, m.stamps_current, new_reward;
end;
$$;
