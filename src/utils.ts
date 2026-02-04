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
    try {
        const res = await discordRequest(env, `guilds/${guildId}/members/${userId}`, { method: 'GET' });
        return await res.json();
    } catch (e) {
        return null;
    }
}

function generateNav(isAdmin: boolean) {
    return `
        <nav style="margin-bottom: 20px; padding: 10px; background: #eee; border-radius: 5px;">
            <a href="/dashboard" style="margin-right: 15px; font-weight: bold;">Main Dashboard</a>
            <a href="/dev" style="margin-right: 15px; font-weight: bold;">Developer Dashboard</a>
            ${isAdmin ? `<a href="/admin" style="font-weight: bold; color: #d9534f;">Admin Panel</a>` : ''}
        </nav>
    `;
}

export function generateDashboardHtml(tickets: any[], user: any, isAdmin: boolean = false) {
    const ticketList = tickets.map(t => `
        <div class="ticket">
            <div class="ticket-info">
                <h3>${t.channelName}</h3>
                <p><strong>Product:</strong> ${t.product || 'Not specified'}</p>
                <p><strong>Issue:</strong> ${t.description || 'No description provided'}</p>
                <p>Created by: ${t.userId}</p>
                <p>Status: Active</p>
                <div class="links">
                    <a href="https://discord.com/channels/${t.guildId}/${t.channelId}" target="_blank">Open in Discord</a>
                    <a href="/dashboard/summarize?channelId=${t.channelId}" class="btn-summarize">Summarize & Chat</a>
                </div>
            </div>
            <div class="ticket-actions">
                <form action="/dashboard/forward" method="POST" style="display:inline;">
                    <input type="hidden" name="channelId" value="${t.channelId}">
                    <button type="submit" class="btn-forward">Forward to Dev</button>
                </form>
                <form action="/dashboard/close" method="POST" onsubmit="return confirm('Are you sure you want to close this ticket?');" style="display:inline;">
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
        .btn-forward { background-color: #f0ad4e; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; font-size: 14px; margin-right: 5px; }
        .btn-forward:hover { background-color: #ec971f; }
        .btn-summarize { background-color: #5bc0de; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; font-size: 14px; text-decoration: none; display: inline-block; }
        .btn-summarize:hover { background-color: #31b0d5; }
        a { color: #5865F2; text-decoration: none; margin-right: 15px; }
        .links { margin-top: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Ticket Dashboard</h1>
            <div>Logged in as: ${user.username}</div>
        </div>
        ${generateNav(isAdmin)}
        <h2>Active Tickets</h2>
        <div id="ticket-list">
            ${ticketList || '<p>No active tickets.</p>'}
        </div>
    </div>
</body>
</html>
    `;
}

export function generateSummaryHtml(ticket: any, summary: string, channelId: string) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ticket Summary & Chat</title>
    <style>
        body { font-family: sans-serif; padding: 20px; background-color: #f0f0f0; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .summary-box { background: #e7f3ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 5px solid #2196F3; }
        #chat-window { height: 300px; border: 1px solid #ccc; overflow-y: scroll; padding: 10px; margin-bottom: 10px; display: flex; flex-direction: column; }
        .msg { margin-bottom: 10px; padding: 8px; border-radius: 5px; max-width: 80% }
        .user-msg { background: #DCF8C6; align-self: flex-end; }
        .ai-msg { background: #f1f0f0; align-self: flex-start; }
        .chat-input-area { display: flex; gap: 10px; }
        input[type="text"] { flex-grow: 1; padding: 10px; border: 1px solid #ccc; border-radius: 5px; }
        button { padding: 10px 20px; background: #5865F2; color: white; border: none; border-radius: 5px; cursor: pointer; }
        .thinking { font-style: italic; color: #888; font-size: 0.9em; margin-bottom: 5px; display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Ticket: ${ticket.channelName}</h1>
        <p><strong>Product:</strong> ${ticket.product}</p>
        
        <h2>AI Summary</h2>
        <div class="summary-box">
            ${summary.replace(/\n/g, '<br>')}
        </div>

        <h2>Chat with AI Assistant</h2>
        <div id="chat-window">
            <div class="msg ai-msg">Hello! I've read the ticket transcript. Ask me anything about this issue.</div>
        </div>
        
        <div class="chat-input-area">
            <input type="text" id="user-input" placeholder="Ask a question about this ticket...">
            <button onclick="sendMessage()">Send</button>
        </div>
        
        <p><a href="/dashboard">← Back to Dashboard</a></p>
    </div>

    <script>
        const chatWindow = document.getElementById('chat-window');
        const userInput = document.getElementById('user-input');

        async function sendMessage() {
            const text = userInput.value.trim();
            if (!text) return;

            // Add user message to UI
            addMessage(text, 'user-msg');
            userInput.value = '';

            // Add "AI is thinking" placeholder
            const aiMsgDiv = document.createElement('div');
            aiMsgDiv.className = 'msg ai-msg';
            aiMsgDiv.innerHTML = '<span class="thinking">AI is thinking...</span>';
            chatWindow.appendChild(aiMsgDiv);
            chatWindow.scrollTop = chatWindow.scrollHeight;

            try {
                const res = await fetch('/dashboard/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        channelId: '${channelId}',
                        question: text
                    })
                });
                const data = await res.json();
                
                // Remove thinking and add response
                aiMsgDiv.innerHTML = data.response.replace(/\\n/g, '<br>');
                chatWindow.scrollTop = chatWindow.scrollHeight;
            } catch (e) {
                aiMsgDiv.innerHTML = 'Error: Failed to get response from AI.';
            }
        }

        function addMessage(text, className) {
            const div = document.createElement('div');
            div.className = 'msg ' + className;
            div.innerText = text;
            chatWindow.appendChild(div);
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }

        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    </script>
</body>
</html>
    `;
}

export function generateAdminDashboardHtml(config: any, products: string[], user: any) {
    const productList = products.map(p => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
            <span>${p}</span>
            <form action="/admin/products/delete" method="POST" style="margin:0;">
                <input type="hidden" name="productName" value="${p}">
                <button type="submit" style="color: red; border: none; background: none; cursor: pointer;">Delete</button>
            </form>
        </div>
    `).join('') || '<p>No products added.</p>';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Panel - Blindsoft Ticket Bot</title>
    <style>
        body { font-family: sans-serif; padding: 20px; background-color: #f8f9fa; }
        .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .section { margin-bottom: 30px; padding: 20px; border: 1px solid #e1e4e8; border-radius: 8px; }
        h2 { margin-top: 0; color: #333; border-bottom: 2px solid #5865F2; padding-bottom: 5px; }
        .config-item { margin-bottom: 10px; }
        .config-item label { font-weight: bold; display: block; margin-bottom: 5px; }
        .config-item input { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        button { padding: 10px 20px; background: #5865F2; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
        button:hover { background: #4752c4; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Admin Control Panel</h1>
        <div>Logged in as: <strong>${user.username}</strong></div>
        ${generateNav(true)}

        <div class="section">
            <h2>Bot Configuration</h2>
            <form action="/admin/config/update" method="POST">
                <div class="config-item">
                    <label>Guild ID</label>
                    <input type="text" name="guild_id" value="${config.guild_id || ''}" readonly style="background: #f0f0f0;">
                </div>
                <div class="config-item">
                    <label>Support Role ID</label>
                    <input type="text" name="support_role" value="${config.support_role || ''}">
                </div>
                <div class="config-item">
                    <label>Log Channel ID</label>
                    <input type="text" name="log_channel" value="${config.log_channel || ''}">
                </div>
                <div class="config-item">
                    <label>Developer Role ID</label>
                    <input type="text" name="dev_role" value="${config.dev_role || ''}">
                </div>
                <button type="submit">Update Configuration</button>
            </form>
        </div>

        <div class="section">
            <h2>Product Management</h2>
            <div style="margin-bottom: 20px;">
                ${productList}
            </div>
            <form action="/admin/products/add" method="POST" style="display: flex; gap: 10px;">
                <input type="text" name="productName" placeholder="New product name..." required style="flex-grow: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                <button type="submit">Add Product</button>
            </form>
        </div>

        <div class="section">
            <h2>Global Stats</h2>
            <p>Total Tickets Ever Opened: <strong>${config.ticket_count || 0}</strong></p>
        </div>
    </div>
</body>
</html>
    `;
}