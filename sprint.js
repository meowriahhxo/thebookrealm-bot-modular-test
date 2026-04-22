const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { google } = require('googleapis');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

//Sprint State
const activeSprints = {};
const pendingSprints = {};
const cooldowns = {};

// Channel Dependent Sprint Time Mapping
const channelSprintTypes = {
  [process.env.TALL_TOMES_CHANNEL_ID]: 'Tall Tomes Sprint',
  [process.env.SHORT_STACKS_CHANNEL_ID]: 'Short Stacks Sprint',
  [process.env.READATHON_CHANNEL_ID]: 'Readathon Sprint',
  [process.env.WRITING_CHANNEL_ID]: 'Writing Sprint',
  [process.env.ART_CHANNEL_ID]: 'Art Sprint',
  [process.env.STUDY_CHANNEL_ID]: 'Study Sprint'
};

console.log('Channel sprint types loaded:', channelSprintTypes);
console.log('Current channel IDs from env:', {
  TALL_TOMES: process.env.TALL_TOMES_CHANNEL_ID,
  SHORT_STACKS: process.env.SHORT_STACKS_CHANNEL_ID,
  READATHON: process.env.READATHON_CHANNEL_ID,
  WRITING: process.env.WRITING_CHANNEL_ID,
  ART: process.env.ART_CHANNEL_ID,
  STUDY: process.env.STUDY_CHANNEL_ID,
});

//Emoji Selections for Sprint Type
const sprintEmojis = {
  'Tall Tomes Sprint': ['📚', '📖', '🔖', '🌙', '✨', '⭐'],
  'Short Stacks Sprint': ['📚', '📖', '🔖', '🌙', '✨', '⭐'],
  'Readathon Sprint': ['📚', '📖', '🔖', '🌙', '✨', '⭐'],
  'Writing Sprint': ['✍️', '📝', '💫', '🖊️', '🌙', '⭐'],
  'Art Sprint': ['🎨', '🖌️', '✨', '🌈', '💫', '🎭'],
  'Study Sprint': ['📝', '📐', '💡', '🧠', '⭐', '🔍']
};

//Verbs for Sprint Type
const sprintVerbs = {
  'Tall Tomes Sprint': 'read',
  'Short Stacks Sprint': 'read',
  'Readathon Sprint': 'read',
  'Writing Sprint': 'wrote',
  'Art Sprint': 'created',
  'Study Sprint': 'studied'
};

//Happy Verbs for Sprint Type
const sprintHappyVerbs = {
  'Tall Tomes Sprint': 'Happy reading!',
  'Short Stacks Sprint': 'Happy reading!',
  'Readathon Sprint': 'Happy reading!',
  'Writing Sprint': 'Happy writing!',
  'Art Sprint': 'Happy creating!',
  'Study Sprint': 'Happy studying!'
};

// FIXED DURATIONS
const fixedDurations = {
  'Short Stacks Sprint': 30,
  'Tall Tomes Sprint': 60,
  'Readathon Sprint': 60
};

//Role IDs per Sprint Type
// Replace placeholders with real IDs when moving to main server
const sprintRoles = {
  'Tall Tomes Sprint': 'TALL_TOMES_ROLE_ID',
  'Short Stacks Sprint': 'SHORT_STACKS_ROLE_ID',
  'Readathon Sprint': process.env.READATHON_ROLE_ID,
  'Writing Sprint': 'WRITING_ROLE_ID',
  'Art Sprint': 'ART_ROLE_ID',
  'Study Sprint': 'STUDY_ROLE_ID'
};

//Google API
async function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

