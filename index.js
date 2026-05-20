require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { google } = require('googleapis');
const cron = require('node-cron');
const { createCanvas, loadImage, registerFont } = require('canvas');
registerFont('./Roboto-Bold.ttf', { family: 'Roboto', weight: 'bold' });
registerFont('./Roboto-Regular.ttf', { family: 'Roboto' });

// ---- MODULES ----
const db = require('./db');
const sprints = require('./sprints');
const leaderboard = require('./leaderboard');
const selfcare = require('./selfcare');
const sorting = require('./sorting');
const joins = require('./joins');
const sticky = require('./sticky');
const housePoints = require('./housePoints');
const { channelSprintTypes, fixedDurations, sprintVerbs, sprintHappyVerbs, sprintRoles, COMMON_ROOM_HOUSES, COMMON_ROOM_EMOJIS, CHECKIN_EMOJI, commonRoomMessageIds, monthNames } = require('./constants');

// ---- GOOGLE AUTH ----
async function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ---- CLIENT SETUP ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ]
});

// ---- INIT MODULES ----
sprints.init(client, getAuth);
leaderboard.init(client);
selfcare.init(client);
sorting.init(client);
joins.init(client);

// ---- GLOBAL ERROR HANDLERS ----
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('SIGTERM', async () => {
  console.log('[Shutdown] SIGTERM received — intentional shutdown.'); await db.pool.end();
  client.destroy();
  process.exit(0);
});

client.on('shardDisconnect', (event, id) => {
  console.log(`[Shard ${id}] Disconnected`, event);
});

client.on('shardReconnecting', (id) => {
  console.log(`[Shard ${id}] Reconnecting...`);
});

client.on('shardResume', (id) => {
  console.log(`[Shard ${id}] Resumed`);
});

// Heartbeat — logs every 5 minutes so we can confirm the bot is alive in Railway
setInterval(() => {
  console.log(`[Heartbeat] Bot alive at ${new Date().toISOString()}`);
}, 300000);

