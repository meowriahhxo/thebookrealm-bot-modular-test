const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { google } = require('googleapis');
const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

const HOUSES = [
  { name: "House Asphodel", row: 42, col: 2, color: 0x92374e },
  { name: "House Dreanni", row: 42, col: 3, color: 0x84c6ff },
  { name: "House Laiidon", row: 42, col: 4, color: 0xc2ab81 },
  { name: "House Zeldarian", row: 42, col: 5, color: 0x3eba9a }
];

const monthNames = [
  "January 2026", "February 2026", "March 2026", "April 2026",
  "May 2026", "June 2026", "July 2026", "August 2026",
  "September 2026", "October 2026", "November 2026", "December 2026"
];

const houseEmojis = {
  Asphodel: "❤️",
  Dreanni: "💙",
  Laiidon: "💛",
  Zeldarian: "💚"
};

const houseColors = {
  Asphodel: 0x92374e,
  Dreanni: 0x84c6ff,
  Laiidon: 0xc2ab81,
  Zeldarian: 0x3eba9a
};

let lastProcessedRow = 0;
let lastLeaderboardPost = 0;

async function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheetData() {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const currentMonth = monthNames[new Date().getMonth()];
  
  const housePoints = [];
  for (const house of HOUSES) {
    const col = String.fromCharCode(64 + house.col);
    const range = `${currentMonth}!${col}${house.row}`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.POINTS_SPREADSHEET_ID,
      range: range,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const points = parseFloat(response.data.values?.[0]?.[0]) || 0;
    housePoints.push({ name: house.name, points, color: house.color });
  }
  return housePoints;
}

function buildLeaderboardEmbed(housePoints) {
  const sorted = [...housePoints].sort((a, b) => b.points - a.points);
  const medals = ["🥇", "🥈", "🥉", "4️⃣"];
  const month = monthNames[new Date().getMonth()];
  const gap = (sorted[0].points - sorted[1].points).toLocaleString();

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${month} House Point Standings`)
    .setURL(`https://docs.google.com/spreadsheets/d/${process.env.POINTS_SPREADSHEET_ID}`)
    .setColor(sorted[0].color)
    .setTimestamp()
    .setFooter({ text: "The Book Realm • Click the title to view the full spreadsheet!" });

  for (let i = 0; i < sorted.length; i++) {
    embed.addFields({ name: `${medals[i]} ${sorted[i].name}`, value: `${sorted[i].points.toLocaleString()} points`, inline: false });
  }

  embed.addFields(
    { name: '\u200B', value: '\u200B', inline: false },
    { name: '⚔️ Points Gap', value: `**${sorted[0].name}** leads by **${gap} points**`, inline: false }
  );

  return embed;
}

async function postLeaderboard() {
  const now = Date.now();
  if (now - lastLeaderboardPost < 60000) return;
  lastLeaderboardPost = now;
  
  try {
    const housePoints = await getSheetData();
    const embed = buildLeaderboardEmbed(housePoints);
    const channel = await client.channels.fetch(process.env.LEADERBOARD_CHANNEL_ID);
    await channel.send({ embeds: [embed] });
    console.log('Leaderboard posted successfully!');
  } catch (error) {
    console.error('Error posting leaderboard:', error);
  }
}

async function initializeLastProcessedRow() {
  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SORTING_QUIZ_SPREADSHEET_ID,
      range: 'A:A',
    });
    lastProcessedRow = (response.data.values || []).length;
    console.log(`Starting from row ${lastProcessedRow}`);
  } catch (error) {
    console.error('Error initializing last processed row:', error);
  }
}