//Write Writing/Art/Study sprint minutes to Points spreadsheet by house
async function writeCreativeSprints(sprintResults, guild, sprintType) {
  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const sprintPointsCells = {
      'Writing Sprint': { Asphodel: 'B7', Dreanni: 'C7', Laiidon: 'D7', Zeldarian: 'E7' },
      'Study Sprint':   { Asphodel: 'B8', Dreanni: 'C8', Laiidon: 'D8', Zeldarian: 'E8' },
      'Art Sprint':     { Asphodel: 'B9', Dreanni: 'C9', Laiidon: 'D9', Zeldarian: 'E9' }
    };

    const houseRoles = {
      [process.env.ASPHODEL_ROLE_ID]: 'Asphodel',
      [process.env.DREANNI_ROLE_ID]: 'Dreanni',
      [process.env.LAIIDON_ROLE_ID]: 'Laiidon',
      [process.env.ZELDARIAN_ROLE_ID]: 'Zeldarian'
    };

    // Tally minutes per house
    const houseTotals = { Asphodel: 0, Dreanni: 0, Laiidon: 0, Zeldarian: 0 };

    for (const [userId, minutes] of Object.entries(sprintResults)) {
      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch (e) {
        continue;
      }

      let house = null;
      for (const [roleId, houseName] of Object.entries(houseRoles)) {
        if (member.roles.cache.has(roleId)) {
          house = houseName;
          break;
        }
      }

      if (!house) continue;
      houseTotals[house] += minutes;
    }

    // Get current month tab
    const now = new Date();
    const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const tabName = `${monthNames[easternTime.getMonth()]} ${easternTime.getFullYear()}`;

    // Write to each house's cell
    for (const [house, minutes] of Object.entries(houseTotals)) {
      if (minutes === 0) continue;

      const cell = sprintPointsCells[sprintType][house];

      // Read current value
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.POINTS_SPREADSHEET_ID,
        range: `${tabName}!${cell}`,
        valueRenderOption: 'UNFORMATTED_VALUE'
      });

      const current = parseFloat(response.data.values?.[0]?.[0]) || 0;

      // Write updated value
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.POINTS_SPREADSHEET_ID,
        range: `${tabName}!${cell}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[current + minutes]] }
      });
    }

    console.log(`${sprintType} results written to Points spreadsheet!`);
  } catch (error) {
    console.error(`Error writing ${sprintType} to Points spreadsheet:`, error);
  }
}

//Write Sprint Leaderboard to Google Sheets Reading Sprint Leaderboard
async function writeSprintToSheets(sprintResults, guild, sprintType) {
  try {
    // Route to correct spreadsheet based on sprint type
    if (sprintType === 'Writing Sprint' || sprintType === 'Art Sprint' || sprintType === 'Study Sprint') {
      await writeCreativeSprints(sprintResults, guild, sprintType);
      return;
    }
    
    if (sprintType === 'Readathon Sprint') {
      // TODO: Readathon leaderboard - coming soon
      return;
    }
    
    if (sprintType !== 'Tall Tomes Sprint' && sprintType !== 'Short Stacks Sprint') {
      return;
    }

    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const now = new Date();
    const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December'];
    const tabName = `${monthNames[easternTime.getMonth()]} ${easternTime.getFullYear()}`;    
    
    // Get existing sheet data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPRINT_LEADERBOARD_ID,
      range: `${tabName}!A:E`,
    });
    
    const rows = response.data.values || [];
    
    for (const [userId, minutes] of Object.entries(sprintResults)) {
      // Get member's house and display name from Discord
      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch (e) {
        continue; // skip if member not found
      }
      
      const houseRoles = {
        [process.env.ASPHODEL_ROLE_ID]: 'Asphodel',
        [process.env.DREANNI_ROLE_ID]: 'Dreanni',
        [process.env.LAIIDON_ROLE_ID]: 'Laiidon',
        [process.env.ZELDARIAN_ROLE_ID]: 'Zeldarian'
      };
      
      let house = null;
      for (const [roleId, houseName] of Object.entries(houseRoles)) {
        if (member.roles.cache.has(roleId)) {
          house = houseName;
          break;
        }
      }
      
      if (!house) continue; // skip if no house role
      
      const displayName = member.displayName;
      
      // Find existing row by Discord ID (column E)
      const existingRowIndex = rows.findIndex(row => row[4] === userId);
      
      if (existingRowIndex !== -1) {
        // Update existing row
        const currentMinutes = parseFloat(rows[existingRowIndex][2]) || 0;
        const currentSprints = parseInt(rows[existingRowIndex][3]) || 0;
        const rowNumber = existingRowIndex + 1;
        
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SPRINT_LEADERBOARD_ID,
          range: `${tabName}!C${rowNumber}:D${rowNumber}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[currentMinutes + minutes, currentSprints + 1]] }
        });
      } else {
        // Append new row
        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.SPRINT_LEADERBOARD_ID,
          range: `${tabName}!A:E`,
          valueInputOption: 'RAW',
          requestBody: { values: [[house, displayName, minutes, 1, userId]] }
        });
      }
    }
    console.log('Sprint results written to Google Sheets!');
  } catch (error) {
    console.error('Error writing to Google Sheets:', error);
  }
}

