# Connect Google (Search Console, GA4, PageSpeed) in about 10 minutes

The command center reads Google data through a **service account**: a robot Google account that only sees what you share with it, read-only. You create it once, then add its email address to each Search Console property (and GA4 property) it should read. Agencies: one service account works for every client.

## 1. Create a Google Cloud project

1. Go to https://console.cloud.google.com/ and sign in.
2. Top bar → project picker → **New project**. Name it something like `seo-command-center`. Create it and make sure it's selected.

## 2. Turn on the APIs

In **APIs & Services → Library**, search for and **Enable** each of these:

- **Google Search Console API**
- **Google Analytics Data API** (only if you use GA4)
- **PageSpeed Insights API** (only if you want speed checks with your own key)

## 3. Create the service account and its key

1. **APIs & Services → Credentials → Create credentials → Service account.**
2. Name it `seo-reader`. Skip the optional role steps; it needs no Google Cloud roles. Click **Done**.
3. Open the new service account → **Keys** tab → **Add key → Create new key → JSON**. A `.json` file downloads.
4. Keep that file somewhere private, **not** inside this repo or your website's folder. Anyone with it can read whatever you share with the service account.

> If Google says key creation is disabled, your organisation has the policy `iam.disableServiceAccountKeyCreation` turned on. An admin has to allow it for this project, or use a personal Google account for this.

In the app: **Settings and keys → Google service account → Choose key file…**. It's encrypted with your computer's keychain. Copy the service account's email address (it ends in `.iam.gserviceaccount.com`); you need it next.

Command line instead: set `GOOGLE_APPLICATION_CREDENTIALS` to the file's path.

## 4. Give it access to Search Console

For each site:

1. https://search.google.com/search-console → choose the property.
2. **Settings → Users and permissions → Add user.**
3. Paste the service account email. Permission: **Restricted** is enough.

Then in the app's **Site setup**, click **List the properties my service account can read** to confirm it worked. Use the property exactly as listed: `sc-domain:example.com` for a Domain property, or `https://example.com/` for a URL-prefix property.

## 5. Give it access to GA4 (optional)

1. https://analytics.google.com → **Admin → Property access management → +** → **Add users**.
2. Paste the service account email, role **Viewer**, uncheck "Notify new users", **Add**.
3. Your GA4 property ID is under **Admin → Property details** (numbers only).
4. In **Site setup**, list the event names that count as a lead (for example `generate_lead`, `form_submit`). Leave it empty to use GA4's key events.

## 6. PageSpeed Insights key (optional)

Google's keyless PageSpeed quota is shared and usually used up. For reliable speed checks:
**APIs & Services → Credentials → Create credentials → API key**, then **Restrict key → PageSpeed Insights API**. Add it in **Settings and keys**.

## Troubleshooting

| Message | Fix |
|---|---|
| `Google sign-in failed (400/401)` | The key file is wrong or was deleted in Google Cloud. Create a new key and choose it again. |
| `Search Console: add the service account as a user on …` | Step 4, for that exact property (Domain and URL-prefix properties are separate). |
| `GA4: add the service account as a Viewer …` | Step 5. |
| `Search Console answered 403` but the user is added | The Search Console API isn't enabled (step 2), or you're in a different Cloud project than the key. |
| No data for a brand-new site | Normal. Search Console needs a few days of traffic first. |
