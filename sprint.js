const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

const activeSprints = {};
const cooldowns = {};
const scheduledSprints = {};

const sprintVerbs = {
  'Tall Tomes Sprint': 'read',
  'Short Stacks Sprint': 'read',
  'Readathon Sprint': 'read',
  'Writing Sprint': 'wrote',
  'Art Sprint': 'created',
  'Study Sprint': 'studied'
};

const fixedDurations = {
  'Short Stacks Sprint': 30,
  'Tall Tomes Sprint': 60,
  'Readathon Sprint': 60
};

function isGMT() {
  const now = new Date();
  const jan = new Date(now.getFullYear(), 0, 1);
  const jul = new Date(now.getFullYear(), 6, 1);
  const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  return now.getTimezoneOffset() === stdOffset;
}

function parseTimeToUTC(timeStr) {
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
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours - offset, minutes));

  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
  return target;
}

async function startSprint(channelId, type, minutes, sprintNumber = null) {
  const channel = await client.channels.fetch(channelId);
  const endTime = Math.floor((Date.now() + minutes * 60 * 1000) / 1000);

  const sprintLabel = sprintNumber ? `Readathon Sprint #${sprintNumber}` : `**${type}**`;
  await channel.send(`A ${sprintLabel} has started. There are **${minutes} minutes** left in this sprint, and it ends at <t:${endTime}:t>. Use /join to join and /final if you have to leave early!`);

  activeSprints[channelId] = {
    type,
    duration: minutes,
    startTime: Date.now(),
    endTime: Date.now() + minutes * 60 * 1000,
    participants: [],
    finalTimes: {},
    submittedUsers: new Set(),
    sprintNumber,
    timer: setTimeout(async () => {
      const sprint = activeSprints[channelId];
      if (!sprint) return;

      const verb = sprintVerbs[sprint.type];
      const finalDeadline = Math.floor((Date.now() + 5 * 60 * 1000) / 1000);
      const mentions = sprint.participants.length > 0
        ? sprint.participants.map(id => `<@${id}>`).join(', ')
        : 'everyone';

      await channel.send(`${mentions}\nThis **${sprint.type}** is over, please put in the amount of time you ${verb}. You have <t:${finalDeadline}:R> to put in your final count!`);

      sprint.finalTimer = setTimeout(() => postLeaderboard(channelId), 5 * 60 * 1000);
    }, minutes * 60 * 1000)
  };
}

async function postLeaderboard(channelId) {
  const sprint = activeSprints[channelId];
  if (!sprint) return;

  const channel = await client.channels.fetch(channelId);
  const sorted = Object.entries(sprint.finalTimes).sort((a, b) => b[1] - a[1]);
  const totalTime = sorted.reduce((sum, [, mins]) => sum + mins, 0);

  let leaderboard = '🏆 **GREAT JOB EVERYONE**\n';
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
  leaderboard += `\nThanks for joining us. You can use the /sprint command to start another <t:${cooldownTime}:R>!\n`;
  leaderboard += `-# <@&${process.env.KEEPERS_ROLE_ID}> a sprint just ended, thank you!`;

  await channel.send(leaderboard);

  clearTimeout(sprint.timer);
  clearTimeout(sprint.finalTimer);
  delete activeSprints[channelId];
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('sprint')
      .setDescription('Start a sprint in this channel')
      .addStringOption(opt =>
        opt.setName('type')
          .setDescription('Type of sprint')
          .setRequired(true)
          .addChoices(
            { name: 'Tall Tomes Sprint', value: 'Tall Tomes Sprint' },
            { name: 'Short Stacks Sprint', value: 'Short Stacks Sprint' },
            { name: 'Readathon Sprint', value: 'Readathon Sprint' },
            { name: 'Writing Sprint', value: 'Writing Sprint' },
            { name: 'Art Sprint', value: 'Art Sprint' },
            { name: 'Study Sprint', value: 'Study Sprint' }
          ))
      .addIntegerOption(opt =>
        opt.setName('minutes')
          .setDescription('Minutes to sprint (Writing/Art/Study only: 15-60)')
          .setRequired(false)
          .setMinValue(15)
          .setMaxValue(60))
      .toJSON(),
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
          .setDescription('Start time in BST/GMT (e.g. 3:00PM or 15:00)')
          .setRequired(true))
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

