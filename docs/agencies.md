# For freelancers and agencies: steal this

The code is MIT-licensed. Use it for your clients, rebrand the emails, charge for the work. The docs and prompts are CC BY 4.0: if you republish them, credit Jef van de Graaf.

## Setting up a client list

- **One service account for every client.** Each client adds the same `…@….iam.gserviceaccount.com` email as a **Restricted** user in their Search Console (and a **Viewer** in GA4). No client passwords, nothing to hand back when you part ways: they remove one user.
- **One site per client** in the app (or `node cli.mjs add …`), each with its own:
  - **Recipients:** the client, their marketer, you.
  - **Branding:** your agency name or logo, button colour, and your **reply-to** address, so replies come to you.
  - **Credit line:** switch off "Made with…" if you'd rather it didn't show.
  - **Schedule:** each site can have its own day and hour (`schedule` in `sites.json`), or use the global one.
  - **Never-show searches:** names or phrases that must never appear in a client email.
- **Send from your own domain** in Resend (`reports@youragency.com`). One verified domain covers every client.

## Selling it

- **Demo mode** (made-up data for a fictional plumber) shows prospects the whole thing without touching anyone's account.
- The Monday email *is* the deliverable: three specific tasks, the numbers behind them, and 28-day before/after results on finished work. That last part ("what your fixes did") is what makes a retainer easy to renew.
- Mark tasks done when you've shipped them. The impact line in the following month's emails is your proof of work.

## Running it for a client list

The desktop app is fine for a handful of sites. For a longer list, run `node cli.mjs scheduled` every hour on an always-on machine ([always-on.md](always-on.md)), so emails go out even when your laptop is closed.

## Limits worth knowing

- Google's URL Inspection API allows about 2,000 checks a day per property; the command center uses up to 20 per site per run.
- Search Console data runs about three days behind and keeps 16 months. The command center stores weekly snapshots, so after a year you hold history Google itself has dropped.
- PageSpeed Insights needs your own free API key for regular use.
- Claude summaries use **your** Claude API key, so you pay per use. Running Claude Code locally ("cli" mode) is meant for your own sites on your own machine, not as a service for others.
