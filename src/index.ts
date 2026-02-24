/**
 * Blindsoft Ticket Bot
 * Copyright (C) 2026 Blindsoft Enterprises
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie'
import { verifyDiscordRequest, discordRequest, createEmbed, getDiscordToken, getDiscordUser, getGuildMember, getGuild, generateDashboardHtml, generateSummaryHtml, generateAdminDashboardHtml, generatePortalHtml, generatePortalTicketViewHtml } from './utils.js';
import { InteractionType, InteractionResponseType, ButtonStyle, ComponentType, MessageFlags, TextInputStyle } from 'discord-api-types/v10';

type Bindings = {
  TICKET_DB: KVNamespace;
  DISCORD_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;
  AI: any;
};

const app = new Hono<{ Bindings: Bindings }>();

// Middleware: Execution Timing & Early Hints
app.use('*', async (c, next) => {
    const start = Date.now();
    c.header('Link', '</assets/style.css>; rel=preload; as=style', { append: true });
    await next();
    const ms = Date.now() - start;
    c.header('X-Response-Time', `${ms}ms`);
});

// OAuth2 Routes
app.get('/auth/login', (c) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${c.env.DISCORD_APPLICATION_ID}&redirect_uri=${encodeURIComponent(c.env.DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    return c.redirect(url);
});

app.get('/auth/callback', async (c) => {
    const code = c.req.query('code');
    if (!code) return c.text('No code provided', 400);
    const tokens: any = await getDiscordToken(code, c.env);
    if (!tokens) return c.text('Failed to fetch tokens', 500);
    const user: any = await getDiscordUser(tokens.access_token);
    if (!user) return c.text('Failed to fetch user', 500);
    setCookie(c, 'user_id', user.id);
    setCookie(c, 'username', user.username);
    setCookie(c, 'access_token', tokens.access_token);
    return c.redirect('/');
});

async function checkAuth(c: any) {
    const userId = getCookie(c, 'user_id');
    if (!userId) return null;
    
    const BOT_OWNER_ID = '1365401272798281850';
    const guildId = await c.env.TICKET_DB.get('config:guild_id');
    
    // If we have a guild ID, do deep check. Otherwise, just basic user info.
    if (!guildId) return { userId, username: getCookie(c, 'username'), isAdmin: userId === BOT_OWNER_ID, member: null };

    const [member, guild]: any[] = await Promise.all([
        getGuildMember(guildId, userId, c.env),
        getGuild(guildId, c.env)
    ]);

    // OWNERSHIP CHECK: Priority 1
    const isOwner = (userId === BOT_OWNER_ID) || (guild && userId === guild.owner_id);
    
    return {
        userId,
        username: getCookie(c, 'username'),
        member,
        isAdmin: isOwner
    };
}

// User Portal (Home)
app.get('/', async (c) => {
    const auth = await checkAuth(c);
    if (!auth) return c.html(generatePortalHtml(null, [], []));

    const activeTicketsRaw = await c.env.TICKET_DB.get('tickets:active');
    const activeTicketIds: string[] = activeTicketsRaw ? JSON.parse(activeTicketsRaw) : [];
    const userTickets = [];
    for (const id of activeTicketIds) {
        const metaRaw = await c.env.TICKET_DB.get(`ticket:${id}`);
        if (metaRaw) {
            const meta = JSON.parse(metaRaw);
            if (meta.userId === auth.userId) userTickets.push(meta);
        }
    }

    const prodsRaw = await c.env.TICKET_DB.get('config:products');
    const products = prodsRaw ? JSON.parse(prodsRaw) : [];

    return c.html(generatePortalHtml({ username: auth.username }, userTickets, products));
});

// Create Ticket via Web
app.post('/portal/create', async (c) => {
    const auth = await checkAuth(c);
    if (!auth) return c.redirect('/auth/login');

    const body = await c.req.parseBody();
    const product = body.product as string;
    const description = body.description as string;
    const guildId = await c.env.TICKET_DB.get('config:guild_id');

    if (!guildId) return c.text('Bot not configured.', 500);

    const ticketId = await createDiscordTicket(guildId, auth.userId, product, description, c.env);
    if (ticketId) return c.redirect('/');
    return c.text('Failed to create ticket.', 500);
});

// View Transcript via Web
app.get('/portal/ticket/:id', async (c) => {
    const auth = await checkAuth(c);
    if (!auth) return c.redirect('/auth/login');

    const channelId = c.req.param('id');
    const metaRaw = await c.env.TICKET_DB.get(`ticket:${channelId}`);
    if (!metaRaw) return c.text('Ticket not found.', 404);
    const meta = JSON.parse(metaRaw);

    const supportRoleId = await c.env.TICKET_DB.get('config:support_role');
    const isStaff = auth.isAdmin || (supportRoleId && auth.member?.roles.includes(supportRoleId));
    if (meta.userId !== auth.userId && !isStaff) return c.text('Unauthorized.', 403);

    const messagesRes = await discordRequest(c.env, `channels/${channelId}/messages?limit=100`, { method: 'GET' });
    const messages = await messagesRes.json();

    return c.html(generatePortalTicketViewHtml(meta, messages));
});

// Staff Dashboard
app.get('/dashboard', async (c) => {
    const auth = await checkAuth(c);
    if (!auth) return c.redirect('/auth/login');
    const supportRoleId = await c.env.TICKET_DB.get('config:support_role');
    if (!auth.isAdmin && (!supportRoleId || !auth.member?.roles.includes(supportRoleId))) return c.text('Access Denied.', 403);

    const activeTicketsRaw = await c.env.TICKET_DB.get('tickets:active');
    const activeTicketIds: string[] = activeTicketsRaw ? JSON.parse(activeTicketsRaw) : [];
    const tickets = [];
    for (const id of activeTicketIds) {
        const meta = await c.env.TICKET_DB.get(`ticket:${id}`);
        if (meta) tickets.push(JSON.parse(meta));
    }
    return c.html(generateDashboardHtml(tickets, { username: auth.username }, auth.isAdmin));
});

// Dev Dashboard
app.get('/dev', async (c) => {
    const auth = await checkAuth(c);
    if (!auth) return c.redirect('/auth/login');
    const devRoleId = await c.env.TICKET_DB.get('config:dev_role');
    if (!auth.isAdmin && (!devRoleId || !auth.member?.roles.includes(devRoleId))) return c.text('Access Denied.', 403);

    const devTicketsRaw = await c.env.TICKET_DB.get('tickets:dev');
    const devTicketIds: string[] = devTicketsRaw ? JSON.parse(devTicketsRaw) : [];
    const tickets = [];
    for (const id of devTicketIds) {
        const meta = await c.env.TICKET_DB.get(`ticket:${id}`);
        if (meta) tickets.push(JSON.parse(meta));
    }
    return c.html(generateDashboardHtml(tickets, { username: auth.username }, auth.isAdmin));
});

// Admin Dashboard
app.get('/admin', async (c) => {
    const auth = await checkAuth(c);
    if (!auth) return c.redirect('/auth/login');
    if (!auth.isAdmin) return c.text(`Access Denied. Administrator permission required. Your ID: ${auth.userId}`, 403);

    const configKeys = ['config:guild_id', 'config:support_role', 'config:log_channel', 'config:dev_role', 'ticket_count'];
    const config: any = {};
    for (const key of configKeys) { config[key.replace('config:', '')] = await c.env.TICKET_DB.get(key); }
    const prodsRaw = await c.env.TICKET_DB.get('config:products');
    const products = prodsRaw ? JSON.parse(prodsRaw) : [];

    return c.html(generateAdminDashboardHtml(config, products, { username: auth.username }));
});

// Admin Actions
app.post('/admin/config/update', async (c) => {
    const auth = await checkAuth(c);
    if (!auth || !auth.isAdmin) return c.text('Unauthorized', 403);
    const body = await c.req.parseBody();
    if (body.support_role) await c.env.TICKET_DB.put('config:support_role', body.support_role as string);
    if (body.log_channel) await c.env.TICKET_DB.put('config:log_channel', body.log_channel as string);
    if (body.dev_role) await c.env.TICKET_DB.put('config:dev_role', body.dev_role as string);
    return c.redirect('/admin');
});

app.post('/admin/products/add', async (c) => {
    const auth = await checkAuth(c);
    if (!auth || !auth.isAdmin) return c.text('Unauthorized', 403);
    const body = await c.req.parseBody();
    const name = body.productName as string;
    if (name) {
        const prodsRaw = await c.env.TICKET_DB.get('config:products');
        const prods: string[] = prodsRaw ? JSON.parse(prodsRaw) : [];
        if (!prods.includes(name)) { prods.push(name); await c.env.TICKET_DB.put('config:products', JSON.stringify(prods)); }
    }
    return c.redirect('/admin');
});

app.post('/admin/products/delete', async (c) => {
    const auth = await checkAuth(c);
    if (!auth || !auth.isAdmin) return c.text('Unauthorized', 403);
    const body = await c.req.parseBody();
    const name = body.productName as string;
    if (name) {
        const prodsRaw = await c.env.TICKET_DB.get('config:products');
        let prods: string[] = prodsRaw ? JSON.parse(prodsRaw) : [];
        prods = prods.filter(p => p !== name);
        await c.env.TICKET_DB.put('config:products', JSON.stringify(prods));
    }
    return c.redirect('/admin');
});

// Ticket Helper Functions
async function createDiscordTicket(guildId: string, userId: string, product: string, description: string, env: any) {
    const supportRoleId = await env.TICKET_DB.get('config:support_role');
    let count = await env.TICKET_DB.get('ticket_count') || '0';
    const newCount = parseInt(count) + 1;
    await env.TICKET_DB.put('ticket_count', newCount.toString());

    const channelName = `ticket-${newCount.toString().padStart(4, '0')}`;
    const overwrites = [
        { id: guildId, type: 0, deny: '1024' },
        { id: userId, type: 1, allow: '3072' },
        { id: env.DISCORD_APPLICATION_ID, type: 1, allow: '3072' }
    ];
    if (supportRoleId) overwrites.push({ id: supportRoleId, type: 0, allow: '3072' });

    try {
        const channelRes = await discordRequest(env, `guilds/${guildId}/channels`, { method: 'POST', body: { name: channelName, type: 0, permission_overwrites: overwrites } });
        const channel: any = await channelRes.json();

        const activeTicketsRaw = await env.TICKET_DB.get('tickets:active');
        const activeTicketIds: string[] = activeTicketsRaw ? JSON.parse(activeTicketsRaw) : [];
        activeTicketIds.push(channel.id);
        await env.TICKET_DB.put('tickets:active', JSON.stringify(activeTicketIds));
        await env.TICKET_DB.put(`ticket:${channel.id}`, JSON.stringify({ channelId: channel.id, channelName, userId, guildId, product, description, createdAt: new Date().toISOString() }));

        await discordRequest(env, `channels/${channel.id}/messages`, { method: 'POST', body: { 
            content: `<@${userId}>`, 
            embeds: [{ title: `Ticket #${newCount}`, color: 0x5865F2, fields: [{ name: 'Product', value: product, inline: true }, { name: 'Issue Description', value: description }], footer: { text: 'Support will be with you shortly.' } }], 
            components: [{ type: ComponentType.ActionRow, components: [{ type: ComponentType.Button, style: ButtonStyle.Danger, label: 'Close Ticket', custom_id: 'close_ticket_btn', emoji: { name: '🔒' } }] }] 
        } });

        return channel.id;
    } catch (e) { return null; }
}

async function closeTicket(channelId: string, closerId: string, env: any) {
    const logChannelId = await env.TICKET_DB.get('config:log_channel');
    const ticketMetaRaw = await env.TICKET_DB.get(`ticket:${channelId}`);
    if (logChannelId && ticketMetaRaw) {
        const meta = JSON.parse(ticketMetaRaw);
        try {
            const messagesRes = await discordRequest(env, `channels/${channelId}/messages?limit=100`, { method: 'GET' });
            const messages = await messagesRes.json();
            const transcript = Array.isArray(messages) ? messages.reverse().map((m: any) => `[${new Date(m.timestamp).toLocaleString()}] ${m.author.username}: ${m.content}`).join('\n') : "No messages found.";
            const transcriptFile = new Blob([transcript], { type: 'text/plain' });
            const formData = new FormData();
            formData.append('payload_json', JSON.stringify({ content: `🔒 **Ticket Closed**\n**Ticket:** ${meta.channelName}\n**Product:** ${meta.product || 'N/A'}\n**Opened By:** <@${meta.userId}>\n**Closed By:** <@${closerId}>` }));
            formData.append('files[0]', transcriptFile, `${meta.channelName}-transcript.txt`);
            await fetch(`https://discord.com/api/v10/channels/${logChannelId}/messages`, { method: 'POST', headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` }, body: formData });
        } catch (e) { console.error(e); }
    }
    const activeTicketsRaw = await env.TICKET_DB.get('tickets:active');
    let activeTicketIds: string[] = activeTicketsRaw ? JSON.parse(activeTicketsRaw) : [];
    activeTicketIds = activeTicketIds.filter((id: string) => id !== channelId);
    await env.TICKET_DB.put('tickets:active', JSON.stringify(activeTicketIds));
    const devTicketsRaw = await env.TICKET_DB.get('tickets:dev');
    let devTicketIds: string[] = devTicketsRaw ? JSON.parse(devTicketsRaw) : [];
    devTicketIds = devTicketIds.filter((id: string) => id !== channelId);
    await env.TICKET_DB.put('tickets:dev', JSON.stringify(devTicketIds));
    await env.TICKET_DB.delete(`ticket:${channelId}`);
    await discordRequest(env, `channels/${channelId}`, { method: 'DELETE' });
}

// Bot Post Requests (Slash Commands & Interactions)
app.post('/', async (c) => {
  const start = Date.now();
  const { isValid, interaction } = await verifyDiscordRequest(c.req.raw, c.env);
  if (!isValid || !interaction) return c.text('Invalid signature', 401);
  if (interaction.type === InteractionType.Ping) return c.json({ type: InteractionResponseType.Pong });

  if (interaction.type === InteractionType.ApplicationCommand) {
    const { name, options } = interaction.data;

    if (name === 'ping') {
        const cf = (c.req.raw as any).cf;
        const rayId = c.req.header('cf-ray') || 'N/A';
        const protocol = cf?.httpProtocol || 'unknown';
        const colo = cf?.colo || 'unknown';
        const executionTime = Date.now() - start;
        
        return c.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                embeds: [{
                    title: '🏓 Pong!',
                    color: 0x00FF00,
                    fields: [
                        { name: 'Worker Latency', value: `\`${executionTime}ms\``, inline: true },
                        { name: 'Protocol', value: `\`${protocol}\``, inline: true },
                        { name: 'Colocation', value: `\`${colo}\``, inline: true },
                        { name: 'Ray ID', value: `\`${rayId}\`` },
                        { name: 'Gateway', value: '`Cloudflare Edge`', inline: true }
                    ],
                    footer: { text: 'Blindsoft Technical Metrics' }
                }]
            }
        });
    }

    if (name === 'config') {
        await c.env.TICKET_DB.put('config:guild_id', interaction.guild_id);
        const subcommand = options[0];
        if (subcommand.name === 'role') { await c.env.TICKET_DB.put('config:support_role', subcommand.options[0].value); return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: "✅ Support Role set.", flags: MessageFlags.Ephemeral }}); }
        if (subcommand.name === 'logs') { await c.env.TICKET_DB.put('config:log_channel', subcommand.options[0].value); return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: "✅ Logs set.", flags: MessageFlags.Ephemeral }}); }
        if (subcommand.name === 'devrole') { await c.env.TICKET_DB.put('config:dev_role', subcommand.options[0].value); return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: "✅ Dev Role set.", flags: MessageFlags.Ephemeral }}); }
    }
    if (name === 'add' && options[0].name === 'product') {
        const prodName = options[0].options[0].value;
        const prodsRaw = await c.env.TICKET_DB.get('config:products');
        const prods = prodsRaw ? JSON.parse(prodsRaw) : [];
        if (!prods.includes(prodName)) { prods.push(prodName); await c.env.TICKET_DB.put('config:products', JSON.stringify(prods)); }
        return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: `✅ Product added.`, flags: MessageFlags.Ephemeral }});
    }
    if (name === 'panel') return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { embeds: [createEmbed('Blindsoft Enterprises Support', 'Need support? Click below.', 0x5865F2)], components: [{ type: ComponentType.ActionRow, components: [{ type: ComponentType.Button, style: ButtonStyle.Primary, label: 'Open Ticket', custom_id: 'create_ticket', emoji: { name: '📩' } }] }] } });
    if (name === 'close') { await closeTicket(interaction.channel.id, interaction.member.user.id, c.env); return c.json({ type: InteractionResponseType.DeferredChannelMessageWithSource }); }
  }

  if (interaction.type === InteractionType.MessageComponent) {
    if (interaction.data.custom_id === 'create_ticket') {
        const prodsRaw = await c.env.TICKET_DB.get('config:products');
        const prods = prodsRaw ? JSON.parse(prodsRaw) : [];
        if (prods.length === 0) return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: "No products configured.", flags: MessageFlags.Ephemeral }});
        return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: "Which product?", flags: MessageFlags.Ephemeral, components: [{ type: ComponentType.ActionRow, components: [{ type: ComponentType.StringSelect, custom_id: 'select_product', options: prods.map((p:string) => ({ label: p, value: p })) }] }] } });
    }
    if (interaction.data.custom_id === 'select_product') return c.json({ type: InteractionResponseType.Modal, data: { title: 'Ticket Details', custom_id: `ticket_modal:${interaction.data.values[0]}`, components: [{ type: ComponentType.ActionRow, components: [{ type: ComponentType.TextInput, custom_id: 'issue_description', label: 'Describe your issue', style: TextInputStyle.Paragraph, required: true }] }] } });
    if (interaction.data.custom_id === 'close_ticket_btn') { await closeTicket(interaction.channel.id, interaction.member.user.id, c.env); return c.json({ type: InteractionResponseType.DeferredMessageUpdate }); }
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    const product = interaction.data.custom_id.split(':')[1];
    const description = interaction.data.components[0].components[0].value;
    await createDiscordTicket(interaction.guild_id, interaction.member.user.id, product, description, c.env);
    return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: `✅ Ticket created. Check your sidebar!`, flags: MessageFlags.Ephemeral } });
  }
  return c.text('Unknown interaction', 400);
});

// Staff Tool Routes (Summarize/Chat/Forward/Close)
app.get('/dashboard/summarize', async (c) => {
    const auth = await checkAuth(c);
    if (!auth) return c.redirect('/auth/login');
    const channelId = c.req.query('channelId');
    const metaRaw = await c.env.TICKET_DB.get(`ticket:${channelId}`);
    if (!metaRaw) return c.text('Ticket not found', 404);
    const meta = JSON.parse(metaRaw);
    try {
        const messagesRes = await discordRequest(c.env, `channels/${channelId}/messages?limit=100`, { method: 'GET' });
        const messages = await messagesRes.json();
        const transcript = Array.isArray(messages) ? messages.reverse().map((m: any) => `${m.author.username}: ${m.content}`).join('\n') : "No messages.";
        const aiResponse = await c.env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', { messages: [{ role: 'system', content: 'Summarize this ticket transcript. Final summary only.' }, { role: 'user', content: transcript }], max_tokens: 1024 });
        const summary = (aiResponse.response || aiResponse.answer).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        return c.html(generateSummaryHtml(meta, summary, channelId as string));
    } catch (e: any) { return c.text(`AI Error: ${e.message}`, 500); }
});

app.post('/dashboard/chat', async (c) => {
    const auth = await checkAuth(c);
    if (!auth) return c.json({ error: 'Unauthorized' }, 401);
    const { channelId, question } = await c.req.json();
    try {
        const messagesRes = await discordRequest(c.env, `channels/${channelId}/messages?limit=100`, { method: 'GET' });
        const transcript = (await messagesRes.json()).reverse().map((m: any) => `${m.author.username}: ${m.content}`).join('\n');
        const aiResponse = await c.env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', { messages: [{ role: 'system', content: `Analyze this transcript:\n${transcript}` }, { role: 'user', content: question }], max_tokens: 1024 });
        return c.json({ response: (aiResponse.response || aiResponse.answer).replace(/<think>[\s\S]*?<\/think>/g, '').trim() });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.post('/dashboard/forward', async (c) => {
    const auth = await checkAuth(c);
    if (!auth) return c.redirect('/auth/login');
    const body = await c.req.parseBody();
    const channelId = body['channelId'] as string;
    const devTicketsRaw = await c.env.TICKET_DB.get('tickets:dev');
    const devTicketIds = devTicketsRaw ? JSON.parse(devTicketsRaw) : [];
    if (!devTicketIds.includes(channelId)) { devTicketIds.push(channelId); await c.env.TICKET_DB.put('tickets:dev', JSON.stringify(devTicketIds)); }
    const devRoleId = await c.env.TICKET_DB.get('config:dev_role');
    if (devRoleId) await discordRequest(c.env, `channels/${channelId}/permissions/${devRoleId}`, { method: 'PUT', body: { allow: '3072', type: 0 } });
    await discordRequest(c.env, `channels/${channelId}/messages`, { method: 'POST', body: { content: "🚀 **Forwarded to Developers.**" } });
    return c.redirect('/dashboard');
});

app.post('/dashboard/close', async (c) => {
    const auth = await checkAuth(c);
    if (!auth) return c.redirect('/auth/login');
    const body = await c.req.parseBody();
    await closeTicket(body['channelId'] as string, auth.userId, c.env);
    return c.redirect('/dashboard');
});

export default app;
