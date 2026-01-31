/**
 * Blindsoft Ticket Bot
 * Copyright (C) 2026 Blindsoft Enterprises
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

export const COMMANDS = [
  {
    name: 'panel',
    description: 'Send the Ticket Creation Panel to this channel',
    default_member_permissions: '8', // Administrator only
  },
  {
    name: 'config',
    description: 'Configure bot settings',
    default_member_permissions: '8', // Administrator only
    options: [
      {
        name: 'role',
        description: 'Set the Support/Controller Role ID',
        type: 1, // SUB_COMMAND
        options: [
            {
                name: 'id',
                description: 'The Role ID',
                type: 3, // STRING
                required: true
            }
        ]
      },
      {
        name: 'logs',
        description: 'Set the Channel ID for ticket logs/transcripts',
        type: 1, // SUB_COMMAND
        options: [
            {
                name: 'channel',
                description: 'The Channel ID',
                type: 7, // CHANNEL
                required: true
            }
        ]
      }
    ]
  },
  {
    name: 'add',
    description: 'Add a user or a product',
    options: [
        {
            name: 'user',
            description: 'Add a user to this ticket',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'user',
                    description: 'The user to add',
                    type: 6, // USER
                    required: true
                }
            ]
        },
        {
            name: 'product',
            description: 'Add a new product to the selection list',
            type: 1, // SUB_COMMAND
            default_member_permissions: '8', // Admin only
            options: [
                {
                    name: 'name',
                    description: 'The name of the product',
                    type: 3, // STRING
                    required: true
                }
            ]
        }
    ]
  },
  {
    name: 'close',
    description: 'Close this ticket',
    type: 1,
  }
];