client.once('ready', async () => {
  console.log(`Sprint bot online as ${client.user.tag}!`);
  await registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const channelId = interaction.channelId;

  if (interaction.commandName === 'sprint') {
    if (activeSprints[channelId]) {
      const sprint = activeSprints[channelId];
      const timeRemaining = Math.ceil((sprint.endTime - Date.now()) / 60000);
      await interaction.reply({ content: `There's a sprint running in this channel, you can join as long as there's more than **5 minutes** remaining! There are currently **${timeRemaining} minutes** left.`, ephemeral: true });
      return;
    }

    if (cooldowns[channelId] && Date.now() < cooldowns[channelId]) {
      const cooldownTime = Math.floor(cooldowns[channelId] / 1000);
      await interaction.reply({ content: `Please wait until <t:${cooldownTime}:R> before starting another sprint!`, ephemeral: true });
      return;
    }

    const type = interaction.options.getString('type');
    const inputMinutes = interaction.options.getInteger('minutes');

    if (fixedDurations[type]) {
      if (inputMinutes && inputMinutes !== fixedDurations[type]) {
        await interaction.reply({ content: `**${type}** is always **${fixedDurations[type]} minutes**!`, ephemeral: true });
        return;
      }
      await interaction.deferReply();
      await startSprint(channelId, type, fixedDurations[type]);
      await interaction.deleteReply();
    } else {
      if (!inputMinutes) {
        await interaction.reply({ content: `Please provide a duration between 15 and 60 minutes for a **${type}**!`, ephemeral: true });
        return;
      }
      await interaction.deferReply();
      await startSprint(channelId, type, inputMinutes);
      await interaction.deleteReply();
    }

    activeSprints[channelId].participants.push(interaction.user.id);
  }

  if (interaction.commandName === 'schedule') {
    const number = interaction.options.getInteger('number');
    const minutes = interaction.options.getInteger('minutes');
    const timeStr = interaction.options.getString('time');

    const startTime = parseTimeToUTC(timeStr);
    if (!startTime) {
      await interaction.reply({ content: 'Invalid time format! Please use something like `3:00PM` or `15:00`.', ephemeral: true });
      return;
    }

    const msUntilStart = startTime.getTime() - Date.now();
    const msUntilWarning = msUntilStart - 15 * 60 * 1000;
    const startTimestamp = Math.floor(startTime.getTime() / 1000);

    await interaction.reply(`✅ Readathon Sprint #${number} scheduled for <t:${startTimestamp}:t>! A reminder will be posted 15 minutes before.`);

    if (msUntilWarning > 0) {
      setTimeout(async () => {
        const channel = await client.channels.fetch(channelId);
        await channel.send(`<@&${process.env.READATHON_ROLE_ID}> Readathon Sprint #${number} is starting in 15 minutes! Use /join to read with us!`);
      }, msUntilWarning);
    }

    setTimeout(async () => {
      await startSprint(channelId, 'Readathon Sprint', minutes, number);
    }, msUntilStart);
  }

  if (interaction.commandName === 'join') {
    if (!activeSprints[channelId]) {
      await interaction.reply({ content: `There isn't a sprint running in this channel. To start one, use the /sprint command!`, ephemeral: true });
      return;
    }

    const sprint = activeSprints[channelId];
    const timeRemaining = (sprint.endTime - Date.now()) / 60000;

    if (timeRemaining < 5) {
      await interaction.reply({ content: `Less than 5 minutes are remaining, join us for the next one!`, ephemeral: true });
      return;
    }

    if (sprint.participants.includes(interaction.user.id)) {
      await interaction.reply({ content: `You have already joined this sprint. Need to leave early? Use the /final command.`, ephemeral: true });
      return;
    }

    sprint.participants.push(interaction.user.id);
    await interaction.reply(`<@${interaction.user.id}> has joined the **${sprint.type}**!`);
  }

  if (interaction.commandName === 'time') {
    if (!activeSprints[channelId]) {
      await interaction.reply({ content: `There isn't a sprint running in this channel. To start one, use the /sprint command!`, ephemeral: true });
      return;
    }

    const sprint = activeSprints[channelId];
    const timeRemaining = Math.ceil((sprint.endTime - Date.now()) / 60000);
    const endTime = Math.floor(sprint.endTime / 1000);
    await interaction.reply({ content: `There are **${timeRemaining} minutes** left in this sprint! It ends at <t:${endTime}:t>.`, ephemeral: true });
  }

  if (interaction.commandName === 'final') {
    const minutes = interaction.options.getInteger('minutes');

    if (!activeSprints[channelId]) {
      await interaction.reply({ content: `There isn't a sprint running in this channel. To start one, use the /sprint command!`, ephemeral: true });
      return;
    }

    const sprint = activeSprints[channelId];
    const verb = sprintVerbs[sprint.type];

    if (!sprint.participants.includes(interaction.user.id) && !sprint.submittedUsers.has(interaction.user.id)) {
      await interaction.reply({ content: `You didn't join this sprint, but if you were reading along, you're welcome to submit your time. Please be honest and share the amount of time you ${verb} during this sprint!`, ephemeral: true });
    } else {
      await interaction.reply({ content: `You have logged **${minutes} minutes** for this sprint!`, ephemeral: true });
    }

    sprint.finalTimes[interaction.user.id] = minutes;
    sprint.submittedUsers.add(interaction.user.id);
    sprint.participants = sprint.participants.filter(id => id !== interaction.user.id);

    const allSubmitted = sprint.participants.every(id => sprint.submittedUsers.has(id));
    if (allSubmitted && Object.keys(sprint.finalTimes).length > 0) {
      await postLeaderboard(channelId);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);