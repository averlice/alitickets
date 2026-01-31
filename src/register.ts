/**
 * Blindsoft Ticket Bot
 * Copyright (C) 2026 Blindsoft Enterprises
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { discordRequest } from './utils.js';
import { COMMANDS } from './commands.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.dev.vars' }); 

// This file is meant to be run locally to register commands
// You need .dev.vars file with DISCORD_TOKEN and DISCORD_APPLICATION_ID

const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;

if (!token || !applicationId) {
  console.error('Missing DISCORD_TOKEN or DISCORD_APPLICATION_ID in .dev.vars');
  process.exit(1);
}

async function registerCommands() {
  const url = `applications/${applicationId}/commands`;
  console.log(`Registering commands to ${url}...`);
  try {
    const response = await fetch(`https://discord.com/api/v10/${url}`, {
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bot ${token}`,
        },
        method: "PUT",
        body: JSON.stringify(COMMANDS),
    });

    if (response.ok) {
        console.log('Registered all commands');
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } else {
        console.error('Error registering commands');
        const text = await response.text();
        console.error(text);
    }
  } catch (error) {
    console.error(error);
  }
}

registerCommands();