//Picks a random emoji for the sprint type
function randomEmoji(type) {
  const pool = sprintEmojis[type];
  return pool[Math.floor(Math.random() * pool.length)];
}

//Checks if currently GMT or BST
function isGMT() {
  const now = new Date();
  const year = now.getUTCFullYear();
  
  // Find last Sunday in March
  const lastSundayMarch = new Date(Date.UTC(year, 2, 31));
  lastSundayMarch.setUTCDate(31 - lastSundayMarch.getUTCDay());
  
  // Find last Sunday in October
  const lastSundayOctober = new Date(Date.UTC(year, 9, 31));
  lastSundayOctober.setUTCDate(31 - lastSundayOctober.getUTCDay());
  
  return now < lastSundayMarch || now >= lastSundayOctober;
}

//HELPER: Parse BST/GMT time and date to UTC
//Accepts: "3:00PM", "15:00", "00:00"
//Date format: "DD/MM/YYYY"

function parseTimeToUTC(timeStr, dateStr = null) {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const meridiem = match[3];

  if (meridiem) {
    if (meridiem.toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (meridiem.toUpperCase() === 'AM' && hours === 12) hours = 0;
  }

  const offset = isGMT() ? 0 : 1;

  let year, month, day;
  if (dateStr) {
    const dateParts = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!dateParts) return null;
    day = parseInt(dateParts[1]);
    month = parseInt(dateParts[2]) - 1;
    year = parseInt(dateParts[3]);
  } else {
    const now = new Date();
    year = now.getUTCFullYear();
    month = now.getUTCMonth();
    day = now.getUTCDate();
  }

  const target = new Date(Date.UTC(year, month, day, hours - offset, minutes));
  if (!dateStr && target <= new Date()) target.setUTCDate(target.getUTCDate() + 1);
  return target;
}

//START SPRINT- Creates the active sprint and sets up timers
async function startSprint(channelId, type, minutes, sprintNumber = null, carriedParticipants = [], guild = null) {
  const channel = await client.channels.fetch(channelId);
  const endTime = Math.floor((Date.now() + minutes * 60 * 1000) / 1000);
  const sprintLabel = sprintNumber ? `Readathon Sprint #${sprintNumber}` : type;

  activeSprints[channelId] = {
    type,
    duration: minutes,
    startTime: Date.now(),
    endTime: Date.now() + minutes * 60 * 1000,
    participants: [...carriedParticipants],
    originalParticipants: new Set(carriedParticipants),
    finalTimes: {},
    submittedUsers: new Set(),
    sprintNumber,

    //Timer - fires when sprint ends
    timer: setTimeout(async () => {
      const sprint = activeSprints[channelId];
      if (!sprint) return;

      const verb = sprintVerbs[sprint.type];
      const submitWindow = minutes <= 30 ? 5 : 7;
const finalDeadline = Math.floor((Date.now() + submitWindow * 60 * 1000) / 1000);
      const mentions = sprint.originalParticipants.size > 0
        ? [...sprint.originalParticipants].map(id => `<@${id}>`).join(', ')
        : 'everyone';
      const endEmoji = randomEmoji(type);

      //Sprint Over message
      await channel.send(`${endEmoji} **THE SPRINT IS OVER** ${endEmoji}\n\nThis **${sprintLabel}** is over, please put in the amount of time you ${verb}. The leaderboard will post <t:${finalDeadline}:R>, you have until then to put in your final count!\n\n✨ **Participants:**\n${mentions}`);

      //2 minute reminder before window closes - posts after 3 mins
      sprint.reminderTimer = setTimeout(async () => {
        const unsubmitted = [...sprint.originalParticipants].filter(id => !sprint.submittedUsers.has(id));
        if (unsubmitted.length > 0) {
          const reminderMentions = unsubmitted.map(id => `<@${id}>`).join(', ');
          await channel.send(`‼️ **Reminder:** ${reminderMentions} — you have 2 minutes left to submit your final time with \`/final\`!`);
        }
      }, (submitWindow - 2) * 60 * 1000);

      const allAlreadySubmitted = [...sprint.originalParticipants].every(id => sprint.submittedUsers.has(id));
      if (allAlreadySubmitted && Object.keys(sprint.finalTimes).length > 0) {
        await postLeaderboard(channelId, guild);
      } else {
        sprint.finalTimer = setTimeout(() => postLeaderboard(channelId, guild), submitWindow * 60 * 1000);
      }
    }, minutes * 60 * 1000)
  };
}

