const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

// =====================================
// SPRINT STATE
// =====================================
const activeSprints = {};
const pendingSprints = {};
const cooldowns = {};

// =====================================
// CHANNEL → SPRINT TYPE MAPPING
// Replace placeholders with real IDs when moving to main server
// =====================================
const channelSprintTypes = {
  [process.env.TALL_TOMES_CHANNEL_ID]: 'Tall Tomes Sprint',
  [process.env.SHORT_STACKS_CHANNEL_ID]: 'Short Stacks Sprint',
  [process.env.READATHON_CHANNEL_ID]: 'Readathon Sprint',
  [process.env.WRITING_CHANNEL_ID]: 'Writing Sprint',
  [process.env.ART_CHANNEL_ID]: 'Art Sprint',
  [process.env.STUDY_CHANNEL_ID]: 'Study Sprint'
};

// =====================================
// EMOJI POOLS PER SPRINT TYPE
// =====================================
const sprintEmojis = {
  'Tall Tomes Sprint': ['📚', '📖', '🔖', '🌙', '✨', '⭐'],
  'Short Stacks Sprint': ['📚', '📖', '🔖', '🌙', '✨', '⭐'],
  'Readathon Sprint': ['📚', '📖', '🔖', '🌙', '✨', '⭐'],
  'Writing Sprint': ['✍️', '📝', '💫', '🖊️', '🌙', '⭐'],
  'Art Sprint': ['🎨', '🖌️', '✨', '🌈', '💫', '🎭'],
  'Study Sprint': ['📝', '📐', '💡', '🧠', '⭐', '🔍']
};

// =====================================
// VERBS PER SPRINT TYPE
// Used in end message ("amount of time you read/wrote/etc")
// =====================================
const sprintVerbs = {
  'Tall Tomes Sprint': 'read',
  'Short Stacks Sprint': 'read',
  'Readathon Sprint': 'read',
  'Writing Sprint': 'wrote',
  'Art Sprint': 'created',
  'Study Sprint': 'studied'
};

// =====================================
// HAPPY VERBS PER SPRINT TYPE
// Used in start sprinting message
// =====================================
const sprintHappyVerbs = {
  'Tall Tomes Sprint': 'Happy reading!',
  'Short Stacks Sprint': 'Happy reading!',
  'Readathon Sprint': 'Happy reading!',
  'Writing Sprint': 'Happy writing!',
  'Art Sprint': 'Happy creating!',
  'Study Sprint': 'Happy studying!'
};

// =====================================
// FIXED DURATIONS
// These sprint types always run for a set time
// =====================================
const fixedDurations = {
  'Short Stacks Sprint': 30,
  'Tall Tomes Sprint': 60,
  'Readathon Sprint': 60
};

// =====================================
// ROLE IDs PER SPRINT TYPE
// Replace placeholders with real IDs when moving to main server
// =====================================
const sprintRoles = {
  'Tall Tomes Sprint': 'TALL_TOMES_ROLE_ID',
  'Short Stacks Sprint': 'SHORT_STACKS_ROLE_ID',
  'Readathon Sprint': process.env.READATHON_ROLE_ID,
  'Writing Sprint': 'WRITING_ROLE_ID',
  'Art Sprint': 'ART_ROLE_ID',
  'Study Sprint': 'STUDY_ROLE_ID'
};

//Picks a random emoji for the sprint type
function randomEmoji(type) {
  const pool = sprintEmojis[type];
  return pool[Math.floor(Math.random() * pool.length)];
}

//Checks if currently GMT or BST
function isGMT() {
  const now = new Date();
  const jan = new Date(now.getFullYear(), 0, 1);
  const jul = new Date(now.getFullYear(), 6, 1);
  const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  return now.getTimezoneOffset() === stdOffset;
}

// HELPER: Parse BST/GMT time and date to UTC
// Accepts: "3:00PM", "15:00", "00:00"
// Date format: "DD/MM/YYYY"

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

// START SPRINT- Creates the active sprint and sets up timers

