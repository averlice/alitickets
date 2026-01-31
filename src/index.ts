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
import { verifyDiscordRequest, discordRequest, createEmbed, getDiscordToken, getDiscordUser, getGuildMember, generateDashboardHtml } from './utils.js';
import { InteractionType, InteractionResponseType, ButtonStyle, ComponentType, MessageFlags, TextInputStyle } from 'discord-api-types/v10';

type Bindings = {
  TICKET_DB: KVNamespace;
  DISCORD_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;
};

const app = new Hono<{ Bindings: Bindings }>();

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
    return c.redirect('/dashboard');
});

app.get('/dashboard', async (c) => {
    const userId = getCookie(c, 'user_id');
    const username = getCookie(c, 'username');
    if (!userId) return c.redirect('/auth/login');
    const guildId = await c.env.TICKET_DB.get('config:guild_id');
    const supportRoleId = await c.env.TICKET_DB.get('config:support_role');
    if (!guildId) return c.text('Bot not configured yet.', 400);
    const member: any = await getGuildMember(guildId, userId, c.env);
    if (!member) return c.text('Access Denied.', 403);
    const isAdmin = (BigInt(member.permissions || 0) & BigInt(8)) === BigInt(8);
    const hasRole = member.roles.includes(supportRoleId);
    if (!hasRole && !isAdmin) return c.text('Access Denied.', 403);

    const activeTicketsRaw = await c.env.TICKET_DB.get('tickets:active');
    const activeTicketIds: string[] = activeTicketsRaw ? JSON.parse(activeTicketsRaw) : [];
    const tickets = [];
    for (const id of activeTicketIds) {
        const meta = await c.env.TICKET_DB.get(`ticket:${id}`);
        if (meta) tickets.push(JSON.parse(meta));
    }
    return c.html(generateDashboardHtml(tickets, { username }));
});