//POST SPRINT START MESSAGE
//Posts when sprint actually begins (after countdown)
async function postSprintStart(channelId) {
  const sprint = activeSprints[channelId];
  if (!sprint) return;

  const channel = await client.channels.fetch(channelId);
  const emoji = randomEmoji(sprint.type);
  const happyVerb = sprintHappyVerbs[sprint.type];
  const endTime = Math.floor(sprint.endTime / 1000);
  const sprintLabel = sprint.sprintNumber ? `Readathon Sprint #${sprint.sprintNumber}` : sprint.type;
  const mentions = sprint.participants.length > 0
    ? sprint.participants.map(id => `<@${id}>`).join(', ')
    : '';

  await channel.send(`${emoji} **START SPRINTING** ${emoji}\n\nThe **${sprintLabel}** has begun. the sprint will end <t:${endTime}:R>, at <t:${endTime}:t>. ${happyVerb}\n\n✨ **Participants:**\n${mentions}`);
}

//POST LEADERBOARD
//Posts when all submit or 5 min window expires
async function postLeaderboard(channelId, guild) {
  const sprint = activeSprints[channelId];
  if (!sprint) return;

  const channel = await client.channels.fetch(channelId);
  const sorted = Object.entries(sprint.finalTimes).sort((a, b) => b[1] - a[1]);
  const totalTime = sorted.reduce((sum, [, mins]) => sum + mins, 0);

  let leaderboard = '🏆 **GREAT JOB EVERYONE** 🏆\n\n';
  let currentRank = 1;
  let previousTime = null;
  let displayRank = 1;

  for (let i = 0; i < sorted.length; i++) {
    const [userId, minutes] = sorted[i];
    if (minutes === previousTime) {
      leaderboard += `= ${displayRank}. <@${userId}> — **${minutes} minutes**\n`;
    } else {
      displayRank = currentRank;
      leaderboard += `${displayRank}. <@${userId}> — **${minutes} minutes**\n`;
      previousTime = minutes;
    }
    currentRank++;
  }

  leaderboard += `\nCombined time: **${totalTime} minutes** over **${sprint.duration} minutes**.\n`;
  leaderboard += `\nThanks for joining us. You can use the \`/sprint\` command to start another sprint!\n\n`;

  await channel.send(leaderboard);

  clearTimeout(sprint.timer);
  clearTimeout(sprint.finalTimer);
  clearTimeout(sprint.reminderTimer);
  await writeSprintToSheets(sprint.finalTimes, guild, sprint.type);
  delete activeSprints[channelId];
}

