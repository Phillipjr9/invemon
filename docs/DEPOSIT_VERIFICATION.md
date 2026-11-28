# Production deposit reconciliation hardening

The callback route now calls `verifyProductionSettlement` before posting a credit. Both signed callback and independent provider response must identify the same order, invoice and payment, explicitly identify USD and the exact cent amount, and agree on settlement asset/network. A missing identity or currency is not replaced with an expected value. Provider actual-paid units must cover provider requested payment units. Request asset/network restrictions are enforced when present; invoices that let the payer choose a currency instead bind callback evidence to the independently retrieved provider evidence.

Missing network evidence fails closed. If NOWPayments does not return an explicit network, do not invent it or bypass validation: implement and test an authoritative provider-currency-to-network mapping first. A provider `finished` status or successful browser redirect alone is never credit authority.

Amounts use decimal strings and BigInt rather than floating-point tolerance. The database posting still locks the request, deduplicates payment posting keys and produces balanced USD-cent entries.

## Operational boundaries

This is not proof of USD custody, fiat conversion or net proceeds after fees. Crediting the invoice's USD face value is an operator funding obligation, not evidence that crypto has converted to dollars. Confirm that obligation and fee policy before enabling customer funding.

Refunded callbacks do not issue another credit. Existing credited funds are not automatically reversed or frozen: post-credit refunds require operator review and a supported append-only reversal procedure, with attention to funds already spent. Do not treat this as implemented chargeback recovery.

No production settings, payments, credentials or balances were changed by this patch. Local provider responses are mocked. Real production database constraints, simultaneous connections, provider network fields and a genuine received callback remain to be verified in a restricted operational test.

This branch originally predates the production funding implementation. Funding files and migration 020 were brought from origin/main to apply the hardening without switching branches; apply all required migrations before deploying backend code if they are not already present. Do not blindly re-run migrations on production as part of verification.