async function startSprint(channelId, type, minutes, sprintNumber = null, carriedParticipants = []) {
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

    // Timer - fires when sprint ends
    timer: setTimeout(async () => {
      const sprint = activeSprints[channelId];
      if (!sprint) return;

      const verb = sprintVerbs[sprint.type];
      const submitWindow = minutes <= 30 ? 5 : 7;
const finalDeadline = Math.floor((Date.now() + submitWindow * 60 * 1000) / 1000);
      const mentions = sprint.participants.length > 0
        ? sprint.participants.map(id => `<@${id}>`).join(', ')
        : 'everyone';
      const endEmoji = randomEmoji(type);

      // TIME'S UP message
      await channel.send(`${endEmoji} **THE SPRINT IS OVER** ${endEmoji}\n${mentions}\nThis **${sprintLabel}** is over, please put in the amount of time you ${verb}. You have <t:${finalDeadline}:R> to put in your final count!`);

      // 2 minute reminder before window closes - posts after 3 mins
      sprint.reminderTimer = setTimeout(async () => {
        const unsubmitted = [...sprint.originalParticipants].filter(id => !sprint.submittedUsers.has(id));
        if (unsubmitted.length > 0) {
          const reminderMentions = unsubmitted.map(id => `<@${id}>`).join(', ');
          await channel.send(`‼️ **Reminder:** ${reminderMentions} — you have 2 minutes left to submit your final time with \`/final\`!`);
        }
      }, (submitWindow - 2) * 60 * 1000);

      sprint.finalTimer = setTimeout(() => postLeaderboard(channelId), submitWindow * 60 * 1000);
    }, minutes * 60 * 1000)
  };
}

// =====================================
// POST SPRINT START MESSAGE
// Fires when sprint actually begins (after countdown)
// =====================================
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

  await channel.send(`${emoji} **START SPRINTING** ${emoji}\n\nThe **${sprintLabel}** has begun. You have <t:${endTime}:R> to sprint, ending at <t:${endTime}:t>. ${happyVerb}\n\n✨ **Participants:**\n${mentions}`);
}

// =====================================
// POST LEADERBOARD
// Fires when all submit or 5 min window expires
// =====================================
async function postLeaderboard(channelId) {
  const sprint = activeSprints[channelId];
  if (!sprint) return;

  const channel = await client.channels.fetch(channelId);
  const sorted = Object.entries(sprint.finalTimes).sort((a, b) => b[1] - a[1]);
  const totalTime = sorted.reduce((sum, [, mins]) => sum + mins, 0);

  let leaderboard = '🏆 **GREAT JOB EVERYONE** 🏆\n';
  let currentRank = 1;
  let previousTime = null;
  let displayRank = 1;

  for (let i = 0; i < sorted.length; i++) {
    const [userId, minutes] = sorted[i];
    if (minutes === previousTime) {
      leaderboard += `= ${displayRank}. <@${userId}> — **${minutes} minutes**\n`;
    } else {
      displayRank = currentRank;
      leaderboard += `  ${displayRank}. <@${userId}> — **${minutes} minutes**\n`;
      previousTime = minutes;
    }
    currentRank++;
  }

  const cooldownTime = Math.floor((Date.now() + 3 * 60 * 1000) / 1000);
  cooldowns[channelId] = Date.now() + 3 * 60 * 1000;

  leaderboard += `\nCombined time: **${totalTime} minutes** over **${sprint.duration} minutes**.\n`;
  leaderboard += `\nThanks for joining us. You can use the /sprint command to start another <t:${cooldownTime}:R>!\n\n`;
  leaderboard += `-# <@&${process.env.KEEPERS_ROLE_ID}> a sprint just ended, thank you!`;

  await channel.send(leaderboard);

  clearTimeout(sprint.timer);
  clearTimeout(sprint.finalTimer);
  clearTimeout(sprint.reminderTimer);
  delete activeSprints[channelId];
}

