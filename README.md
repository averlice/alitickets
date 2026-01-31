# Serverless Discord Ticket Bot (Blindsoft Edition)

## Setup

1.  **Discord Developer Portal:**
    *   Create a new Application.
    *   **Bot Tab:**
        *   Reset Token -> Copy Token.
        *   Disable "Public Bot".
        *   Enable `applications.commands` and `bot` scopes.
    *   **General Information:**
        *   Copy Application ID and Public Key.
    *   **OAuth2 Tab:**
        *   Copy Client Secret.
        *   Add Redirect URI: `https://<your-worker-subdomain>.workers.dev/auth/callback` (You'll get the subdomain after first deploy, or you can guess it if you know your cloudflare subdomain).

2.  **Configuration (Local Development):**
    *   Rename `.dev.vars.example` to `.dev.vars`.
    *   Fill in:
        *   `DISCORD_TOKEN`
        *   `DISCORD_PUBLIC_KEY`
        *   `DISCORD_APPLICATION_ID`
        *   `DISCORD_CLIENT_SECRET`
        *   `DISCORD_REDIRECT_URI` (e.g., http://localhost:8787/auth/callback for testing, or your production URL)

3.  **Cloudflare KV:**
    *   Run `wrangler kv:namespace create TICKET_DB`.
    *   Copy the output `id` and paste it into `wrangler.toml` (replace `id = ""`).

4.  **Register Commands:**
    *   Run `npm run register`.

5.  **Deploy & Secrets:**
    *   Run `npm run deploy`.
    *   **Set Secrets in Cloudflare** (Critical for security):
        *   `wrangler secret put DISCORD_TOKEN`
        *   `wrangler secret put DISCORD_PUBLIC_KEY`
        *   `wrangler secret put DISCORD_APPLICATION_ID`
        *   `wrangler secret put DISCORD_CLIENT_SECRET`
        *   `wrangler secret put DISCORD_REDIRECT_URI` (Value: `https://your-worker-name.your-subdomain.workers.dev/auth/callback`)

6.  **Discord Interactions Endpoint:**
    *   Go to Discord Developer Portal -> **General Information**.
    *   Paste your worker URL (e.g., `https://ticket-bot.ahpea.workers.dev`) into **Interactions Endpoint URL**.

## Usage



1.  **Setup Role:** Run `/config role <role_id>` in your server. This sets the support role and binds the bot to this guild.

2.  **Create Panel:** Run `/panel` to post the "Blindsoft Enterprises Support" message.

3.  **Dashboard:** Visit `https://your-worker-url.workers.dev/dashboard` to view active tickets (Requires Support Role).



## License



This project is open-source and licensed under the **GNU General Public License v3 (GPLv3)**. See the `LICENSE` file for details.