// ---- COMMAND REGISTRATION ----
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Show the current house points leaderboard')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('stick')
      .setDescription('Stick a message to this channel')
      .setDefaultMemberPermissions(8)
      .addStringOption(option =>
        option.setName('message')
          .setDescription('The message to stick')
          .setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('editstick')
      .setDescription('Edit the sticky message in this channel')
      .setDefaultMemberPermissions(8)
      .addStringOption(option =>
        option.setName('message')
          .setDescription('The new message')
          .setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('unstick')
      .setDescription('Remove the sticky message from this channel')
      .setDefaultMemberPermissions(8)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('sprint')
      .setDescription('Start a sprint in this channel')
      .addStringOption(opt =>
        opt.setName('input')
          .setDescription('Sprint length and delay to begin')
          .setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('schedule')
      .setDescription('Schedule a sprint')
      .addIntegerOption(opt =>
        opt.setName('number')
          .setDescription('Sprint number')
          .setRequired(true))
      .addIntegerOption(opt =>
        opt.setName('minutes')
          .setDescription('Duration in minutes')
          .setRequired(true))
      .addStringOption(opt =>
        opt.setName('time')
          .setDescription('Start time in BST/GMT')
          .setRequired(true))
      .addStringOption(opt =>
        opt.setName('date')
          .setDescription('Date in DD/MM/YYYY format. Leave blank for today.')
          .setRequired(false))
      .addRoleOption(opt =>
        opt.setName('pingrole')
          .setDescription('Role to ping for the 15 minute warning - defaults to Readathon')
          .setRequired(false))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('cancel')
      .setDescription('Cancel the active or upcoming sprint in this channel')
      .addIntegerOption(opt =>
        opt.setName('number')
          .setDescription('Readathon sprint number to cancel (optional)')
          .setRequired(false))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('join')
      .setDescription('Join the active sprint in this channel')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('time')
      .setDescription('Check how much time is left in the sprint')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('final')
      .setDescription('Submit your final minutes read count')
      .addIntegerOption(opt =>
        opt.setName('minutes')
          .setDescription('How many minutes did you participate?')
          .setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('leave')
      .setDescription('Leave the sprint without submitting a time')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('mystats')
      .setDescription('View your sprint stats')
      .addStringOption(opt =>
        opt.setName('period')
          .setDescription('The time period to view stats for')
          .setRequired(true)
          .addChoices(
            { name: 'Monthly', value: 'monthly' },
            { name: 'Yearly', value: 'yearly' },
            { name: 'Lifetime', value: 'lifetime' }
          ))
      .addStringOption(opt =>
        opt.setName('date')
          .setDescription('Retrieve stats for a specific period (i.e., April 2026 or 2026)')
          .setRequired(false))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('export')
      .setDescription('Export sprint data as a CSV')
      .addStringOption(opt =>
        opt.setName('period')
          .setDescription('The time period to export')
          .setRequired(true)
          .addChoices(
            { name: 'Monthly', value: 'monthly' },
            { name: 'Yearly', value: 'yearly' },
            { name: 'Lifetime', value: 'lifetime' }
          ))
      .addStringOption(opt =>
        opt.setName('date')
          .setDescription('Specific period (e.g., April 2026 or 2026) — leave blank for current month')
          .setRequired(false))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('scheduled')
      .setDescription('View all upcoming scheduled sprints')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('runselfcare')
      .setDescription('Manually run self-care points for a specific date')
      .addStringOption(opt =>
        opt.setName('date')
          .setDescription('Date in YYYY-MM-DD format (e.g. 2026-04-30)')
          .setRequired(true))
      .toJSON(),
    ...housePoints.commands.map(cmd => cmd.toJSON()),
  new SlashCommandBuilder()
        .setName('sortinglog')
        .setDescription('View sorting quiz submissions')
        .setDefaultMemberPermissions(8)
        .addIntegerOption(opt =>
            opt.setName('number')
            .setDescription('Submission number to view in full (optional)')
            .setRequired(false))
        .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
  console.log('All commands registered!');
}

// ---- BOT READY ----
client.once('clientReady', async () => {
  console.log(`Bot is online as ${client.user.tag}!`);
  await db.initializeDatabase();
  await registerCommands();
  await sprints.restoreSprintState();
  await joins.populateMembersIfEmpty();

  const storedMessages = await db.getCommonRoomMessages();
  for (const row of storedMessages) {
    commonRoomMessageIds[row.channel_id] = row.message_id;
  }
  console.log('Common room message IDs restored!');

sorting.startSortingListener();

// Tiny HTTP server for Railway healthcheck (enables zero-downtime deploys)
  const http = require('http');
  http.createServer((req, res) => {
    res.writeHead(200);
    res.end('ok');
  }).listen(process.env.PORT || 3000, () => {
    console.log('[Health] HTTP server listening for Railway healthcheck');
  });

  // House leaderboard — every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    leaderboard.postHouseLeaderboard();
  });

  // 7AM ET = 11:00 UTC — collect previous day's self-care points
  // Skips on the 1st of the month (last day handled by 11PM cron)
  cron.schedule('0 11 * * *', async () => {
    const easternTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    if (easternTime.getDate() === 1) {
      console.log('Skipping 7AM self-care cron — last day of previous month handled by 11PM cron.');
      return;
    }
    const yesterday = new Date(easternTime);
    yesterday.setDate(easternTime.getDate() - 1);
    const targetDate = yesterday.toISOString().split('T')[0];
    await selfcare.processSelfCarePoints(targetDate);
  });

  // 11PM ET on last day of month = 04:00 UTC next day
  cron.schedule('0 4 * * *', async () => {
    const easternTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const lastDayOfMonth = new Date(easternTime.getFullYear(), easternTime.getMonth() + 1, 0).getDate();
    if (easternTime.getDate() !== lastDayOfMonth) return;
    const targetDate = easternTime.toISOString().split('T')[0];
    await selfcare.processSelfCarePoints(targetDate);
  });

  // 8AM ET = 12:00 UTC — post common room messages
  cron.schedule('0 12 * * *', async () => {
    console.log('Posting common room messages...');
    for (const house of COMMON_ROOM_HOUSES) {
      try {
        const channel = await client.channels.fetch(house.channelId);
        const message = await channel.send(
          `Hello, <@&${house.roleId}>! Have you done these?\n**Please react to this message in order of the emojis shown!**\n*-# (If you haven't done them yet, but you know you will, you can still react)*\n\n__**Morning Tasks**__\n🪥 | Brushed your teeth?\n🛏️ | Made your bed?\n👑 | Styled your hair?\n💊 | Took medication?\n👕 | Got dressed?\n\n__**Evening Tasks**__\n🦷 | Brushed your teeth?\n⚕️ | Took additional medication?\n🚿 | Had a wash today? - includes washing hands, face etc.\n🥛 | Had a drink today?\n🍕 | Had a meal today?\n📖 | Read your book?\n\n**Also make sure to Check In!**\n${CHECKIN_EMOJI} | Check in\n\nRemember, we love you all and hope you have a wonderful day!\n♥️`
        );
        commonRoomMessageIds[house.channelId] = message.id;
        await db.saveCommonRoomMessage(house.channelId, message.id);
        for (const emoji of COMMON_ROOM_EMOJIS) {
          await message.react(emoji);
          await new Promise(res => setTimeout(res, 500));
        }
      } catch (err) {
        console.error(`Failed to post common room message for ${house.name}:`, err);
      }
    }
  });

  // 5PM ET = 21:00 UTC — remove bot reactions from common room messages
  cron.schedule('0 21 * * *', async () => {
    console.log('Removing common room reactions...');
    for (const house of COMMON_ROOM_HOUSES) {
      try {
        const messageId = commonRoomMessageIds[house.channelId];
        if (!messageId) {
          console.log(`No stored message ID for ${house.name}, skipping.`);
          continue;
        }
        const channel = await client.channels.fetch(house.channelId);
        const message = await channel.messages.fetch(messageId);
        for (const emoji of COMMON_ROOM_EMOJIS) {
          const reaction = message.reactions.cache.get(emoji);
          if (reaction) {
            await reaction.users.remove(client.user.id);
            await new Promise(res => setTimeout(res, 500));
          }
        }
        await new Promise(res => setTimeout(res, 2000));
      } catch (err) {
        console.error(`Failed to remove reactions for ${house.name}:`, err);
      }
    }
  });
});

// ---- INTERACTION HANDLER ----
client.on('interactionCreate', async interaction => {
  const channelId = interaction.channelId;

  // ---- BUTTON INTERACTIONS ----
  if (interaction.isButton()) {
    const { activeSprints, pendingSprints, cleanupSprint, postLeaderboard } = sprints;

    if (interaction.customId === 'confirm_cancel') {
      const sprint = activeSprints[channelId] || pendingSprints[channelId];
      if (!sprint) {
        await interaction.update({ content: 'No sprint to cancel!', components: [] });
        return;
      }
      await cleanupSprint(channelId);
      await db.deletePendingSprint(channelId);
      delete pendingSprints[channelId];
      const mentions = sprint.participants.map(id => `<@${id}>`).join(', ');
      await interaction.update({ content: `The **${sprint.type}** has been cancelled.${mentions ? ` ${mentions}` : ''}`, components: [] });
    }

    if (interaction.customId === 'deny_cancel') {
      const sprint = activeSprints[channelId] || pendingSprints[channelId];
      const happyVerb = sprint ? sprintHappyVerbs[sprint.type] : 'Happy reading!';
      await interaction.update({ content: `The sprint remains! ${happyVerb}`, components: [] });
    }

    if (interaction.customId.startsWith('confirm_final_')) {
      try {
        const parts = interaction.customId.split('_');
        const minutes = parseInt(parts[2]);
        const userId = parts[3];

        const sprint = activeSprints[channelId];
        if (!sprint) {
          await interaction.update({ content: 'That sprint has already ended!', components: [] });
          return;
        }

        if (!sprint.submittedUsers) sprint.submittedUsers = new Set();
        if (!sprint.originalParticipants) sprint.originalParticipants = new Set();
        sprint.finalTimes[userId] = minutes;
        sprint.submittedUsers.add(userId);
        sprint.originalParticipants.add(userId);
        sprint.participants = sprint.participants.filter(id => id !== userId);
        await db.saveActiveSprint(channelId, { ...sprint, guildId: interaction.guild.id });
        if (Date.now() >= sprint.endTime) {
          await db.saveEndingSprint(channelId, {
            guildId: interaction.guild.id,
            type: sprint.type,
            duration: sprint.duration,
            sprintNumber: sprint.sprintNumber,
            originalParticipants: sprint.originalParticipants,
            finalTimes: sprint.finalTimes,
            submittedUsers: sprint.submittedUsers,
            leaderboardAt: sprint.leaderboardAt
          });
        }

        await interaction.update({ content: `Got it! Your **${minutes} minutes** have been logged.`, components: [] });
        const sprintVerb = activeSprints[channelId] ? sprintVerbs[activeSprints[channelId].type] : 'read';
        await interaction.channel.send(`<@${userId}> has ${sprintVerb} for **${minutes} minutes**!`);

        const sprintEnded = Date.now() >= sprint.endTime;
        const allSubmitted = [...sprint.originalParticipants].every(id => sprint.submittedUsers.has(id));
        if (sprintEnded && allSubmitted && Object.keys(sprint.finalTimes).length > 0) {
          await postLeaderboard(channelId, interaction.guild);
        }
      } catch (error) {
        console.error('Error handling confirm_final button:', error);
      }
    }

    if (interaction.customId === 'deny_final') {
      await interaction.update({ content: `No worries, nothing was submitted!`, components: [] });
    }

    if (interaction.customId === 'confirm_leave') {
      try {
        const sprint = activeSprints[channelId] || pendingSprints[channelId];
        if (!sprint) {
          await interaction.update({ content: 'That sprint has already ended!', components: [] });
          return;
        }

        const userId = interaction.user.id;
        if (!sprint.participants.includes(userId)) {
          await interaction.update({ content: "You're already not in this sprint.", components: [] });
          return;
        }

        sprint.participants = sprint.participants.filter(id => id !== userId);
        if (activeSprints[channelId]) {
          if (sprint.originalParticipants) sprint.originalParticipants.delete(userId);
          await db.saveActiveSprint(channelId, { ...sprint, guildId: interaction.guild.id });
        } else if (pendingSprints[channelId]) {
          await db.savePendingSprint(channelId, sprint);
        }

        await interaction.update({ content: `You've been removed from the sprint. See you next time!`, components: [] });
        await interaction.channel.send(`<@${userId}> has left the **${sprint.type}**.`);
      } catch (error) {
        console.error('Error handling confirm_leave button:', error);
      }
    }

    if (interaction.customId === 'deny_leave') {
      await interaction.update({ content: `No problem! Use \`/final\` to submit your minutes when you're ready.`, components: [] });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  // ---- /leaderboard ----
if (interaction.commandName === 'leaderboard') {
  try {
    await interaction.deferReply();
    const housePoints = await leaderboard.getSheetData();
    const embed = leaderboard.buildLeaderboardEmbed(housePoints);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error handling leaderboard command:', error);
  }
}
  // ---- /mystats ----
  if (interaction.commandName === 'mystats') {
    try {
      await interaction.deferReply();
      const period = interaction.options.getString('period');
      const date = interaction.options.getString('date');
      const now = new Date();
      const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const currentMonth = monthNames[easternTime.getMonth()];
      const currentYear = easternTime.getFullYear();
      let month = date ? date.split(' ')[0] : currentMonth;
      let year;
      if (date) {
        const parts = date.split(' ');
        year = parseInt(parts.length === 1 ? parts[0] : parts[1]);
      } else {
        year = currentYear;
      }

      let result;
      if (period === 'monthly') {
        result = await db.pool.query(
          'SELECT * FROM sprint_results WHERE user_id = $1 AND EXTRACT(MONTH FROM sprint_date) = $2 AND EXTRACT(YEAR FROM sprint_date) = $3',
          [interaction.user.id, monthNames.indexOf(month) + 1, year]
        );
      } else if (period === 'yearly') {
        result = await db.pool.query(
          'SELECT * FROM sprint_results WHERE user_id = $1 AND EXTRACT(YEAR FROM sprint_date) = $2',
          [interaction.user.id, year]
        );
      } else {
        result = await db.pool.query(
          'SELECT * FROM sprint_results WHERE user_id = $1',
          [interaction.user.id]
        );
      }

      const sprintCount = result.rows.length;
      const totalMinutes = result.rows.reduce((sum, row) => sum + row.minutes, 0);
      console.log(`[mystats] ${interaction.user.username} requested ${period} stats${date ? ` for ${date}` : ''} — ${sprintCount} sprints, ${totalMinutes} minutes`);

      if (sprintCount === 0) {
        await interaction.editReply({ content: `You haven't participated in any sprints this period! Join us in <#${process.env.TALL_TOMES_CHANNEL_ID}> or <#${process.env.SHORT_STACKS_CHANNEL_ID}> to add to your stats!`, flags: 64 });
        return;
      }

      let chosenPeriod;
      if (period === 'monthly') chosenPeriod = `${month} ${year}`;
      else if (period === 'yearly') chosenPeriod = year;
      else chosenPeriod = null;

      const title = period === 'lifetime'
        ? `<a:book_pages:1506118494779998279> **${interaction.user.username}'s Lifetime Stats**`
        : `<a:book_pages:1506118494779998279> **${interaction.user.username}'s ${period.charAt(0).toUpperCase() + period.slice(1)} Stats for ${chosenPeriod}**`;

      await interaction.editReply({ content: `${title}\n\nYou've read **${totalMinutes.toLocaleString()} minutes** across **${sprintCount} sprints**!` });
    } catch (error) {
      console.error('Error handling mystats command:', error);
    }
  }

  // ---- /export ----
  if (interaction.commandName === 'export') {
    try {
      await interaction.deferReply({ flags: 64 });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const isMod = member.roles.cache.has(process.env.MOD_ROLE_ID);
      if (!isMod) {
        await interaction.editReply({ content: 'You do not have permission to use this command.' });
        return;
      }

      const period = interaction.options.getString('period');
      const date = interaction.options.getString('date');
      const now = new Date();
      const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const currentMonth = monthNames[easternTime.getMonth()];
      const currentYear = easternTime.getFullYear();
      let month = date ? date.split(' ')[0] : currentMonth;
      let year;
      if (date) {
        const parts = date.split(' ');
        year = parseInt(parts.length === 1 ? parts[0] : parts[1]);
      } else {
        year = currentYear;
      }

      let result;
      if (period === 'monthly') {
        result = await db.pool.query(
          'SELECT user_id, COUNT(*) as sprints_joined, SUM(minutes) as total_minutes FROM sprint_results WHERE EXTRACT(MONTH FROM sprint_date) = $1 AND EXTRACT(YEAR FROM sprint_date) = $2 GROUP BY user_id',
          [monthNames.indexOf(month) + 1, year]
        );
      } else if (period === 'yearly') {
        result = await db.pool.query(
          'SELECT user_id, COUNT(*) as sprints_joined, SUM(minutes) as total_minutes FROM sprint_results WHERE EXTRACT(YEAR FROM sprint_date) = $1 GROUP BY user_id',
          [year]
        );
      } else {
        result = await db.pool.query(
          'SELECT user_id, COUNT(*) as sprints_joined, SUM(minutes) as total_minutes FROM sprint_results GROUP BY user_id'
        );
      }

      if (result.rows.length === 0) {
        await interaction.editReply({ content: 'No sprint data found for that period.' });
        return;
      }

      const houseRoles = {
        [process.env.ASPHODEL_ROLE_ID]: 'Asphodel',
        [process.env.DREANNI_ROLE_ID]: 'Dreanni',
        [process.env.LAIIDON_ROLE_ID]: 'Laiidon',
        [process.env.ZELDARIAN_ROLE_ID]: 'Zeldarian',
      };

      const csvRows = ['user_id,username,house,sprints_joined,total_minutes'];
      for (const row of result.rows) {
        let username = row.user_id;
        let house = 'Unknown';
        try {
          const guildMember = await interaction.guild.members.fetch(row.user_id);
          username = guildMember.user.username;
          for (const [roleId, houseName] of Object.entries(houseRoles)) {
            if (guildMember.roles.cache.has(roleId)) {
              house = houseName;
              break;
            }
          }
        } catch {}
        csvRows.push(`${row.user_id},${username},${house},${row.sprints_joined},${row.total_minutes}`);
      }

      const csvContent = csvRows.join('\n');
      let periodLabel;
      if (period === 'monthly') periodLabel = `${month}_${year}`;
      else if (period === 'yearly') periodLabel = `${year}`;
      else periodLabel = 'lifetime';

      const attachment = new AttachmentBuilder(Buffer.from(csvContent, 'utf-8'), {
        name: `sprint_export_${periodLabel}.csv`
      });
      await interaction.editReply({ content: `Here is the sprint export for **${period === 'lifetime' ? 'Lifetime' : periodLabel.replace('_', ' ')}**!`, files: [attachment] });
    } catch (error) {
      console.error('Error handling export command:', error);
    }
  }

  // ---- /scheduled ----
  if (interaction.commandName === 'scheduled') {
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const isMod = member.roles.cache.has(process.env.MOD_ROLE_ID);
      if (!isMod) {
        await interaction.reply({ content: 'You do not have permission to use this command.', flags: 64 });
        return;
      }

      const { scheduledSprints } = sprints;
      const allScheduled = [];
      for (const [cId, sprintList] of Object.entries(scheduledSprints)) {
        for (const sprint of sprintList) {
          allScheduled.push({ ...sprint, channelId: cId });
        }
      }
      allScheduled.sort((a, b) => a.startTime - b.startTime);

      if (allScheduled.length === 0) {
        await interaction.reply({ content: 'There are no sprints currently scheduled.' });
        return;
      }

      const lines = allScheduled.map(s => {
        const timestamp = Math.floor(s.startTime / 1000);
        return `**#${s.number}** — <t:${timestamp}:t> — ${s.minutes}min`;
      });

      const chunks = [];
      let current = '📅 **Upcoming Scheduled Sprints:**\n\n';
      for (const line of lines) {
        if ((current + line + '\n').length > 1900) {
          chunks.push(current);
          current = '';
        }
        current += line + '\n';
      }
      if (current) chunks.push(current);

      await interaction.reply({ content: chunks[0] });
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({ content: chunks[i], flags: 64 });
      }
    } catch (error) {
      console.error('Error handling scheduled command:', error);
    }
  }

  // ---- /runselfcare ----
  if (interaction.commandName === 'runselfcare') {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isMod = member.roles.cache.has(process.env.MOD_ROLE_ID);
    if (!isMod) {
      await interaction.reply({ content: 'You do not have permission to use this command.', flags: 64 });
      return;
    }
    const date = interaction.options.getString('date');
    await interaction.reply({ content: `Running self-care points for ${date}...`, flags: 64 });
    await selfcare.processSelfCarePoints(date);
  }

  // ---- /addpoints, /removepoints, /pointslog ----
  if (interaction.commandName === 'addpoints') await housePoints.handleAddPoints(interaction);
  if (interaction.commandName === 'removepoints') await housePoints.handleRemovePoints(interaction);
  if (interaction.commandName === 'pointslog') await housePoints.handlePointsLog(interaction);

// ---- /sortinglog ----
  if (interaction.commandName === 'sortinglog') await sorting.handleSortingLog(interaction);

  // ---- /stick, /editstick, /unstick ----
  if (interaction.commandName === 'stick') await sticky.handleStick(interaction);
  if (interaction.commandName === 'editstick') await sticky.handleEditStick(interaction);
  if (interaction.commandName === 'unstick') await sticky.handleUnstick(interaction);

  // ---- /sprint ----
  if (interaction.commandName === 'sprint') {
    const { activeSprints, pendingSprints, startSprint, postSprintStart, randomEmoji } = sprints;
    const type = channelSprintTypes[channelId];
    if (!type) {
      await interaction.reply({ content: 'This channel isn\'t set up for sprints!', flags: 64 });
      return;
    }

    if (activeSprints[channelId] || pendingSprints[channelId]) {
      await interaction.reply({ content: `There's already a sprint running in this channel that will end <t:${Math.floor((activeSprints[channelId]?.endTime || pendingSprints[channelId]?.startsAt) / 1000)}:R>! If you'd like to join, use the \`/join\` command!`, flags: 64 });
      return;
    }

    const input = interaction.options.getString('input').trim().split(/\s+/);
    const inputMinutes = parseInt(input[0]);
    const startsIn = parseInt(input[1]) || 1;

    let minutes;
    if (fixedDurations[type]) {
      minutes = fixedDurations[type];
    } else {
      if (!inputMinutes || inputMinutes < 1 || inputMinutes > 60) {
        await interaction.reply({ content: `Please provide a duration between 15 and 60 minutes for a **${type}**!`, flags: 64 });
        return;
      }
      minutes = inputMinutes;
    }

    const startsAt = Date.now() + startsIn * 60 * 1000;
    const startsAtTimestamp = Math.floor(startsAt / 1000);
    const announceEmoji = randomEmoji(type);

    await interaction.reply(`${announceEmoji} **JOIN THE SPRINT** ${announceEmoji}\n\nThe next **${type}** runs for **${minutes} minutes** and will begin <t:${startsAtTimestamp}:R>.\n\nUse \`/join\` to join and \`/final\` if you have to leave early!`);

    pendingSprints[channelId] = {
      type,
      duration: minutes,
      startsAt,
      guildId: interaction.guild.id,
      participants: [],
      pendingTimer: setTimeout(async () => {
        const pending = pendingSprints[channelId];
        if (!pending?.guildId) {
          console.warn(`[Pending Sprint] Missing pending sprint for ${channelId}`);
          return;
        }
        const carriedParticipants = [...pending.participants];
        delete pendingSprints[channelId];
        const guild = client.guilds.cache.get(pending.guildId);
        await startSprint(channelId, type, minutes, null, carriedParticipants, guild);
        await postSprintStart(channelId);
      }, startsIn * 60 * 1000)
    };
    await db.savePendingSprint(channelId, pendingSprints[channelId]);
  }

  // ---- /schedule ----
  if (interaction.commandName === 'schedule') {
    const { activeSprints, pendingSprints, scheduledSprints, startSprint, postSprintStart } = sprints;
    const { parseTimeToUTC } = sprints;
    const type = channelSprintTypes[channelId];
    if (!type) {
      await interaction.reply({ content: 'This channel isn\'t set up for sprints!', flags: 64 });
      return;
    }

    const number = interaction.options.getInteger('number');
    const minutes = interaction.options.getInteger('minutes');
    const timeStr = interaction.options.getString('time');
    const dateStr = interaction.options.getString('date');
    const pingRole = interaction.options.getRole('pingrole');
    const roleId = pingRole ? pingRole.id : process.env.READATHON_ROLE_ID;

    const startTime = parseTimeToUTC(timeStr, dateStr);
    if (!startTime) {
      await interaction.reply({ content: 'Invalid time or date format! Use time like `3:00PM` or `15:00`, and date like `02/05/2026`.', flags: 64 });
      return;
    }

    const msUntilStart = startTime.getTime() - Date.now();
    const msUntilWarning = msUntilStart - 15 * 60 * 1000;
    const startTimestamp = Math.floor(startTime.getTime() / 1000);

    if (msUntilStart <= 0) {
      await interaction.reply({ content: 'That time has already passed!', flags: 64 });
      return;
    }

    if (!scheduledSprints[channelId]) scheduledSprints[channelId] = [];
    if (scheduledSprints[channelId].find(s => s.number === number)) {
      await interaction.reply({ content: `Readathon Sprint #${number} is already scheduled!`, flags: 64 });
      return;
    }

    if (msUntilWarning <= 0) {
      pendingSprints[channelId] = {
        type: 'Readathon Sprint',
        duration: minutes,
        startsAt: startTime.getTime(),
        guildId: interaction.guild.id,
        participants: [],
        sprintNumber: number,
        pendingTimer: null
      };
    }

    const warningTimer = msUntilWarning > 0 ? setTimeout(async () => {
      const channel = await client.channels.fetch(channelId);
      const warningTimestamp = Math.floor(startTime.getTime() / 1000);
      await channel.send(`<@&${roleId}> Readathon Sprint #${number} is starting <t:${warningTimestamp}:R>! Use \`/join\` to read with us!`);

      const scheduled = scheduledSprints[channelId]?.find(s => s.number === number);
      const carriedParticipants = scheduled?.participants || [];
      pendingSprints[channelId] = {
        type: 'Readathon Sprint',
        duration: minutes,
        startsAt: startTime.getTime(),
        guildId: interaction.guild.id,
        participants: [...carriedParticipants],
        sprintNumber: number,
        pendingTimer: setTimeout(async () => {
          const pending = pendingSprints[channelId];
          const carried = pending ? [...pending.participants] : [];
          delete pendingSprints[channelId];
          if (scheduledSprints[channelId]) {
            scheduledSprints[channelId] = scheduledSprints[channelId].filter(s => s.number !== number);
          }
          const guild = client.guilds.cache.get(interaction.guild.id);
          await startSprint(channelId, 'Readathon Sprint', minutes, number, carried, guild);
          await postSprintStart(channelId);
        }, 15 * 60 * 1000)
      };
      await db.savePendingSprint(channelId, pendingSprints[channelId]);
    }, msUntilWarning) : null;

    const pendingTimer = msUntilWarning <= 0 ? setTimeout(async () => {
      const pending = pendingSprints[channelId];
      const carried = pending ? [...pending.participants] : [];
      delete pendingSprints[channelId];
      if (scheduledSprints[channelId]) {
        scheduledSprints[channelId] = scheduledSprints[channelId].filter(s => s.number !== number);
      }
      const guild = client.guilds.cache.get(interaction.guild.id);
      await startSprint(channelId, 'Readathon Sprint', minutes, number, carried, guild);
      await postSprintStart(channelId);
    }, msUntilStart) : null;

    scheduledSprints[channelId].push({
      number,
      minutes,
      startTime: startTime.getTime(),
      guildId: interaction.guild.id,
      participants: [],
      warningTimer,
      pendingTimer
    });
    scheduledSprints[channelId].sort((a, b) => a.startTime - b.startTime);
    await db.saveScheduledSprint(channelId, scheduledSprints[channelId].find(s => s.number === number));
    await interaction.reply(`✅ Readathon Sprint #${number} scheduled for <t:${startTimestamp}:t>! It will post 15 minutes before its start time.`);
  }

  // ---- /cancel ----
  if (interaction.commandName === 'cancel') {
    const { activeSprints, pendingSprints, scheduledSprints, cleanupSprint } = sprints;
    const sprintNumber = interaction.options.getInteger('number');

    if (sprintNumber) {
      if (!scheduledSprints[channelId] || !scheduledSprints[channelId].find(s => s.number === sprintNumber)) {
        await interaction.reply({ content: `Readathon Sprint #${sprintNumber} isn't scheduled in this channel.`, flags: 64 });
        return;
      }
      const scheduled = scheduledSprints[channelId].find(s => s.number === sprintNumber);
      clearTimeout(scheduled.warningTimer);
      clearTimeout(scheduled.pendingTimer);
      scheduledSprints[channelId] = scheduledSprints[channelId].filter(s => s.number !== sprintNumber);
      if (pendingSprints[channelId]?.sprintNumber === sprintNumber) {
        clearTimeout(pendingSprints[channelId].pendingTimer);
        delete pendingSprints[channelId];
      }
      await db.deleteScheduledSprint(channelId, sprintNumber);
      const scheduledTimestamp = Math.floor(scheduled.startTime / 1000);
      await interaction.reply(`Readathon Sprint #${sprintNumber} (scheduled for <t:${scheduledTimestamp}:t>) has been cancelled.`);
      return;
    }

    const sprint = activeSprints[channelId] || pendingSprints[channelId];
    if (!sprint) {
      await interaction.reply({ content: `There isn't a sprint running or scheduled in this channel.`, flags: 64 });
      return;
    }

    if (sprint.participants && sprint.participants.length > 0) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_cancel').setLabel('Yes, cancel it').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('deny_cancel').setLabel('No, keep it going').setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({
        content: `Are you sure you want to cancel? **${sprint.participants.length}** ${sprint.participants.length === 1 ? 'person has' : 'people have'} joined this sprint.`,
        components: [row]
      });
    } else {
      await cleanupSprint(channelId);
      await db.deletePendingSprint(channelId);
      delete pendingSprints[channelId];
      await interaction.reply(`The **${sprint.type}** has been cancelled.`);
    }
  }

  // ---- /join ----
  if (interaction.commandName === 'join') {
    const { activeSprints, pendingSprints } = sprints;
    try {
      const sprint = activeSprints[channelId] || pendingSprints[channelId];
      if (!sprint) {
        await interaction.reply({ content: `There isn't a sprint running in this channel right now. Feel free to start one using the \`/sprint\` command!`, flags: 64 });
        return;
      }
      if (activeSprints[channelId]) {
        const timeRemaining = (sprint.endTime - Date.now()) / 60000;
        if (timeRemaining < 5) {
          await interaction.reply({ content: `Less than 5 minutes are remaining, join us for the next one!`, flags: 64 });
          return;
        }
      }
      if (sprint.participants.includes(interaction.user.id)) {
        await interaction.reply({ content: `You have already joined this sprint. Need to leave early? Use the \`/final\` command.`, flags: 64 });
        return;
      }
      await interaction.deferReply();
      sprint.participants.push(interaction.user.id);
      if (activeSprints[channelId]) {
        if (!sprint.originalParticipants) sprint.originalParticipants = new Set();
        if (!sprint.submittedUsers) sprint.submittedUsers = new Set();
        sprint.originalParticipants.add(interaction.user.id);
        await db.saveActiveSprint(channelId, { ...activeSprints[channelId], guildId: interaction.guild.id });
      } else if (pendingSprints[channelId]) {
        await db.savePendingSprint(channelId, pendingSprints[channelId]);
      }
      const minutesRemaining = activeSprints[channelId]
        ? Math.ceil((sprint.endTime - Date.now()) / 60000)
        : sprint.duration;
      await interaction.editReply(`<@${interaction.user.id}> has joined the **${sprint.type}** with **${minutesRemaining} minutes** remaining!`);
    } catch (error) {
      console.error('Error handling join command:', error);
    }
  }

  // ---- /time ----
  if (interaction.commandName === 'time') {
    const { activeSprints, pendingSprints, scheduledSprints } = sprints;
    if (activeSprints[channelId]) {
      const sprint = activeSprints[channelId];
      const endTime = Math.floor(sprint.endTime / 1000);
      await interaction.reply(`The sprint will end <t:${endTime}:R>, at <t:${endTime}:t>.`);
      return;
    }
    if (pendingSprints[channelId]) {
      const sprint = pendingSprints[channelId];
      const startsAt = Math.floor(sprint.startsAt / 1000);
      const label = sprint.sprintNumber ? `Readathon Sprint #${sprint.sprintNumber}` : sprint.type;
      await interaction.reply({ content: `**${label}** is starting <t:${startsAt}:R>! Use \`/join\` to join!`, flags: 64 });
      return;
    }
    if (scheduledSprints[channelId] && scheduledSprints[channelId].length > 0) {
      const next = scheduledSprints[channelId][0];
      const startsAt = Math.floor(next.startTime / 1000);
      await interaction.reply({ content: `The next scheduled sprint is Readathon Sprint #${next.number}, starting <t:${startsAt}:R>.`, flags: 64 });
      return;
    }
    await interaction.reply({ content: `There isn't a sprint running in this channel. To start one, use the \`/sprint\` command!`, flags: 64 });
  }

  // ---- /final ----
  if (interaction.commandName === 'final') {
    const { activeSprints, postLeaderboard } = sprints;
    try {
      const minutes = interaction.options.getInteger('minutes');
      if (!activeSprints[channelId]) {
        await interaction.reply({ content: `There isn't an active sprint in this channel right now.`, flags: 64 });
        return;
      }
      const sprint = activeSprints[channelId];
      const verb = sprintVerbs[sprint.type];
      const wasParticipant = sprint.originalParticipants?.has(interaction.user.id) || sprint.participants?.includes(interaction.user.id);

      if (!wasParticipant) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_final_${minutes}_${interaction.user.id}`)
            .setLabel(`Yes, I ${verb} for ${minutes} minutes`)
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('deny_final')
            .setLabel('No, cancel submit')
            .setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({
          content: `You didn't officially join this sprint, are you sure you want to submit **${minutes} minutes**? Please be honest and only submit the amount of time you actually ${verb}!`,
          components: [row],
          flags: 64
        });
        return;
      }

      await interaction.deferReply();
      if (!sprint.submittedUsers) sprint.submittedUsers = new Set();
      if (!sprint.originalParticipants) sprint.originalParticipants = new Set();
      sprint.finalTimes[interaction.user.id] = minutes;
      sprint.submittedUsers.add(interaction.user.id);
      sprint.originalParticipants.add(interaction.user.id);
      sprint.participants = sprint.participants.filter(id => id !== interaction.user.id);
      await db.saveActiveSprint(channelId, { ...sprint, guildId: interaction.guild.id });
      if (Date.now() >= sprint.endTime) {
        await db.saveEndingSprint(channelId, {
          guildId: interaction.guild.id,
          type: sprint.type,
          duration: sprint.duration,
          sprintNumber: sprint.sprintNumber,
          originalParticipants: sprint.originalParticipants,
          finalTimes: sprint.finalTimes,
          submittedUsers: sprint.submittedUsers,
          leaderboardAt: sprint.leaderboardAt
        });
      }
      await interaction.editReply(`<@${interaction.user.id}> has ${verb} for **${minutes} minutes**!`);
      const sprintEnded = Date.now() >= sprint.endTime;
      const allSubmitted = [...sprint.originalParticipants].every(id => sprint.submittedUsers.has(id));
      if (sprintEnded && allSubmitted && Object.keys(sprint.finalTimes).length > 0) {
        await postLeaderboard(channelId, interaction.guild);
      }
} catch (error) {
      console.error('Error handling final command:', error);
      try {
        await interaction.editReply({ content: 'Something went wrong submitting your time. Please try again or contact a mod.' });
      } catch {
        await interaction.reply({ content: 'Something went wrong submitting your time. Please try again or contact a mod.', flags: 64 });
      }
    }
  }

  // ---- /leave ----
  if (interaction.commandName === 'leave') {
    const { activeSprints, pendingSprints } = sprints;
    const sprint = activeSprints[channelId] || pendingSprints[channelId];
    if (!sprint) {
      await interaction.reply({ content: `There isn't a sprint running in this channel right now.`, flags: 64 });
      return;
    }
    if (!sprint.participants.includes(interaction.user.id)) {
      await interaction.reply({ content: `You haven't joined this sprint!`, flags: 64 });
      return;
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm_leave').setLabel(`Yes, I'd like to leave the sprint`).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('deny_leave').setLabel(`No, I will put in my /final count`).setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({
      content: `By using the \`/leave\` command, you will be removed from the leaderboard and any minutes you've read will not count. If you've read for more than five minutes, use the \`/final\` command, and you're all set. Would you like to leave the sprint?`,
      components: [row],
      flags: 64
    });
  }
});