//Register Slash Commands
async function registerCommands() {
  const commands = [
    // /sprint [input] — e.g. "60 5" = 60 min sprint starting in 5 mins
    new SlashCommandBuilder()
      .setName('sprint')
      .setDescription('Start a sprint in this channel')
      .addStringOption(opt =>
        opt.setName('input')
          .setDescription('Sprint length and delay to begin')
          .setRequired(true))
      .toJSON(),

    // /schedule — for Readathon sprints scheduled ahead of time
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
       .addRoleOption(opt=>
        opt.setName(`pingrole`)
          .setDescription(`Role to ping for the 15 minute warning - defaults to Readathon`)
          .setRequired(false))
      .toJSON(),

    // /cancel — cancels active or pending sprint
    new SlashCommandBuilder()
      .setName('cancel')
      .setDescription('Cancel the active or upcoming sprint in this channel')
      .toJSON(),

    // /join — join the active sprint
    new SlashCommandBuilder()
      .setName('join')
      .setDescription('Join the active sprint in this channel')
      .toJSON(),

    // /time — check time remaining
    new SlashCommandBuilder()
      .setName('time')
      .setDescription('Check how much time is left in the sprint')
      .toJSON(),

    // /final — submit time or leave early
    new SlashCommandBuilder()
      .setName('final')
      .setDescription('Submit your final minutes read count')
      .addIntegerOption(opt =>
        opt.setName('minutes')
          .setDescription('How many minutes did you participate?')
          .setRequired(true))
      .toJSON(),

  // /leave — leave the sprint without submitting time
    new SlashCommandBuilder()
      .setName('leave')
      .setDescription('Leave the sprint without submitting a time')
      .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
  console.log('Sprint commands registered!');
}

// BOT READY
client.once('clientReady', async () => {
  console.log(`Sprint bot online as ${client.user.tag}!`);
  await registerCommands();
});

// INTERACTION HANDLER
client.on('interactionCreate', async interaction => {
  const channelId = interaction.channelId;

  // ---- BUTTON INTERACTIONS (cancel confirmation) ----
  if (interaction.isButton()) {
    if (interaction.customId === 'confirm_cancel') {
      const sprint = activeSprints[channelId] || pendingSprints[channelId];
      if (!sprint) {
        await interaction.update({ content: 'No sprint to cancel!', components: [] });
        return;
      }
      const roleId = sprintRoles[sprint.type];
      clearTimeout(sprint.timer);
      clearTimeout(sprint.pendingTimer);
      clearTimeout(sprint.warningTimer);
      clearTimeout(sprint.finalTimer);
      clearTimeout(sprint.reminderTimer);
      delete activeSprints[channelId];
      delete pendingSprints[channelId];
      await interaction.update({ content: `The **${sprint.type}** has been cancelled. <@&${roleId}>`, components: [] });
    }

    if (interaction.customId === 'deny_cancel') {
      await interaction.update({ content: 'Cancel aborted — sprint continues!', components: [] });
    }

    if (interaction.customId.startsWith('confirm_final_')) {
      const parts = interaction.customId.split('_');
      const minutes = parseInt(parts[2]);
      const userId = parts[3];

      const sprint = activeSprints[channelId];
      if (!sprint) {
        await interaction.update({ content: 'That sprint has already ended!', components: [] });
        return;
      }

      sprint.finalTimes[userId] = minutes;
      sprint.submittedUsers.add(userId);
      sprint.originalParticipants.add(userId);
      sprint.participants = sprint.participants.filter(id => id !== userId);

      await interaction.update({ content: `Got it! Your **${minutes} minutes** have been logged.`, components: [] });
      await interaction.channel.send(`<@${userId}> has logged **${minutes} minutes**!`);

      const sprintEnded = Date.now() >= sprint.endTime;
      const allSubmitted = [...sprint.originalParticipants].every(id => sprint.submittedUsers.has(id));
      if (sprintEnded && allSubmitted && Object.keys(sprint.finalTimes).length > 0) {
        await postLeaderboard(channelId, interaction.guild);
      }
    }

    if (interaction.customId === 'deny_final') {
      await interaction.update({ content: `No worries, nothing was submitted!`, components: [] });
    }

    if (interaction.customId === 'confirm_leave') {
      const sprint = activeSprints[channelId] || pendingSprints[channelId];
      if (!sprint) {
        await interaction.update({ content: 'That sprint has already ended!', components: [] });
        return;
      }
      const userId = interaction.user.id;
      sprint.participants = sprint.participants.filter(id => id !== userId);
      sprint.originalParticipants.delete(userId);
      await interaction.update({ content: `You've been removed from the sprint. See you next time!`, components: [] });
      await interaction.channel.send(`<@${userId}> has left the **${sprint.type}**.`);
    }

    if (interaction.customId === 'deny_leave') {
      await interaction.update({ content: `No problem! Use \`/final\` to submit your minutes when you're ready.`, components: [] });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  // ---- /sprint ----
  if (interaction.commandName === 'sprint') {
    const type = channelSprintTypes[channelId];
    if (!type) {
      await interaction.reply({ content: 'This channel isn\'t set up for sprints!', ephemeral: true });
      return;
    }

    if (activeSprints[channelId] || pendingSprints[channelId]) {
      const sprint = activeSprints[channelId] || pendingSprints[channelId];
      const timeRemaining = activeSprints[channelId]
        ? Math.ceil((sprint.endTime - Date.now()) / 60000)
        : Math.ceil((sprint.startsAt - Date.now()) / 60000);
      const label = activeSprints[channelId] ? 'running' : 'starting soon';
      await interaction.reply({ content: `There's a sprint ${label} in this channel! There are currently **${timeRemaining} minutes** remaining.`, ephemeral: true });
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
        await interaction.reply({ content: `Please provide a duration between 15 and 60 minutes for a **${type}**!`, ephemeral: true });
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
        const carriedParticipants = pending ? [...pending.participants] : [];
        delete pendingSprints[channelId];
        const guild = client.guilds.cache.get(pending.guildId);
        await startSprint(channelId, type, minutes, null, carriedParticipants, guild);
        await postSprintStart(channelId);
      }, startsIn * 60 * 1000)
    };
  }

  // ---- /schedule ----
  if (interaction.commandName === 'schedule') {
    const type = channelSprintTypes[channelId];
    if (!type) {
      await interaction.reply({ content: 'This channel isn\'t set up for sprints!', ephemeral: true });
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
      await interaction.reply({ content: 'Invalid time or date format! Use time like `3:00PM` or `15:00`, and date like `02/05/2026`.', ephemeral: true });
      return;
    }

    const msUntilStart = startTime.getTime() - Date.now();
    const msUntilWarning = msUntilStart - 15 * 60 * 1000;
    const startTimestamp = Math.floor(startTime.getTime() / 1000);

    await interaction.reply(`✅ Readathon Sprint #${number} scheduled for <t:${startTimestamp}:t>! It will post 15 minutes before its start time.`);

    pendingSprints[channelId] = {
      type: 'Readathon Sprint',
      duration: minutes,
      startsAt: startTime.getTime(),
      guildId: interaction.guild.id,
      participants: [],
      warningTimer: msUntilWarning > 0 ? setTimeout(async () => {
        const channel = await client.channels.fetch(channelId);
        await channel.send(`<@&${roleId}> Readathon Sprint #${number} is starting in 15 minutes! Use /join to read with us!`);
      }, msUntilWarning) : null,
      pendingTimer: setTimeout(async () => {
        const pending = pendingSprints[channelId];
        const carriedParticipants = pending ? [...pending.participants] : [];
        delete pendingSprints[channelId];
        const guild = client.guilds.cache.get(pending.guildId);
        await startSprint(channelId, 'Readathon Sprint', minutes, number, carriedParticipants, guild);
        await postSprintStart(channelId);
      }, msUntilStart)
    };
  }

  // ---- /cancel ----
  if (interaction.commandName === 'cancel') {
    const sprint = activeSprints[channelId] || pendingSprints[channelId];
    if (!sprint) {
      await interaction.reply({ content: `There isn't a sprint running or scheduled in this channel.`, ephemeral: true });
      return;
    }

    if (sprint.participants && sprint.participants.length > 0) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_cancel')
          .setLabel('Yes, cancel it')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('deny_cancel')
          .setLabel('No, keep it going')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: `Are you sure you want to cancel? **${sprint.participants.length} ${sprint.participants.length === 1 ? 'person has' : 'people have'}** joined this sprint.`,
        components: [row]
      });
    } else {
      clearTimeout(sprint.timer);
      clearTimeout(sprint.pendingTimer);
      clearTimeout(sprint.warningTimer);
      clearTimeout(sprint.finalTimer);
      clearTimeout(sprint.reminderTimer);
      delete activeSprints[channelId];
      delete pendingSprints[channelId];

      const roleId = sprintRoles[sprint.type];
      await interaction.reply(`The **${sprint.type}** has been cancelled. <@&${roleId}>`);
    }
  }

  // ---- /join ----
  if (interaction.commandName === 'join') {
    const sprint = activeSprints[channelId] || pendingSprints[channelId];
    if (!sprint) {
      await interaction.reply({ content: `There isn't a sprint running in this channel. To start one, use the \`/sprint\` command!`, ephemeral: true });
      return;
    }

    if (activeSprints[channelId]) {
      const timeRemaining = (sprint.endTime - Date.now()) / 60000;
      if (timeRemaining < 5) {
        await interaction.reply({ content: `Less than 5 minutes are remaining, join us for the next one!`, ephemeral: true });
        return;
      }
    }

    if (sprint.participants.includes(interaction.user.id)) {
      await interaction.reply({ content: `You have already joined this sprint. Need to leave early? Use the /final command.`, ephemeral: true });
      return;
    }

    sprint.participants.push(interaction.user.id);
    if (activeSprints[channelId]) {
      sprint.originalParticipants.add(interaction.user.id);
    }
    await interaction.reply(`<@${interaction.user.id}> has joined the **${sprint.type}**!`);
  }

  // ---- /time ----
  if (interaction.commandName === 'time') {
    if (!activeSprints[channelId] && !pendingSprints[channelId]) {
      await interaction.reply({ content: `There isn't a sprint running in this channel. To start one, use the \`/sprint\` command!`, ephemeral: true });
      return;
    }

    if (pendingSprints[channelId] && !activeSprints[channelId]) {
      const sprint = pendingSprints[channelId];
      const startsAt = Math.floor(sprint.startsAt / 1000);
      await interaction.reply({ content: `The **${sprint.type}** hasn't started yet! It begins <t:${startsAt}:R>.`, ephemeral: true });
      return;
    }

    const sprint = activeSprints[channelId];
    const endTime = Math.floor(sprint.endTime / 1000);
    await interaction.reply(`The sprint will end <t:${endTime}:R>, at <t:${endTime}:t>.`);
  }

  // ---- /final ----
  if (interaction.commandName === 'final') {
    const minutes = interaction.options.getInteger('minutes');

    if (!activeSprints[channelId]) {
      await interaction.reply({ content: `There isn't an active sprint in this channel right now.`, flags: 64 });
      return;
    }

    const sprint = activeSprints[channelId];
    const verb = sprintVerbs[sprint.type];
    const wasParticipant = sprint.originalParticipants.has(interaction.user.id) || sprint.participants.includes(interaction.user.id);

    if (!wasParticipant) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_final_${minutes}_${interaction.user.id}`)
          .setLabel(`Yes, I ${verb} for ${minutes} minutes`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('deny_final')
          .setLabel('Actually, never mind')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: `You didn't officially join this sprint, are you sure you want to submit **${minutes} minutes**? Please be honest and only submit the amount of time you actually ${verb}!`,
        components: [row],
        flags: 64
      });
      return;
    }

    // Regular participant flow
    sprint.finalTimes[interaction.user.id] = minutes;
    sprint.submittedUsers.add(interaction.user.id);
    sprint.originalParticipants.add(interaction.user.id);
    sprint.participants = sprint.participants.filter(id => id !== interaction.user.id);

    await interaction.reply(`<@${interaction.user.id}> has logged **${minutes} minutes**!`);

    const sprintEnded = Date.now() >= sprint.endTime;
    const allSubmitted = [...sprint.originalParticipants].every(id => sprint.submittedUsers.has(id));
    if (sprintEnded && allSubmitted && Object.keys(sprint.finalTimes).length > 0) {
      await postLeaderboard(channelId, interaction.guild);
    }
  }

    // ---- /leave ----
  if (interaction.commandName === 'leave') {
    const sprint = activeSprints[channelId] || pendingSprints[channelId];
    if (!sprint) {
      await interaction.reply({ content: `There isn't a sprint running in this channel right now.`, ephemeral: true });
      return;
    }

    if (!sprint.participants.includes(interaction.user.id)) {
      await interaction.reply({ content: `You haven't joined this sprint!`, ephemeral: true });
      return;
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_leave')
        .setLabel(`Yes, I'd like to leave the sprint`)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('deny_leave')
        .setLabel(`No, I will put in my /final count`)
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: `By using the \`/leave\` command, you will be removed from the leaderboard and any minutes you've read will not count. If you've read for more than five minutes, use the \`/final\` command, and you're all set. Would you like to leave the sprint?`,
      components: [row],
      flags: 64
    });
  }
});

// LOGIN
client.login(process.env.DISCORD_TOKEN);