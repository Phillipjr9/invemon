# Invemon Investment Website

A responsive React homepage for Invemon, an investment platform website. It includes a homepage signup section, pricing plans, account sign-in, investment profile creation, and responsive navigation.

## Run

- `npm run dev` starts the development server.
- `npm run build` creates the production site in `dist`.
- `npm run preview` serves the production build locally.

## Features

- Homepage signup form with name, email, password, country, investment goal, risk profile, monthly investment amount, and plan selection.
- Dedicated signup page with email/password registration and Google sign-in (integrated Google Identity Services and interactive account chooser).
- Upgraded Invemon Wealth Dashboard with top navigation header, `⌘K` quick command palette, privacy balance-masking toggle, actionable notification center, and user profile menu.
- Context-aware wealth summary that adapts metrics dynamically across all 10 dashboard sections.
- Multi-mode analytics card: toggle between Performance vs. S&P 500 (with pointer scrubbing and alpha readout), Capital Additions vs. Growth bars, and Passive Income projection bars.
- 14-asset Multi-Asset Screener (Stocks, ETFs, Dividend Payers, Bonds) with interactive Asset Inspector, 52-week range bars, and custom price alerts.
- Live CoinPaprika cryptocurrency directory with search, status and ranking filters, pagination, individual quotes, and historical price charts.
- Yield & Income engine featuring a 4.65% APY high-yield cash sweep, DRIP (automatic dividend reinvestment) toggle, and simulated dividend distributions.
- Custom recurring DCA plan creator (Weekly, Bi-weekly, Monthly) and interactive 1-click portfolio rebalance modal.
- Financial goals tracker with direct contribution transfer modals.
- Comprehensive Invemon Dashboard Footer featuring live operational status, security badges, 4-column navigation, and a weekly market digest subscription form.
- Sign-in, account profile, and video dialogs with accessible keyboard focus management and Escape handling.
- Zero horizontal layout overflow across 320px, 360px, 390px, 768px, 1024px, 1440px, and 1920px viewports.

## Notes

Accounts and newsletter signups are stored in the browser for the website experience. Connect the forms to your authentication, KYC, payment, and investment services before accepting real customer funds. Investing involves risk, including possible loss of principal.

### Cryptocurrency Data

The Crypto section reads CoinPaprika's public `/coins`, `/tickers`, `/tickers/{coin_id}`, and historical ticker endpoints directly. It lists the active and inactive assets returned by the provider. The free bulk ticker endpoint currently supplies up to 2,000 quotes; opening another active asset requests its individual quote where available. Historical periods and data availability vary by asset and provider plan. Prices may be delayed, and listing an asset does not mean it is available to trade.

The market feed is intended for evaluation: CoinPaprika's keyless tier is for personal, non-commercial use and is subject to shared rate limits. Obtain appropriate commercial data rights and use a secured backend proxy before a production launch. Set `VITE_CRYPTO_API_BASE_URL` to that proxy's base URL, for example `/api/crypto`; it must expose the same `/coins`, `/tickers`, and historical ticker paths. Keep paid API credentials on the server, not in client-side environment variables. CoinPaprika documentation: https://docs.coinpaprika.com/get-started/api-rest-introduction

Cryptocurrency watchlists are stored only in the current browser. Portfolio balances, deposits, orders, and the non-crypto watchlist remain simulated and are not connected to a brokerage or an exchange.

For production Google sign-in, set `VITE_GOOGLE_CLIENT_ID` to your Google OAuth client ID and verify the Google ID token on your backend. Without a client ID, the signup page shows a Google-style account chooser so the flow can be reviewed in the browser.

Reference: https://templates.studioniskala.com/invemon/template-kit/home/
Original template: https://themeforest.net/item/invemon-mobile-apps-trading-investment-website-elementor-template-kit/59412221

The reference images, branding, and fonts are included to reproduce the requested design. Obtain the necessary rights or replace those assets before publishing commercially.