// ---- MESSAGE CREATE ----
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // @mention sprint commands
  if (message.mentions.has(client.user)) {
    const channelId = message.channelId;
    const type = channelSprintTypes[channelId];
    if (type) {
      const { activeSprints, pendingSprints, startSprint, postSprintStart, randomEmoji, postLeaderboard } = sprints;
      const content = message.content.replace(`<@${client.user.id}>`, '').trim().toLowerCase();
      const args = content.split(/\s+/);
      const command = args[0];

      if (command === 'sprint') {
        const inputMinutes = parseInt(args[1]);
        const startsIn = parseInt(args[2]) || 1;

        if (activeSprints[channelId] || pendingSprints[channelId]) {
          await message.reply(`There's already a sprint running in this channel that will end <t:${Math.floor((activeSprints[channelId]?.endTime || pendingSprints[channelId]?.startsAt) / 1000)}:R>! If you'd like to join, use the \`/join\` command!`);
          return;
        }

        let minutes;
        if (fixedDurations[type]) {
          minutes = fixedDurations[type];
        } else {
          if (!inputMinutes || inputMinutes < 1 || inputMinutes > 60) {
            await message.reply(`Please provide a duration between 15 and 60 minutes for a **${type}**!`);
            return;
          }
          minutes = inputMinutes;
        }

        const startsAt = Date.now() + startsIn * 60 * 1000;
        const startsAtTimestamp = Math.floor(startsAt / 1000);
        const announceEmoji = randomEmoji(type);

        await message.reply(`${announceEmoji} **JOIN THE SPRINT** ${announceEmoji}\n\nThe next **${type}** runs for **${minutes} minutes** and will begin <t:${startsAtTimestamp}:R>.\n\nUse \`/join\` to join and \`/final\` if you have to leave early!`);

        pendingSprints[channelId] = {
          type,
          duration: minutes,
          startsAt,
          guildId: message.guild.id,
          participants: [],
          pendingTimer: setTimeout(async () => {
            const pending = pendingSprints[channelId];
            const carriedParticipants = pending ? [...pending.participants] : [];
            delete pendingSprints[channelId];
            const guild = client.guilds.cache.get(pending.guildId);
            await startSprint(channelId, type, minutes, null, carriedParticipants, guild);
            await postSprintStart(channelId);
          }, startsIn * 60 * 1000)
        };
        await db.savePendingSprint(channelId, pendingSprints[channelId]);
      }

      if (command === 'join') {
        const sprint = activeSprints[channelId] || pendingSprints[channelId];
        if (!sprint) {
          await message.reply(`There isn't a sprint running in this channel right now. Feel free to start one using the \`/sprint\` command!`);
          return;
        }
        if (activeSprints[channelId]) {
          const timeRemaining = (sprint.endTime - Date.now()) / 60000;
          if (timeRemaining < 5) {
            await message.reply(`Less than 5 minutes are remaining, join us for the next one!`);
            return;
          }
        }
        if (sprint.participants.includes(message.author.id)) {
          await message.reply(`You have already joined this sprint. Need to leave early? Use the \`/final\` command.`);
          return;
        }
        sprint.participants.push(message.author.id);
        if (activeSprints[channelId]) {
          if (!sprint.originalParticipants) sprint.originalParticipants = new Set();
          sprint.originalParticipants.add(message.author.id);
        }
        const minutesRemaining = activeSprints[channelId]
          ? Math.ceil((sprint.endTime - Date.now()) / 60000)
          : sprint.duration;
        await message.reply(`<@${message.author.id}> has joined the **${sprint.type}** with **${minutesRemaining} minutes** remaining!`);
      }

      if (command === 'final') {
        const minutes = parseInt(args[1]);
        if (!minutes || minutes < 1) {
          await message.reply(`Please provide the number of minutes you participated! Example: \`/final 45\``);
          return;
        }
        if (!activeSprints[channelId]) {
          await message.reply(`There isn't an active sprint in this channel right now.`);
          return;
        }
        const sprint = activeSprints[channelId];
        const verb = sprintVerbs[sprint.type];
        if (!sprint.submittedUsers) sprint.submittedUsers = new Set();
        if (!sprint.originalParticipants) sprint.originalParticipants = new Set();
        sprint.finalTimes[message.author.id] = minutes;
        sprint.submittedUsers.add(message.author.id);
        sprint.originalParticipants.add(message.author.id);
        sprint.participants = sprint.participants.filter(id => id !== message.author.id);
        await message.reply(`<@${message.author.id}> has ${verb} for **${minutes} minutes**!`);
        const sprintEnded = Date.now() >= sprint.endTime;
        const allSubmitted = [...sprint.originalParticipants].every(id => sprint.submittedUsers.has(id));
        if (sprintEnded && allSubmitted && Object.keys(sprint.finalTimes).length > 0) {
          await postLeaderboard(channelId, message.guild);
        }
      }
      return;
    }
  }

  // Sticky message repost
  if (message.author.id === client.user.id) return;
  await sticky.handleStickyRepost(message);
});

// ---- GUILD MEMBER ADD ----
client.on('guildMemberAdd', async member => {
  await joins.handleMemberAdd(member);
});

// ---- GUILD MEMBER REMOVE ----
client.on('guildMemberRemove', async member => {
  await joins.handleMemberRemove(member);
});

// ---- LOGIN ----
client.login(process.env.DISCORD_TOKEN);