app.post('/dashboard/close', async (c) => {
    const userId = getCookie(c, 'user_id');
    if (!userId) return c.redirect('/auth/login');
    const body = await c.req.parseBody();
    const channelId = body['channelId'];
    if (!channelId || typeof channelId !== 'string') return c.text('Invalid Channel ID', 400);
    const guildId = await c.env.TICKET_DB.get('config:guild_id');
    const supportRoleId = await c.env.TICKET_DB.get('config:support_role');
    const member: any = await getGuildMember(guildId as string, userId, c.env);
    const isAdmin = (BigInt(member?.permissions || 0) & BigInt(8)) === BigInt(8);
    const hasRole = member?.roles?.includes(supportRoleId);
    if (!hasRole && !isAdmin) return c.text('Access Denied', 403);
    await closeTicket(channelId, userId, c.env);
    return c.redirect('/dashboard');
});

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
            formData.append('payload_json', JSON.stringify({
                content: `🔒 **Ticket Closed**\n**Ticket:** ${meta.channelName}\n**Product:** ${meta.product || 'N/A'}\n**Opened By:** <@${meta.userId}>\n**Closed By:** <@${closerId}>`,
            }));
            formData.append('files[0]', transcriptFile, `${meta.channelName}-transcript.txt`);
            await fetch(`https://discord.com/api/v10/channels/${logChannelId}/messages`, { method: 'POST', headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` }, body: formData });
        } catch (e) { console.error('Failed to send transcript:', e); }
    }
    const activeTicketsRaw = await env.TICKET_DB.get('tickets:active');
    let activeTicketIds: string[] = activeTicketsRaw ? JSON.parse(activeTicketsRaw) : [];
    activeTicketIds = activeTicketIds.filter((id: string) => id !== channelId);
    await env.TICKET_DB.put('tickets:active', JSON.stringify(activeTicketIds));
    await env.TICKET_DB.delete(`ticket:${channelId}`);
    await discordRequest(env, `channels/${channelId}`, { method: 'DELETE' });
}

app.post('/', async (c) => {
  const { isValid, interaction } = await verifyDiscordRequest(c.req.raw, c.env);
  if (!isValid || !interaction) return c.text('Invalid signature', 401);

  if (interaction.type === InteractionType.Ping) return c.json({ type: InteractionResponseType.Pong });

  if (interaction.type === InteractionType.ApplicationCommand) {
    const { name, options } = interaction.data;
    
    if (name === 'config') {
        await c.env.TICKET_DB.put('config:guild_id', interaction.guild_id);
        const subcommand = options[0];
        if (subcommand.name === 'role') {
            const roleId = subcommand.options[0].value;
            await c.env.TICKET_DB.put('config:support_role', roleId);
            return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: `✅ Support Role set to <@&${roleId}>`, flags: MessageFlags.Ephemeral }});
        }
        if (subcommand.name === 'logs') {
            const channelId = subcommand.options[0].value;
            await c.env.TICKET_DB.put('config:log_channel', channelId);
            return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: `✅ Transcripts set to <#${channelId}>`, flags: MessageFlags.Ephemeral }});
        }
    }

    if (name === 'add') {
        const subcommand = options[0];
        if (subcommand.name === 'product') {
            const prodName = subcommand.options[0].value;
            const prodsRaw = await c.env.TICKET_DB.get('config:products');
            const prods: string[] = prodsRaw ? JSON.parse(prodsRaw) : [];
            if (!prods.includes(prodName)) {
                prods.push(prodName);
                await c.env.TICKET_DB.put('config:products', JSON.stringify(prods));
            }
            return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: `✅ Product "${prodName}" added.`, flags: MessageFlags.Ephemeral }});
        }
        if (subcommand.name === 'user') {
            const userId = subcommand.options[0].value;
            await discordRequest(c.env, `channels/${interaction.channel.id}/permissions/${userId}`, { method: 'PUT', body: { allow: '1024', type: 1 } });
            return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: `✅ Added <@${userId}> to the ticket.` }});
        }
    }

    if (name === 'panel') {
        return c.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                embeds: [createEmbed('Blindsoft Enterprises Support', 'Need support? Click the button below to start.', 0x5865F2)],
                components: [{ type: ComponentType.ActionRow, components: [{ type: ComponentType.Button, style: ButtonStyle.Primary, label: 'Open Ticket', custom_id: 'create_ticket', emoji: { name: '📩' } }] }]
            }
        });
    }

    if (name === 'close') {
        await closeTicket(interaction.channel.id, interaction.member.user.id, c.env);
        return c.json({ type: InteractionResponseType.DeferredChannelMessageWithSource });
    }
  }

  if (interaction.type === InteractionType.MessageComponent) {
    if (interaction.data.custom_id === 'create_ticket') {
        const prodsRaw = await c.env.TICKET_DB.get('config:products');
        const prods: string[] = prodsRaw ? JSON.parse(prodsRaw) : [];
        
        if (prods.length === 0) {
            return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: "No products configured. Ask an admin to use `/add product`.", flags: MessageFlags.Ephemeral }}
            );
        }

        return c.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                content: "Which product do you need help with?",
                flags: MessageFlags.Ephemeral,
                components: [
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.StringSelect,
                                custom_id: 'select_product',
                                options: prods.map(p => ({ label: p, value: p }))
                            }
                        ]
                    }
                ]
            }
        });
    }

    if (interaction.data.custom_id === 'select_product') {
        const product = interaction.data.values[0];
        return c.json({
            type: InteractionResponseType.Modal,
            data: {
                title: 'Ticket Details',
                custom_id: `ticket_modal:${product}`,
                components: [
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.TextInput,
                                custom_id: 'issue_description',
                                label: 'Describe your issue',
                                style: TextInputStyle.Paragraph,
                                placeholder: 'e.g. For whatever reason, WFR command is not working',
                                required: true
                            }
                        ]
                    }
                ]
            }
        });
    }

    if (interaction.data.custom_id === 'close_ticket_btn') {
         await closeTicket(interaction.channel.id, interaction.member.user.id, c.env);
         return c.json({ type: InteractionResponseType.DeferredMessageUpdate });
    }
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    if (interaction.data.custom_id.startsWith('ticket_modal:')) {
        const product = interaction.data.custom_id.split(':')[1];
        const description = interaction.data.components[0].components[0].value;
        const userId = interaction.member.user.id;
        const supportRoleId = await c.env.TICKET_DB.get('config:support_role');

        let count = await c.env.TICKET_DB.get('ticket_count') || '0';
        const newCount = parseInt(count) + 1;
        await c.env.TICKET_DB.put('ticket_count', newCount.toString());

        const channelName = `ticket-${newCount.toString().padStart(4, '0')}`;
        const overwrites = [
            { id: interaction.guild_id, type: 0, deny: '1024' },
            { id: userId, type: 1, allow: '3072' },
            { id: c.env.DISCORD_APPLICATION_ID, type: 1, allow: '3072' }
        ];
        if (supportRoleId) overwrites.push({ id: supportRoleId, type: 0, allow: '3072' });

        try {
            const channelRes = await discordRequest(c.env, `guilds/${interaction.guild_id}/channels`, { method: 'POST', body: { name: channelName, type: 0, permission_overwrites: overwrites } });
            const channel: any = await channelRes.json();

            const activeTicketsRaw = await c.env.TICKET_DB.get('tickets:active');
            const activeTicketIds: string[] = activeTicketsRaw ? JSON.parse(activeTicketsRaw) : [];
            activeTicketIds.push(channel.id);
            await c.env.TICKET_DB.put('tickets:active', JSON.stringify(activeTicketIds));
            await c.env.TICKET_DB.put(`ticket:${channel.id}`, JSON.stringify({ 
                channelId: channel.id, channelName, userId, guildId: interaction.guild_id, product, description, createdAt: new Date().toISOString() 
            }));

            await discordRequest(c.env, `channels/${channel.id}/messages`, { method: 'POST', body: { 
                content: `<@${userId}>`, 
                embeds: [
                    {
                        title: `Ticket #${newCount}`,
                        color: 0x5865F2,
                        fields: [
                            { name: 'Product', value: product, inline: true },
                            { name: 'Issue Description', value: description }
                        ],
                        footer: { text: 'Support will be with you shortly.' }
                    }
                ], 
                components: [{ type: ComponentType.ActionRow, components: [{ type: ComponentType.Button, style: ButtonStyle.Danger, label: 'Close Ticket', custom_id: 'close_ticket_btn', emoji: { name: '🔒' } }] }]
            } });

            return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: `✅ Ticket created: <#${channel.id}>`, flags: MessageFlags.Ephemeral } });
        } catch (e: any) {
            return c.json({ type: InteractionResponseType.ChannelMessageWithSource, data: { content: `Error: ${e.message}`, flags: MessageFlags.Ephemeral } });
        }
    }
  }

  return c.text('Unknown interaction', 400);
});

export default app;