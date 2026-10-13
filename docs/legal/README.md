# Legal drafts

These are Phase 0 drafts of the [Privacy Policy](privacy-policy.md) and the
[Terms of Service](terms-of-service.md). They describe what the code does after the
Phase 0 fixes. A lawyer must review them before the beta opens to the public, and they
need a Bangla translation.

## Questions for counsel

1. **Data-protection law.** Which law applies to a Bangladesh company processing data of
   users in Bangladesh: the Personal Data Protection Ordinance 2025, and the Cyber Security
   Ordinance 2025? What are the registration, consent and breach-notification duties, and
   who is the regulator?
2. **Health data.** Heart rate from a Bluetooth strap is health data. Is the opt-in
   wording in section 2 of the Privacy Policy explicit enough, or do we need a separate
   consent screen when a strap is first connected?
3. **Minimum age.** Should it be 13, 16 or 18? What parental consent applies below 18?
4. **Data location.** The VPS location and the backup location. Are there any rules about
   storing personal data outside Bangladesh, if the VPS or the backups are abroad?
5. **Liability cap** and the consumer-protection limits on it.
6. **Arbitration** or Dhaka courts.
7. **Future payments.** What must the terms say once bKash/Nagad subscriptions exist:
   refunds, automatic renewal and VAT?

## Facts to fill in

- Registered company name, registration number and address.
- Contact addresses: privacy@ and support@ on the production domain.
- VPS and backup locations.
- Map tile provider. Esri is in use today without a licence, and switching to MapLibre
  with licensed tiles is planned for Phase 1.
- Email provider (Phase 1).
- Retention periods: server logs [14 days], backups [30 days], reports [12 months].

## Before the beta: the app must match the text

- [ ] Show the Terms and the Privacy Policy as pages, linked from sign-up, Settings and
  About. Replace the joke line on the sign-up screen.
- [ ] Add a full account data export (the policy promises one by email until then).
- [ ] Add a consent screen the first time a heart-rate sensor is connected, if counsel
  asks for it.
- [ ] Set the server log retention to the stated period on the VPS.