// =====================================
// REGISTER SLASH COMMANDS
// =====================================
async function registerCommands() {
  const commands = [
    // /sprint [input] — e.g. "60 5" = 60 min sprint starting in 5 mins
    new SlashCommandBuilder()
      .setName('sprint')
      .setDescription('Start a sprint in this channel')
      .addStringOption(opt =>
        opt.setName('input')
          .setDescription('Duration and start delay (e.g. "60 5" = 60 min sprint starting in 5 mins)')
          .setRequired(true))
      .toJSON(),

    // /schedule — for Readathon sprints scheduled ahead of time
    new SlashCommandBuilder()
      .setName('schedule')
      .setDescription('Schedule a Readathon sprint')
      .addIntegerOption(opt =>
        opt.setName('number')
          .setDescription('Sprint number (e.g. 1 for Readathon Sprint #1)')
          .setRequired(true))
      .addIntegerOption(opt =>
        opt.setName('minutes')
          .setDescription('Duration in minutes')
          .setRequired(true))
      .addStringOption(opt =>
        opt.setName('time')
          .setDescription('Start time in BST/GMT (e.g. 3:00PM, 15:00, or 00:00)')
          .setRequired(true))
      .addStringOption(opt =>
        opt.setName('date')
          .setDescription('Date in DD/MM/YYYY format (e.g. 02/05/2026). Leave blank for today.')
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
      .setDescription('Submit your final time or leave the sprint early')
      .addIntegerOption(opt =>
        opt.setName('minutes')
          .setDescription('How many minutes did you read/write/create/study?')
          .setRequired(true))
      .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
  console.log('Sprint commands registered!');
}

// =====================================
// BOT READY
// =====================================
client.once('ready', async () => {
  console.log(`Sprint bot online as ${client.user.tag}!`);
  await registerCommands();
});

// =====================================
// INTERACTION HANDLER
// =====================================
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

    if (cooldowns[channelId] && Date.now() < cooldowns[channelId]) {
      const cooldownTime = Math.floor(cooldowns[channelId] / 1000);
      await interaction.reply({ content: `Please wait until <t:${cooldownTime}:R> before starting another sprint!`, ephemeral: true });
      return;
    }

    const input = interaction.options.getString('input').trim().split(/\s+/);
    const inputMinutes = parseInt(input[0]);
    const startsIn = parseInt(input[1]) || 1;

    let minutes;
    if (fixedDurations[type]) {
      minutes = fixedDurations[type];
    } else {
      if (!inputMinutes || inputMinutes < 15 || inputMinutes > 60) {
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
      participants: [],
      pendingTimer: setTimeout(async () => {
        const pending = pendingSprints[channelId];
        const carriedParticipants = pending ? [...pending.participants] : [];
        delete pendingSprints[channelId];
        await startSprint(channelId, type, minutes, null, carriedParticipants);
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

    const startTime = parseTimeToUTC(timeStr, dateStr);
    if (!startTime) {
      await interaction.reply({ content: 'Invalid time or date format! Use time like `3:00PM` or `15:00`, and date like `02/05/2026`.', ephemeral: true });
      return;
    }

    const msUntilStart = startTime.getTime() - Date.now();
    const msUntilWarning = msUntilStart - 15 * 60 * 1000;
    const startTimestamp = Math.floor(startTime.getTime() / 1000);

    await interaction.reply(`✅ Readathon Sprint #${number} scheduled for <t:${startTimestamp}:t>! A reminder will be posted 15 minutes before.`);

    pendingSprints[channelId] = {
      type: 'Readathon Sprint',
      duration: minutes,
      startsAt: startTime.getTime(),
      participants: [],
      warningTimer: msUntilWarning > 0 ? setTimeout(async () => {
        const channel = await client.channels.fetch(channelId);
        await channel.send(`<@&${process.env.READATHON_ROLE_ID}> Readathon Sprint #${number} is starting in 15 minutes! Use /join to read with us!`);
      }, msUntilWarning) : null,
      pendingTimer: setTimeout(async () => {
        const pending = pendingSprints[channelId];
        const carriedParticipants = pending ? [...pending.participants] : [];
        delete pendingSprints[channelId];
        await startSprint(channelId, 'Readathon Sprint', minutes, number, carriedParticipants);
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
      await interaction.reply({ content: `There isn't a sprint running in this channel. To start one, use the /sprint command!`, ephemeral: true });
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
      await interaction.reply({ content: `There isn't a sprint running in this channel. To start one, use the /sprint command!`, ephemeral: true });
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
    await interaction.reply(`There are <t:${endTime}:R> left in this sprint! It ends at <t:${endTime}:t>.`);
  }

  // ---- /final ----
  if (interaction.commandName === 'final') {
    const minutes = interaction.options.getInteger('minutes');

    if (!activeSprints[channelId]) {
      await interaction.reply({ content: `There isn't an active sprint in this channel right now.`, ephemeral: true });
      return;
    }

    const sprint = activeSprints[channelId];
    const verb = sprintVerbs[sprint.type];
    const wasParticipant = sprint.originalParticipants.has(interaction.user.id) || sprint.participants.includes(interaction.user.id);

    if (!wasParticipant) {
      await interaction.reply({ content: `You didn't join this sprint, but if you were reading along, you're welcome to submit your time. Please be honest and share the amount of time you ${verb} during this sprint!`, ephemeral: true });
    } else {
      await interaction.reply(`<@${interaction.user.id}> has logged **${minutes} minutes**!`);
    }

    sprint.finalTimes[interaction.user.id] = minutes;
    sprint.submittedUsers.add(interaction.user.id);
    sprint.originalParticipants.add(interaction.user.id);
    sprint.participants = sprint.participants.filter(id => id !== interaction.user.id);

    const allSubmitted = [...sprint.originalParticipants].every(id => sprint.submittedUsers.has(id));
    if (allSubmitted && Object.keys(sprint.finalTimes).length > 0) {
      await postLeaderboard(channelId);
    }
  }
});

// =====================================
// LOGIN
// =====================================
client.login(process.env.DISCORD_TOKEN);