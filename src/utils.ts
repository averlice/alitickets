/**
 * Blindsoft Ticket Bot
 * Copyright (C) 2026 Blindsoft Enterprises
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { verifyKey } from 'discord-interactions';

export async function verifyDiscordRequest(request: Request, env: any) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();
  const isValidRequest =
    signature &&
    timestamp &&
    verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
  if (!isValidRequest) {
    return { isValid: false };
  }
  return { interaction: JSON.parse(body), isValid: true };
}

export async function discordRequest(env: any, endpoint: string, options: any) {
  const url = 'https://discord.com/api/v10/' + endpoint;
  if (options.body) options.body = JSON.stringify(options.body);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent': 'DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)',
    },
    ...options
  });
  if (!res.ok) {
    const data: any = await res.json();
    console.error(res.status);
    throw new Error(JSON.stringify(data));
  }
  return res;
}

export function createEmbed(title: string, description: string, color: number = 0x00ff00) {
    return {
        title,
        description,
        color
    };
}

export async function getDiscordToken(code: string, env: any) {
    const data = new URLSearchParams({
        client_id: env.DISCORD_APPLICATION_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.DISCORD_REDIRECT_URI,
    });

    const response = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        body: data,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });

    if (response.ok) {
        return await response.json();
    }
    return null;
}

export async function getDiscordUser(accessToken: string) {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
    if (response.ok) {
        return await response.json();
    }
    return null;
}

export async function getGuildMember(guildId: string, userId: string, env: any) {
    // We use the BOT token here to check the user's roles in the guild
    try {
        const res = await discordRequest(env, `guilds/${guildId}/members/${userId}`, { method: 'GET' });
        return await res.json();
    } catch (e) {
        return null;
    }
}

export function generateDashboardHtml(tickets: any[], user: any) {
    const ticketList = tickets.map(t => `
        <div class="ticket">
            <div class="ticket-info">
                <h3>${t.channelName}</h3>
                <p><strong>Product:</strong> ${t.product || 'Not specified'}</p>
                <p><strong>Issue:</strong> ${t.description || 'No description provided'}</p>
                <p>Created by: ${t.userId}</p>
                <p>Status: Active</p>
                <a href="https://discord.com/channels/${t.guildId}/${t.channelId}" target="_blank">Open in Discord</a>
            </div>
            <div class="ticket-actions">
                <form action="/dashboard/close" method="POST" onsubmit="return confirm('Are you sure you want to close this ticket?');">
                    <input type="hidden" name="channelId" value="${t.channelId}">
                    <button type="submit" class="btn-close">Close Ticket</button>
                </form>
            </div>
        </div>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ticket Dashboard</title>
    <style>
        body { font-family: sans-serif; padding: 20px; background-color: #f0f0f0; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .ticket { border: 1px solid #ccc; padding: 15px; margin-bottom: 10px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center; }
        .ticket h3 { margin: 0 0 10px 0; }
        .btn-close { background-color: #d9534f; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; font-size: 14px; }
        .btn-close:hover { background-color: #c9302c; }
        a { color: #5865F2; text-decoration: none; margin-right: 15px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Ticket Dashboard</h1>
            <div>Logged in as: ${user.username}</div>
        </div>
        <h2>Active Tickets</h2>
        <div id="ticket-list">
            ${ticketList || '<p>No active tickets.</p>'}
        </div>
    </div>
</body>
</html>
    `;
}