async function processQuizSubmission(row, rowNumber) {
  const houseCounts = { Asphodel: 0, Dreanni: 0, Laiidon: 0, Zeldarian: 0 };
  
  const memberName = row[1] || 'Unknown';
  const submissionNumber = rowNumber - 1;

  const answers = [
    //question one - If extra lives were a thing how would you get them?
    { answer: "Looking at academic studies and choosing the most accessible way.", house: "Laiidon" },
    { answer: "Making people happy and making them laugh.", house: "Dreanni" },
    { answer: "Going on a quest to get an extra life.", house: "Zeldarian" },
    { answer: "By showing compassion/performing acts of kindness for others", house: "Asphodel" },
    //quesiton two - What would your strategy be for an apocalypse?
    { answer: "Make allies with as many people as I can so that we could work together.", house: "Dreanni" },
    { answer: "Use the resources around me and prioritize safety and rationing food.", house: "Laiidon" },
    { answer: "Talk out your differences with the zombies and make a peace treaty.", house: "Zeldarian" },
    { answer: "Hunker down with and protect those I love most", house: "Asphodel" },
    //question three - What is your favourite season?
    { answer: "Spring", house: "Zeldarian" },
    { answer: "Summer", house: "Dreanni" },
    { answer: "Autumn / Fall", house: "Laiidon" },
    { answer: "Winter", house: "Asphodel" },
    //question four - What would you bring with you to a deserted island?
    { answer: "A phone so that I can call for help and read e-books while waiting", house: "Zeldarian" },
    { answer: "A journal containing personal rituals and spells and a solar charger", house: "Asphodel" },
    { answer: "Books related to botany so I know what is safe to eat.", house: "Laiidon" },
    { answer: "Is it possible to bring another person with me?", house: "Dreanni" },
    //question five - What do you value most in people?
    { answer: "Their ability to make the best out of any situation", house: "Dreanni" },
    { answer: "Their ability to be respectful of others opinions", house: "Laiidon" },
    { answer: "Their ability to be discreetly supportive and sarcastic", house: "Zeldarian" },
    { answer: "Their ability to be honest", house: "Asphodel" },
    //question six - If you could level up any aspect of yourself what would it be?
    { answer: "Not sacrificing your own happiness to make other people happy", house: "Dreanni" },
    { answer: "Being better at dealing with emotions", house: "Laiidon" },
    { answer: "Socializing", house: "Zeldarian" },
    { answer: "Not caring what other people think and just being your authentic self", house: "Asphodel" },
    //question seven - Is there a meaning to life? If so, what is it?
    { answer: "Being happy and not caring what other people think", house: "Asphodel" },
    { answer: "Making every moment filled with laughter and experience", house: "Zeldarian" },
    { answer: "Making the best memories and friendships and living life to the fullest", house: "Dreanni" },
    { answer: "Making the most out of your life through having a bunch of hobbies", house: "Laiidon" },
    //question eight - What should be the goal of humanity?
    { answer: "Learning from experiences and mistakes so that there's empathy everywhere", house: "Zeldarian" },
    { answer: "Embracing the beauty in all aspects of life while advocating for justice and compassion", house: "Asphodel" },
    { answer: "Expanding our knowledge of the world and helping people so no one has to live in poverty", house: "Laiidon" },
    { answer: "Working together as a whole to help make the world better.", house: "Dreanni" },
    //question nine - How would you like to be remembered after you are gone?
    { answer: "By being the person everyone wishes to have by their side when they're going through tough times", house: "Zeldarian" },
    { answer: "For being myself and showing kindness to everyone, and being just generally an awesome accepting person", house: "Asphodel" },
    { answer: "For my successes in life", house: "Laiidon" },
    { answer: "For the people that I have helped.", house: "Dreanni" },
    //question ten - You have been transported to a magical land what’s the first thing you do?
    { answer: "Ask if dragons or magical creatures exist", house: "Asphodel" },
    { answer: "Make friends with the nearest magical being. I have to know everyone!", house: "Dreanni" },
    { answer: "So many opportunities…...what to choose?", house: "Zeldarian" },
    { answer: "Explore the nearest village and try to blend in", house: "Laiidon" },
    //question eleven - What fantasy being would you want to be?
    { answer: "A magic user", house: "Laiidon" },
    { answer: "A siren", house: "Asphodel" },
    { answer: "An elf", house: "Zeldarian" },
    { answer: "A werewolf", house: "Dreanni" },
    //question twelve - What steps do you take to remain calm under pressure?
    { answer: "Silently regret all your life decisions that have lead to this point in your life", house: "Asphodel" },
    { answer: "Talk to myself, and remind myself that i have it under control (even when I don't)", house: "Zeldarian" },
    { answer: "Cope with humor", house: "Dreanni" },
    { answer: "Practically think about all possible outcomes of the situation", house: "Laiidon" },
    //quesiton thirteen - What vacation destination sounds more appealing to you?
    { answer: "Hawaii", house: "Dreanni" },
    { answer: "Japan", house: "Zeldarian" },
    { answer: "Italy", house: "Laiidon" },
    { answer: "Ancient Greece", house: "Asphodel" },
    //question fourteen - What trait would your friends use to best describe you?
    { answer: "Goofy", house: "Zeldarian" },
    { answer: "Trustworthy", house: "Dreanni" },
    { answer: "Compassionate", house: "Asphodel" },
    { answer: "Opinionated", house: "Laiidon" },
    //question fifteen - If you weren’t reading a book, what would you typically find yourself doing in your spare time?
    { answer: "Practicing my musical instrument", house: "Laiidon" },
    { answer: "Being on social media", house: "Dreanni" },
    { answer: "Unwinding with another hobby I've collected", house: "Asphodel" },
    { answer: "Admiring myself in the mirror", house: "Zeldarian" },
  ];

  for (let i = 2; i < row.length - 1; i++) {
    const answer = row[i]?.toString().trim();
    const match = answers.find(a => a.answer === answer);
    if (match) houseCounts[match.house]++;
  }

  const winner = Object.keys(houseCounts).reduce((a, b) => houseCounts[a] > houseCounts[b] ? a : b);
  const topScore = houseCounts[winner];
  const tiedHouses = Object.keys(houseCounts).filter(h => houseCounts[h] === topScore);
  const tieNote = tiedHouses.length > 1 ? `\n‼️ **Tie between ${tiedHouses.join(" and ")}! Please choose the house with the lower member count!**` : "";

  const embed = new EmbedBuilder()
    .setTitle(`✨ New Sorting Quiz Submission ${submissionNumber} ✨`)
    .setDescription(`Don't forget to check house count before announcing the results!`)
    .setColor(tiedHouses.length > 1 ? 0xff0000 : houseColors[winner])
    .setFooter({ text: `Submitted at: ${new Date((row[0] - 25569) * 86400 * 1000).toLocaleString()}` })
    .addFields(
      { name: "❤️ Asphodel", value: `${houseCounts.Asphodel}`, inline: false },
      { name: "💙 Dreanni", value: `${houseCounts.Dreanni}`, inline: false },
      { name: "💛 Laiidon", value: `${houseCounts.Laiidon}`, inline: false },
      { name: "💚 Zeldarian", value: `${houseCounts.Zeldarian}`, inline: false },
      { name: "Results", value: `**${memberName}** has been sorted into **House ${winner}**! ${houseEmojis[winner]}${tieNote}`, inline: false }
    );

  const channel = await client.channels.fetch(process.env.SORTING_CHANNEL_ID);
  await channel.send({ 
    content: `<@&${process.env.MOD_ROLE_ID}> A new member has completed the sorting quiz!`,
    embeds: [embed] 
  });
}

