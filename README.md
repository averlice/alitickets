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
        *   Add Redirect URI: `https://tickets.blindsoft.net/auth/callback`

2.  **Configuration (Local Development):**
    *   Rename `.dev.vars.example` to `.dev.vars`.
    *   Fill in your secrets.

3.  **Cloudflare KV:**
    *   Run `wrangler kv:namespace create TICKET_DB`.
    *   Copy the output `id` and paste it into `wrangler.toml`.

4.  **Register Commands:**
    *   Run `npm run register`.

5.  **Deploy & Secrets:**
    *   Run `npm run deploy`.
    *   **Set Secrets in Cloudflare**:
        *   `wrangler secret put DISCORD_TOKEN`
        *   `wrangler secret put DISCORD_PUBLIC_KEY`
        *   `wrangler secret put DISCORD_APPLICATION_ID`
        *   `wrangler secret put DISCORD_CLIENT_SECRET`
        *   `wrangler secret put DISCORD_REDIRECT_URI` (Value: `https://tickets.blindsoft.net/auth/callback`)

6.  **Discord Interactions Endpoint:**
    *   Go to Discord Developer Portal -> **General Information**.
    *   Paste `https://tickets.blindsoft.net` into **Interactions Endpoint URL**.

## Usage

1.  **Setup Role:** Run `/config role id:<role_id>` to set the support role.
2.  **Setup Dev Role:** Run `/config devrole id:<role_id>` for escalations.
3.  **Setup Logs:** Run `/config logs channel:<#channel>` for transcripts.
4.  **Add Products:** Run `/add product name:<ProductName>`.
5.  **Create Panel:** Run `/panel` in your support channel.
6.  **Dashboard:** Visit `https://tickets.blindsoft.net/dashboard` (Requires Support Role).

## License

This project is open-source and licensed under the **GNU General Public License v3 (GPLv3)**. See the `LICENSE` file for details.