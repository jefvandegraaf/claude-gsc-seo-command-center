# Emails while your computer sleeps

By default the desktop app sends each site's weekly email while it's open, including when it's minimised to the tray. Turn on **Start when I log in** in Settings, and for most people that's enough: if the computer was off on Monday morning, the email goes out as soon as it's back on that week.

If you need it to run on schedule regardless (an agency with client commitments, say), run the command-line version on a schedule instead. It uses the same data folder and the same task lists as the app.

```
node cli.mjs scheduled
```

`scheduled` only sends sites that are due (their day and hour have passed this week and they haven't been sent yet), so it's safe to run every hour.

## Keys for scheduled runs

The command line reads keys from environment variables, never from files in the repo:

| Variable | What |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to your service account `.json` key (kept outside the repo) |
| `RESEND_API_KEY` | Resend API key |
| `FATHOM_API_TOKEN` | Optional |
| `PSI_API_KEY` | Optional |
| `ANTHROPIC_API_KEY` | Optional, if Settings → AI summaries is "Claude API" |

Set them as **user** environment variables (Windows: Start → "Edit environment variables for your account"; macOS/Linux: your shell profile or the launchd/cron entry). Don't put them in a script you commit.

The "Send from" address, schedule and AI setting come from `node cli.mjs settings` (shared with the app).

## Windows: Task Scheduler

1. Open **Task Scheduler → Create Task**.
2. **General:** name it `SEO Command Center`, choose **Run whether user is logged on or not**.
3. **Triggers → New:** Daily, repeat every **1 hour** for a duration of **1 day**.
4. **Actions → New:** Program `node`, arguments `cli.mjs scheduled`, **Start in** the full path to this folder.
5. **Conditions:** tick **Wake the computer to run this task** if you want it to wake a sleeping PC.
6. Save, then right-click → **Run** once to test. Check the email arrived, or run `node cli.mjs sites`.

## macOS: launchd

Save as `~/Library/LaunchAgents/com.seo-command-center.plist` (replace the paths), then run `launchctl load ~/Library/LaunchAgents/com.seo-command-center.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.seo-command-center</string>
  <key>ProgramArguments</key><array><string>/usr/local/bin/node</string><string>cli.mjs</string><string>scheduled</string></array>
  <key>WorkingDirectory</key><string>/Users/you/claude-gsc-seo-command-center</string>
  <key>StartInterval</key><integer>3600</integer>
  <key>EnvironmentVariables</key><dict>
    <key>GOOGLE_APPLICATION_CREDENTIALS</key><string>/Users/you/.keys/seo-reader.json</string>
  </dict>
</dict></plist>
```

Put `RESEND_API_KEY` and the others in the same `EnvironmentVariables` block, and keep the plist out of any repo. A Mac that's asleep runs the job when it wakes.

## Linux: cron

```
0 * * * * cd /home/you/claude-gsc-seo-command-center && /usr/bin/node cli.mjs scheduled >> ~/.seo-cc.log 2>&1
```

Put the environment variables in a file only you can read (`chmod 600`) and source it at the start of the line.

## Truly always on: a small server

For an agency, the simplest reliable setup is a small always-on Linux machine (a $5/month VPS, a home server, a Raspberry Pi) running the cron line above. Copy your data folder (`~/.config/seo-command-center`) across if you want to keep the history and task statuses you built up in the desktop app.

Serverless (a Cloudflare Worker cron, for example) works too, but the history and tasks then need a database instead of the local data folder. That's a bigger change than this repo makes.