async function checkForNewQuizSubmissions() {
  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SORTING_QUIZ_SPREADSHEET_ID,
      range: 'A:Z',
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    
    const rows = response.data.values || [];
    if (rows.length <= lastProcessedRow) return;
    
    for (let i = lastProcessedRow; i < rows.length; i++) {
      await processQuizSubmission(rows[i], i + 1);
    }
    
    lastProcessedRow = rows.length;
  } catch (error) {
    console.error('Error checking quiz submissions:', error);
  }
}

async function getStickyMessages() {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GLUE_STICK_SPREADSHEET_ID,
    range: 'A2:D',
  });
  return response.data.values || [];
}

async function saveStickyMessage(channelName, channelId, message, messageId) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const rows = await getStickyMessages();
  const existingIndex = rows.findIndex(row => row[1] === channelId);
  
  if (existingIndex !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GLUE_STICK_SPREADSHEET_ID,
      range: `A${existingIndex + 2}:D${existingIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[channelName, channelId, message, messageId]] }
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GLUE_STICK_SPREADSHEET_ID,
      range: 'A2:D',
      valueInputOption: 'RAW',
      requestBody: { values: [[channelName, channelId, message, messageId]] }
    });
  }
}

async function deleteStickyMessage(channelId) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const rows = await getStickyMessages();
  const existingIndex = rows.findIndex(row => row[1] === channelId);
  if (existingIndex !== -1) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: process.env.GLUE_STICK_SPREADSHEET_ID,
      range: `A${existingIndex + 2}:D${existingIndex + 2}`,
    });
  }
}

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
      .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
  console.log('Slash commands registered!');
}

client.once('clientReady', async () => {
  console.log(`Bot is online as ${client.user.tag}!`);
  await initializeLastProcessedRow();
  await registerCommands();
  
  cron.schedule('*/30 * * * *', () => {
    postLeaderboard();
  });

  cron.schedule('* * * * *', () => {
    checkForNewQuizSubmissions();
  });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  
  if (interaction.commandName === 'leaderboard') {
    try {
      await interaction.deferReply();
      const housePoints = await getSheetData();
      const embed = buildLeaderboardEmbed(housePoints);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error handling leaderboard command:', error);
    }
  }

  if (interaction.commandName === 'stick') {
    try {
      await interaction.deferReply({ ephemeral: true });
      const message = interaction.options.getString('message');
      const channel = interaction.channel;
      const rows = await getStickyMessages();
      const existing = rows.find(row => row[1] === channel.id);
      if (existing && existing[3]) {
        try {
          const oldMessage = await channel.messages.fetch(existing[3]);
          await oldMessage.delete();
        } catch (e) {}
      }
      const sent = await channel.send(`${message}`);
      await saveStickyMessage(channel.name, channel.id, message, sent.id);
      await interaction.editReply({ content: 'Sticky message set!' });
    } catch (error) {
      console.error('Error setting sticky message:', error);
      await interaction.reply({ content: 'Something went wrong!', ephemeral: true });
    }
  }

if (interaction.commandName === 'editstick') {
    try {
      await interaction.deferReply({ ephemeral: true });
      const message = interaction.options.getString('message');
      const channel = interaction.channel;
      const rows = await getStickyMessages();
      const existing = rows.find(row => row[1] === channel.id);
      if (!existing) {
        await interaction.editReply({ content: 'No sticky message found in this channel!' });
        return;
      }
      if (existing[3]) {
        try {
          const oldMessage = await channel.messages.fetch(existing[3]);
          await oldMessage.delete();
        } catch (e) {}
      }
      const sent = await channel.send(`${message}`);
      await saveStickyMessage(channel.name, channel.id, message, sent.id);
      await interaction.editReply({ content: 'Sticky message updated!' });
    } catch (error) {
      console.error('Error editing sticky message:', error);
    }
  }

  if (interaction.commandName === 'unstick') {
    try {
      await interaction.deferReply({ ephemeral: true });
      const channel = interaction.channel;
      const rows = await getStickyMessages();
      const existing = rows.find(row => row[1] === channel.id);
      if (!existing) {
        await interaction.editReply({ content: 'No sticky message found in this channel!' });
        return;
      }
      if (existing[3]) {
        try {
          const oldMessage = await channel.messages.fetch(existing[3]);
          await oldMessage.delete();
        } catch (e) {}
      }
      await deleteStickyMessage(channel.id);
      await interaction.editReply({ content: 'Sticky message removed!' });
    } catch (error) {
      console.error('Error removing sticky message:', error);
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  try {
    const rows = await getStickyMessages();
    const sticky = rows.find(row => row[1] === message.channelId);
    
    if (!sticky || !sticky[2]) return;
    
    if (sticky[3]) {
      try {
        const oldMessage = await message.channel.messages.fetch(sticky[3]);
        await oldMessage.delete();
      } catch (e) {}
    }
    
    const sent = await message.channel.send(`${sticky[2]}`);
    await saveStickyMessage(sticky[0], sticky[1], sticky[2], sent.id);
  } catch (error) {
    console.error('Error reposting sticky message:', error);
  }
});

client.on('guildMemberAdd', async member => {
  try {
    const { createCanvas, loadImage, registerFont } = require('canvas');
    registerFont('./Roboto-Bold.ttf', { family: 'Roboto', weight: 'bold' });
    registerFont('./Roboto-Regular.ttf', { family: 'Roboto' });
    const canvas = createCanvas(800, 300);
    const ctx = canvas.getContext('2d');

    // Draw background
    const background = await loadImage('./welcome-background.png');
    ctx.drawImage(background, 0, 0, 800, 300);

    // Draw circular avatar
    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
    const avatar = await loadImage(avatarURL);
    ctx.save();
    ctx.beginPath();
    ctx.arc(150, 150, 90, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 60, 60, 180, 180);
    ctx.restore();

    // Optional: white ring around avatar
    ctx.beginPath();
    ctx.arc(150, 150, 91, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    // "Welcome!" text
    ctx.fillStyle = '#b16caf';
    ctx.font = 'bold 34px Roboto';
    ctx.fillText('Welcome to The Book Realm!', 280, 120);

    // Username text
    ctx.font = '28px Roboto';
    ctx.fillStyle = '#555555';
    ctx.fillText(`${member.user.username} just joined the server`, 280, 170);

    // Member count
    const memberCount = member.guild.memberCount;
    ctx.font = '22px Roboto';
    ctx.fillStyle = '#888888';
    ctx.fillText(`Member #${memberCount}`, 280, 215);

    // Send to channel
    const { AttachmentBuilder } = require('discord.js');
    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'welcome.png' });
    const channel = await client.channels.fetch(process.env.JOINS_LEAVES_CHANNEL_ID);
    await channel.send({ 
    content: `Hello <@${member.id}>, welcome to **The Book Realm**!\nAll of the server channels and rules can be found in <#971504387056885861>. <a:book_pages:838547896361811979> We suggest you first take the house quiz, which can be found in the same channel under the *House System* header. Each house competes monthly for the House Cup! Next, you can head over to <#971504539138130010> and let us know a little bit about you, and then <#971501013297135636> to choose which channels and activities you'd like to be notified about or participate in. If you have any questions, please feel free to ping a moderator or DM the ModMail bot (instructions are outlined in the welcome channel). The moderators are pink, purple, and dark blue 💜`,
      files: [attachment] 
    });

  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
});

client.on('guildMemberRemove', async member => {
  try {
    const channel = await client.channels.fetch(process.env.JOINS_LEAVES_CHANNEL_ID);
    await channel.send(`**${member.user.username}** just left the realm <a:book_pages:838547896361811979> We will miss you! :(`);
  } catch (error) {
    console.error('Error sending leave message:', error);
  }
});

client.login(process.env.DISCORD_TOKEN);