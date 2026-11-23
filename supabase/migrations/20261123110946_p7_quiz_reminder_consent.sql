-- P7: súhlas s pripomenutím nedokončenej objednávky emailom (políčko v checkoute, predvolene nezaškrtnuté).
-- Ukladá sa pri „Pokračovať k platbe“ (POST /api/checkout, čas servera) aj so zobrazeným textom ako doklad súhlasu.
-- „Started Checkout“ do Klaviyo ide iba pri reminder_consent = true.
alter table quiz_sessions
  add column reminder_consent boolean,
  add column reminder_consent_at timestamptz,
  add column reminder_consent_text text;
