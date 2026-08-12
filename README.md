# Stopherjones' Sports Tracker & Weekly Email Digest

A sports tournament and team tracker displaying ongoing, upcoming, and finished events, along with live standings for tracked teams (Leeds United, York City, Cleveland Browns).

## 📧 Weekly Email Digest GitHub Action

A GitHub Action (`.github/workflows/weekly-email.yml`) runs automatically **every Monday at 11:00 AM UTC** (or manually via the "Run workflow" button in the GitHub Actions tab).

### What the Email Digest Includes:
1. **🏁 Recently Finished Events**: Tournaments and events that completed in the last 14 days, with final scores, winners, Google Web summary links, and YouTube Highlight links.
2. **🔥 Season Climaxes**: Finals and climax phases occurring in the current week or next 14 days.
3. **📅 Upcoming Events**: Tournaments and leagues starting in the next 30–45 days.
4. **📊 Tracked Teams Standings & Status**: Live standings/records, latest match results, next upcoming fixtures, and cup tournament progress for Leeds United, York City, and Cleveland Browns.
5. **🔗 Direct Site Link**: Includes a direct link to `stopherjones.github.io/sports-digest`.

### ⚙️ GitHub Repository Secrets Configuration

To send the weekly email via SMTP (e.g. Gmail, SendGrid, Mailgun, Outlook), configure the following Repository Secrets in GitHub (`Settings` > `Secrets and variables` > `Actions`):

- `MAIL_USERNAME` (or `SMTP_USERNAME`): Your SMTP email address (e.g., `you@gmail.com`).
- `MAIL_PASSWORD` (or `SMTP_PASSWORD`): Your SMTP password or App Password (for Gmail: generated App Password).
- `MAIL_SERVER` (or `SMTP_SERVER`): *(Optional, defaults to `smtp.gmail.com`)*
- `MAIL_PORT` (or `SMTP_PORT`): *(Optional, defaults to `465`)*
- `MAIL_TO` (or `NOTIFICATION_EMAIL`): *(Optional, defaults to `chrisjones59@gmail.com`)*

### 🌐 Live Email Preview
You can preview the exact HTML email digest at any time by clicking the **📧 Weekly Digest** button in the app header or navigating to `/api/digest`.
