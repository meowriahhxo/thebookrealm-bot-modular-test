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

const sprintVerbs = {
  'Tall Tomes Sprint': 'read',
  'Short Stacks Sprint': 'read',
  'Readathon Sprint': 'read',
  'Writing Sprint': 'wrote',
  'Art Sprint': 'created',
  'Study Sprint': 'studied'
};

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('sprint')
      .setDescription('Start a sprint in this channel')
      .addIntegerOption(opt =>
        opt.setName('minutes')
          .setDescription('How many minutes to sprint')
          .setRequired(true))
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
      const timeRemaining = Math.ceil((sprint.startTime + sprint.duration * 60 * 1000 - Date.now()) / 60000);
      await interaction.reply({ content: `There's a sprint running in this channel, you can join as long as there's more than **5 minutes** remaining! There are currently **${timeRemaining} minutes** left.`, ephemeral: true });
      return;
    }

    if (cooldowns[channelId] && Date.now() < cooldowns[channelId]) {
      const cooldownTime = Math.floor(cooldowns[channelId] / 1000);
      await interaction.reply({ content: `Please wait until <t:${cooldownTime}:R> before starting another sprint!`, ephemeral: true });
      return;
    }

    const minutes = interaction.options.getInteger('minutes');
    const type = interaction.options.getString('type');
    const endTime = Math.floor((Date.now() + minutes * 60 * 1000) / 1000);

    await interaction.reply(`A **${type}** has started. There are **${minutes} minutes** left in this sprint, and it ends at <t:${endTime}:t>. Use /join to join and /final if you have to leave early!`);

    activeSprints[channelId] = {
      type,
      duration: minutes,
      startTime: Date.now(),
      endTime: Date.now() + minutes * 60 * 1000,
      participants: [interaction.user.id],
      finalTimes: {},
      submittedUsers: new Set(),
      timer: setTimeout(async () => {
        const sprint = activeSprints[channelId];
        if (!sprint) return;

        const channel = await client.channels.fetch(channelId);
        const verb = sprintVerbs[sprint.type];
        const finalDeadline = Math.floor((Date.now() + 5 * 60 * 1000) / 1000);
        const mentions = sprint.participants.map(id => `<@${id}>`).join(', ');

        await channel.send(`${mentions}\nThis **${sprint.type}** is over, please put in the amount of time you ${verb}. You have <t:${finalDeadline}:R> to put in your final count!`);

        sprint.finalTimer = setTimeout(() => postLeaderboard(channelId), 5 * 60 * 1000);
      }, minutes * 60 * 1000)
    };
  }

  if (interaction.commandName === 'join') {
    if (!activeSprints[channelId]) {
      await interaction.reply({ content: `There isn't a sprint running in this channel. To start one, use the /sprint command!`, ephemeral: true });
      return;
    }

    const sprint = activeSprints[channelId];
    const timeRemaining = (sprint.startTime + sprint.duration * 60 * 1000 - Date.now()) / 60000;

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

    if (!activeSprints[channelId] && !Object.keys(activeSprints).includes(channelId)) {
      await interaction.reply({ content: `There isn't a sprint running in this channel. To start one, use the /sprint command!`, ephemeral: true });
      return;
    }

    const sprint = activeSprints[channelId];

    if (!sprint.participants.includes(interaction.user.id) && !sprint.submittedUsers.has(interaction.user.id)) {
      await interaction.reply({ content: `You didn't join this sprint, but if you were reading along, you're welcome to submit your time. Please be honest and share the amount of time you ${sprintVerbs[sprint.type]} during this sprint!`, ephemeral: true });
    }

    sprint.finalTimes[interaction.user.id] = minutes;
    sprint.submittedUsers.add(interaction.user.id);

    if (sprint.participants.includes(interaction.user.id)) {
      sprint.participants = sprint.participants.filter(id => id !== interaction.user.id);
    }

    await interaction.reply({ content: `You have logged **${minutes} minutes** for this sprint!`, ephemeral: true });

    const allSubmitted = sprint.participants.every(id => sprint.submittedUsers.has(id));
    if (allSubmitted && Object.keys(sprint.finalTimes).length > 0) {
      await postLeaderboard(channelId);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);