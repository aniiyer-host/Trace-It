-- =====================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =====================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at
before update on profiles
for each row execute function set_updated_at();

create trigger trg_campaigns_updated_at
before update on campaigns
for each row execute function set_updated_at();

create trigger trg_donations_updated_at
before update on donations
for each row execute function set_updated_at();

create trigger trg_beneficiary_cohorts_updated_at
before update on beneficiary_cohorts
for each row execute function set_updated_at();

create trigger trg_disbursements_updated_at
before update on disbursements
for each row execute function set_updated_at();

create trigger trg_documents_updated_at
before update on documents
for each row execute function set_updated_at();

create trigger trg_impact_tokens_updated_at
before update on impact_tokens
for each row execute function set_updated_at();

-- =====================================================
-- SYNC CAMPAIGN RAISED AMOUNT
-- =====================================================
create or replace function sync_campaign_raised()
returns trigger as $$
begin
  if new."campaignId" is not null and (old.status is distinct from new.status) and new.status = 'SUCCESS' then
    update campaigns
      set "raisedAmount" = "raisedAmount" + new.amount,
          "updatedAt" = now()
    where id = new."campaignId";
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_sync_campaign_raised
after update on donations
for each row execute function sync_campaign_raised();

-- =====================================================
-- MARK IMPACT TOKENS REDEEMED
-- =====================================================
create or replace function mark_tokens_redeemed()
returns trigger as $$
begin
  if old.status is distinct from new.status and new.status = 'DELIVERED' then
    update impact_tokens
       set redeemed = true,
           "redeemedAt" = now(),
           "updatedAt" = now()
     where "donationId" = new.id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_mark_tokens_redeemed
after update on donations
for each row execute function mark_tokens_redeemed();

-- =====================================================
-- LEGAL HOLD HANDLER
-- =====================================================
create or replace function handle_legal_hold()
returns trigger as $$
begin
  if new."legalHold" = true then
    new.status = 'LEGAL_HOLD';
    new."ttlExpiry" = null;
  elsif old."legalHold" = true and new."legalHold" = false and new.status = 'LEGAL_HOLD' then
    new.status = 'ACTIVE';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_handle_legal_hold
before update on documents
for each row execute function handle_legal_hold();