const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { google } = require('googleapis');
const cron = require('node-cron');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

// ---- HOUSE CONSTANTS ----
const HOUSES = [
  { name: "House Asphodel", row: 43, col: 2, color: 0x92374e },
  { name: "House Dreanni", row: 43, col: 3, color: 0x84c6ff },
  { name: "House Laiidon", row: 43, col: 4, color: 0xc2ab81 },
  { name: "House Zeldarian", row: 43, col: 5, color: 0x3eba9a }
];

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const houseEmojis = {
  Asphodel: "<a:asphbow:1492903800103763988>",
  Dreanni: "<a:dreannibow:1492903922355011777>",
  Laiidon: "<a:laiidonbow:1492903941292298260>",
  Zeldarian: "<a:zeldbow:1492903964998369570>"
};

const houseColors = {
  Asphodel: 0x92374e,
  Dreanni: 0x84c6ff,
  Laiidon: 0xc2ab81,
  Zeldarian: 0x3eba9a
};

// ---- SPRINT CONSTANTS ----
const activeSprints = {};
const pendingSprints = {};
const scheduledSprints = {};
const cooldowns = {};

const channelSprintTypes = {
  [process.env.TALL_TOMES_CHANNEL_ID]: 'Tall Tomes Sprint',
  [process.env.SHORT_STACKS_CHANNEL_ID]: 'Short Stacks Sprint',
  [process.env.READATHON_CHANNEL_ID]: 'Readathon Sprint',
  [process.env.WRITING_CHANNEL_ID]: 'Writing Sprint',
  [process.env.ART_CHANNEL_ID]: 'Art Sprint',
  [process.env.STUDY_CHANNEL_ID]: 'Study Sprint'
};

const sprintEmojis = {
  'Tall Tomes Sprint': ['📚', '📖', '🔖', '🌙', '✨', '⭐'],
  'Short Stacks Sprint': ['📚', '📖', '🔖', '🌙', '✨', '⭐'],
  'Readathon Sprint': ['📚', '📖', '🔖', '🌙', '✨', '⭐'],
  'Writing Sprint': ['✍️', '📝', '💫', '🖊️', '🌙', '⭐'],
  'Art Sprint': ['🎨', '🖌️', '✨', '🌈', '💫', '🎭'],
  'Study Sprint': ['📝', '📐', '💡', '🧠', '⭐', '🔍']
};

const sprintVerbs = {
  'Tall Tomes Sprint': 'read',
  'Short Stacks Sprint': 'read',
  'Readathon Sprint': 'read',
  'Writing Sprint': 'wrote',
  'Art Sprint': 'created',
  'Study Sprint': 'studied'
};

const sprintHappyVerbs = {
  'Tall Tomes Sprint': 'Happy reading!',
  'Short Stacks Sprint': 'Happy reading!',
  'Readathon Sprint': 'Happy reading!',
  'Writing Sprint': 'Happy writing!',
  'Art Sprint': 'Happy creating!',
  'Study Sprint': 'Happy studying!'
};

const fixedDurations = {
  'Short Stacks Sprint': 30,
  'Tall Tomes Sprint': 60,
};

const sprintRoles = {
  'Tall Tomes Sprint': process.env.TALL_TOMES_ROLE_ID,
  'Short Stacks Sprint': process.env.SHORT_STACKS_ROLE_ID,
  'Readathon Sprint': process.env.READATHON_ROLE_ID,
  'Writing Sprint': process.env.WRITING_ROLE_ID,
  'Art Sprint': process.env.ART_ROLE_ID,
  'Study Sprint': process.env.STUDY_ROLE_ID
};

const sprintSpamThreads = {
  'Tall Tomes Sprint': process.env.READING_SPAM_THREAD_ID,
  'Short Stacks Sprint': process.env.READING_SPAM_THREAD_ID,
  'Readathon Sprint': process.env.READING_SPAM_THREAD_ID,
  'Writing Sprint': process.env.WRITING_SPAM_THREAD_ID,
  'Art Sprint': process.env.ART_SPAM_THREAD_ID,
  'Study Sprint': process.env.STUDY_SPAM_THREAD_ID,
};

//-----MORNING MESSAGE CONSTANTS----
// 🔄 CHANGE THIS EACH MONTH
const CHECKIN_EMOJI = '🐰';

const COMMON_ROOM_EMOJIS = [
  '🪥', '🛏️', '👑', '💊', '👕',
  '🦷', '⚕️', '🚿', '🥛', '🍕',
  '📖', CHECKIN_EMOJI
];

const COMMON_ROOM_HOUSES = [
  {
    channelId: process.env.ASPHODEL_COMMONROOM_CHANNEL_ID,
    roleId: process.env.ASPHODEL_ROLE_ID,
    name: 'Asphodel',
  },
  {
    channelId: process.env.DREANNI_COMMONROOM_CHANNEL_ID,
    roleId: process.env.DREANNI_ROLE_ID,
    name: 'Dreanni',
  },
  {
    channelId: process.env.LAIIDON_COMMONROOM_CHANNEL_ID,
    roleId: process.env.LAIIDON_ROLE_ID,
    name: 'Laiidon',
  },
  {
    channelId: process.env.ZELDARIAN_COMMONROOM_CHANNEL_ID,
    roleId: process.env.ZELDARIAN_ROLE_ID,
    name: 'Zeldarian',
  },
];

const commonRoomMessageIds = {};


// ---- DATABASE ----
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sticky_messages (
        channel_id TEXT PRIMARY KEY,
        channel_name TEXT,
        message TEXT,
        message_id TEXT
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sprint_results (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        sprint_type TEXT NOT NULL,
        minutes INTEGER NOT NULL,
        sprint_date DATE NOT NULL
      )
    `);
    await pool.query(`
  CREATE TABLE IF NOT EXISTS active_sprints (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    type TEXT NOT NULL,
    duration INTEGER NOT NULL,
    start_time BIGINT NOT NULL,
    end_time BIGINT NOT NULL,
    sprint_number INTEGER,
    participants TEXT[] DEFAULT '{}',
    original_participants TEXT[] DEFAULT '{}',
    final_times JSONB DEFAULT '{}',
    submitted_users TEXT[] DEFAULT '{}'
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS pending_sprints (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    type TEXT NOT NULL,
    duration INTEGER NOT NULL,
    starts_at BIGINT NOT NULL,
    sprint_number INTEGER,
    participants TEXT[] DEFAULT '{}'
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS scheduled_sprints (
    id SERIAL PRIMARY KEY,
    channel_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    sprint_number INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    start_time BIGINT NOT NULL,
    participants TEXT[] DEFAULT '{}'
  )
`);
    console.log('Database initialized!');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

async function getStickyMessages() {
  const result = await pool.query('SELECT * FROM sticky_messages');
  return result.rows;
}

async function getStickyByChannel(channelId) {
  const result = await pool.query('SELECT * FROM sticky_messages WHERE channel_id = $1', [channelId]);
  return result.rows[0] || null;
}

async function saveStickyMessage(channelName, channelId, message, messageId) {
  await pool.query(`
    INSERT INTO sticky_messages (channel_id, channel_name, message, message_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (channel_id) DO UPDATE
    SET channel_name = $2, message = $3, message_id = $4
  `, [channelId, channelName, message, messageId]);
}

async function deleteStickyMessage(channelId) {
  await pool.query('DELETE FROM sticky_messages WHERE channel_id = $1', [channelId]);
}

async function saveSprintResult(userId, guildId, sprintType, minutes) {
  await pool.query(
    `INSERT INTO sprint_results (user_id, guild_id, sprint_type, minutes, sprint_date)
     VALUES ($1, $2, $3, $4, CURRENT_DATE)`,
    [userId, guildId, sprintType, minutes]
  );
}

// ---- SPRINT STATE PERSISTENCE ----
async function saveActiveSprint(channelId, sprint) {
  await pool.query(`
    INSERT INTO active_sprints (channel_id, guild_id, type, duration, start_time, end_time, sprint_number, participants, original_participants, final_times, submitted_users)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (channel_id) DO UPDATE SET
      guild_id = $2, type = $3, duration = $4, start_time = $5, end_time = $6,
      sprint_number = $7, participants = $8, original_participants = $9,
      final_times = $10, submitted_users = $11
  `, [
    channelId,
    sprint.guildId,
    sprint.type,
    sprint.duration,
    sprint.startTime,
    sprint.endTime,
    sprint.sprintNumber || null,
    [...(sprint.participants || [])],
    [...(sprint.originalParticipants || [])],
    JSON.stringify(sprint.finalTimes || {}),
    [...(sprint.submittedUsers || [])]
  ]);
}

async function savePendingSprint(channelId, sprint) {
  await pool.query(`
    INSERT INTO pending_sprints (channel_id, guild_id, type, duration, starts_at, sprint_number, participants)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (channel_id) DO UPDATE SET
      guild_id = $2, type = $3, duration = $4, starts_at = $5,
      sprint_number = $6, participants = $7
  `, [
    channelId,
    sprint.guildId,
    sprint.type,
    sprint.duration,
    sprint.startsAt,
    sprint.sprintNumber || null,
    [...(sprint.participants || [])]
  ]);
}

async function saveScheduledSprint(channelId, sprint) {
  await pool.query(`
    INSERT INTO scheduled_sprints (channel_id, guild_id, sprint_number, duration, start_time, participants)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (channel_id, sprint_number) DO UPDATE SET
      guild_id = $2, duration = $4, start_time = $5, participants = $6
  `, [
    channelId,
    sprint.guildId,
    sprint.number,
    sprint.minutes,
    sprint.startTime,
    [...(sprint.participants || [])]
  ]);
}

async function deleteActiveSprint(channelId) {
  await pool.query('DELETE FROM active_sprints WHERE channel_id = $1', [channelId]);
}

async function deletePendingSprint(channelId) {
  await pool.query('DELETE FROM pending_sprints WHERE channel_id = $1', [channelId]);
}

async function deleteScheduledSprint(channelId, sprintNumber) {
  await pool.query('DELETE FROM scheduled_sprints WHERE channel_id = $1 AND sprint_number = $2', [channelId, sprintNumber]);
}

// ---- GOOGLE AUTH ----
async function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ---- LEADERBOARD ----
let lastLeaderboardPost = 0;

async function getSheetData() {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const easternTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const currentMonth = `${monthNames[easternTime.getMonth()]} ${easternTime.getFullYear()}`;

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
  const easternTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const month = `${monthNames[easternTime.getMonth()]} ${easternTime.getFullYear()}`;
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

async function postHouseLeaderboard() {
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

// ---- SORTING QUIZ ----
let lastProcessedRow = 0;

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
    { answer: "Looking at academic studies and choosing the most accessible way.", house: "Laiidon" },
    { answer: "Making people happy and making them laugh.", house: "Dreanni" },
    { answer: "Going on a quest to get an extra life.", house: "Zeldarian" },
    { answer: "By showing compassion/performing acts of kindness for others", house: "Asphodel" },
    { answer: "Make allies with as many people as I can so that we could work together.", house: "Dreanni" },
    { answer: "Use the resources around me and prioritize safety and rationing food.", house: "Laiidon" },
    { answer: "Talk out your differences with the zombies and make a peace treaty.", house: "Zeldarian" },
    { answer: "Hunker down with and protect those I love most", house: "Asphodel" },
    { answer: "Spring", house: "Zeldarian" },
    { answer: "Summer", house: "Dreanni" },
    { answer: "Autumn / Fall", house: "Laiidon" },
    { answer: "Winter", house: "Asphodel" },
    { answer: "A phone so that I can call for help and read e-books while waiting", house: "Zeldarian" },
    { answer: "A journal containing personal rituals and spells and a solar charger", house: "Asphodel" },
    { answer: "Books related to botany so I know what is safe to eat.", house: "Laiidon" },
    { answer: "Is it possible to bring another person with me?", house: "Dreanni" },
    { answer: "Their ability to make the best out of any situation", house: "Dreanni" },
    { answer: "Their ability to be respectful of others opinions", house: "Laiidon" },
    { answer: "Their ability to be discreetly supportive and sarcastic", house: "Zeldarian" },
    { answer: "Their ability to be honest", house: "Asphodel" },
    { answer: "Not sacrificing your own happiness to make other people happy", house: "Dreanni" },
    { answer: "Being better at dealing with emotions", house: "Laiidon" },
    { answer: "Socializing", house: "Zeldarian" },
    { answer: "Not caring what other people think and just being your authentic self", house: "Asphodel" },
    { answer: "Being happy and not caring what other people think", house: "Asphodel" },
    { answer: "Making every moment filled with laughter and experience", house: "Zeldarian" },
    { answer: "Making the best memories and friendships and living life to the fullest", house: "Dreanni" },
    { answer: "Making the most out of your life through having a bunch of hobbies", house: "Laiidon" },
    { answer: "Learning from experiences and mistakes so that there's empathy everywhere", house: "Zeldarian" },
    { answer: "Embracing the beauty in all aspects of life while advocating for justice and compassion", house: "Asphodel" },
    { answer: "Expanding our knowledge of the world and helping people so no one has to live in poverty", house: "Laiidon" },
    { answer: "Working together as a whole to help make the world better.", house: "Dreanni" },
    { answer: "By being the person everyone wishes to have by their side when they're going through tough times", house: "Zeldarian" },
    { answer: "For being myself and showing kindness to everyone, and being just generally an awesome accepting person", house: "Asphodel" },
    { answer: "For my successes in life", house: "Laiidon" },
    { answer: "For the people that I have helped.", house: "Dreanni" },
    { answer: "Ask if dragons or magical creatures exist", house: "Asphodel" },
    { answer: "Make friends with the nearest magical being. I have to know everyone!", house: "Dreanni" },
    { answer: "So many opportunities…...what to choose?", house: "Zeldarian" },
    { answer: "Explore the nearest village and try to blend in", house: "Laiidon" },
    { answer: "A magic user", house: "Laiidon" },
    { answer: "A siren", house: "Asphodel" },
    { answer: "An elf", house: "Zeldarian" },
    { answer: "A werewolf", house: "Dreanni" },
    { answer: "Silently regret all your life decisions that have lead to this point in your life", house: "Asphodel" },
    { answer: "Talk to myself, and remind myself that i have it under control (even when I don't)", house: "Zeldarian" },
    { answer: "Cope with humor", house: "Dreanni" },
    { answer: "Practically think about all possible outcomes of the situation", house: "Laiidon" },
    { answer: "Hawaii", house: "Dreanni" },
    { answer: "Japan", house: "Zeldarian" },
    { answer: "Italy", house: "Laiidon" },
    { answer: "Ancient Greece", house: "Asphodel" },
    { answer: "Goofy", house: "Zeldarian" },
    { answer: "Trustworthy", house: "Dreanni" },
    { answer: "Compassionate", house: "Asphodel" },
    { answer: "Opinionated", house: "Laiidon" },
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
      { name: "<:asphheart:1492573486785499307> Asphodel", value: `${houseCounts.Asphodel}`, inline: false },
      { name: "<:dreanniheart:1492573488425340928> Dreanni", value: `${houseCounts.Dreanni}`, inline: false },
      { name: "<:laiidonheart:1492573490434281532> Laiidon", value: `${houseCounts.Laiidon}`, inline: false },
      { name: "<:zeldheart:1492573492564983970> Zeldarian", value: `${houseCounts.Zeldarian}`, inline: false },
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

// ---- SPRINT HELPERS ----
function randomEmoji(type) {
  const pool = sprintEmojis[type];
  return pool[Math.floor(Math.random() * pool.length)];
}

function isGMT() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const lastSundayMarch = new Date(Date.UTC(year, 2, 31));
  lastSundayMarch.setUTCDate(31 - lastSundayMarch.getUTCDay());
  const lastSundayOctober = new Date(Date.UTC(year, 9, 31));
  lastSundayOctober.setUTCDate(31 - lastSundayOctober.getUTCDay());
  return now < lastSundayMarch || now >= lastSundayOctober;
}

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

// ---- SPRINT FUNCTIONS ----
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
    endMessageSent: false,

    timer: setTimeout(async () => {
      const sprint = activeSprints[channelId];
      if (!sprint || sprint.endMessageSent) return;
      sprint.endMessageSent = true;

      const verb = sprintVerbs[sprint.type];
      const submitWindow = minutes <= 30 ? 5 : 7;
      const finalDeadline = Math.floor((Date.now() + submitWindow * 60 * 1000) / 1000);
      const mentions = sprint.originalParticipants.size > 0
        ? [...sprint.originalParticipants].map(id => `<@${id}>`).join(', ')
        : null;
      const endEmoji = randomEmoji(type);

      const participantText = mentions ? `\n\n✨ **Participants:**\n${mentions}` : '\n\n✨ **Participants:**';
      await channel.send(`${endEmoji} **THE SPRINT IS OVER** ${endEmoji}\n\nThis **${sprintLabel}** is over, please put in the amount of time you ${verb}. The leaderboard will post <t:${finalDeadline}:R>, you have until then to put in your final count!${participantText}`);

      sprint.reminderTimer = setTimeout(async () => {
        const unsubmitted = [...sprint.originalParticipants].filter(id => !sprint.submittedUsers.has(id));
        if (unsubmitted.length > 0) {
          const reminderMentions = unsubmitted.map(id => `<@${id}>`).join(', ');
          await channel.send(`‼️ **Reminder:**\n${reminderMentions}\nYou have 2 minutes left to submit your final time with \`/final\`!`);
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

  // Save sprint state to database
  await saveActiveSprint(channelId, {
    guildId: guild.id,
    type,
    duration: minutes,
    startTime: activeSprints[channelId].startTime,
    endTime: activeSprints[channelId].endTime,
    sprintNumber,
    participants: [...carriedParticipants],
    originalParticipants: new Set(carriedParticipants),
    finalTimes: {},
    submittedUsers: new Set()
  });
  await deletePendingSprint(channelId);
}

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

  leaderboard += `\nMinutes Read: **${totalTime} minutes** in a **${sprint.duration} minute** sprint!\n`;
  leaderboard += `\nThanks for joining us. You can use the \`/sprint\` command to start another sprint!\n\n-# If your minutes total is not correct on the leaderboard, please tag the Keepers of the Realm role to have it adjusted!\n\n`;

  const leaderboardMessage = await channel.send(leaderboard);

  clearTimeout(sprint.timer);
  clearTimeout(sprint.finalTimer);
  clearTimeout(sprint.reminderTimer);
  const writeSuccess = await writeSprintToSheets(sprint.finalTimes, guild, sprint.type, sprint.sprintNumber);

  if (sprint.type === 'Tall Tomes Sprint' || sprint.type === 'Short Stacks Sprint' || sprint.type === 'Readathon Sprint') {
    for (const [userId, minutes] of Object.entries(sprint.finalTimes)) {
      try {
        await saveSprintResult(userId, guild.id, sprint.type, minutes);
      } catch (error) {
        console.error('Error saving sprint result to database:', error);
      }
    }
  }

  if (writeSuccess) {
  try {
    await leaderboardMessage.react('🤖');
    const sprintLabel = sprint.sprintNumber ? `Readathon Sprint #${sprint.sprintNumber}` : sprint.type;
    const endedAt = `<t:${Math.floor(Date.now() / 1000)}:t>`;
    const messageLink = `https://discord.com/channels/${process.env.GUILD_ID}/${channelId}/${leaderboardMessage.id}`;
    const threadId = sprintSpamThreads[sprint.type];
    if (threadId) {
      const thread = await client.channels.fetch(threadId);
      const isReadingSprint = ['Tall Tomes Sprint', 'Short Stacks Sprint', 'Readathon Sprint'].includes(sprint.type);
      const spamMessage = isReadingSprint
        ? `Updated leaderboard for **${sprintLabel}** ended at ${endedAt} — [View Leaderboard](${messageLink})`
        : `Updated points for **${sprintLabel}** ended at ${endedAt} — [View Leaderboard](${messageLink})`;
      await thread.send(spamMessage);
    }
  } catch (error) {
    console.error('Error posting to spam thread:', error);
  }
}

  await deleteActiveSprint(channelId);
  delete activeSprints[channelId];
}

// ---- SPRINT SHEETS FUNCTIONS ----
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

    const houseTotals = { Asphodel: 0, Dreanni: 0, Laiidon: 0, Zeldarian: 0 };

    for (const [userId, minutes] of Object.entries(sprintResults)) {
      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch (e) {
        console.log(`Could not fetch member ${userId} for ${sprintType}`);
        continue;
      }

      let house = null;
      for (const [roleId, houseName] of Object.entries(houseRoles)) {
        if (member.roles.cache.has(roleId)) {
          house = houseName;
          break;
        }
      }

      if (!house) {
        console.log(`No house found for ${userId} in ${sprintType}`);
        continue;
      }
      houseTotals[house] += minutes;
    }

    const now = new Date();
    const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const tabName = `${monthNames[easternTime.getMonth()]} ${easternTime.getFullYear()}`;

    for (const [house, minutes] of Object.entries(houseTotals)) {
      if (minutes === 0) continue;
      const cell = sprintPointsCells[sprintType][house];
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.POINTS_SPREADSHEET_ID,
        range: `${tabName}!${cell}`,
        valueRenderOption: 'UNFORMATTED_VALUE'
      });
      const current = parseFloat(response.data.values?.[0]?.[0]) || 0;
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.POINTS_SPREADSHEET_ID,
        range: `${tabName}!${cell}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[current + minutes]] }
      });
      console.log(`Updated ${house} in ${tabName} for ${sprintType} (+${minutes} minutes)`);
    }

    console.log(`${sprintType} results fully written to Points spreadsheet!`);
    return true;
  } catch (error) {
    console.error(`Error writing ${sprintType} to Points spreadsheet:`, error);
    return false;
  }
}

async function writeReadathonToSheets(sprintResults, guild, sprintNumber) {
  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const now = new Date();
    const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const tabName = `${monthNames[easternTime.getMonth()]} ${easternTime.getFullYear()}`;
    const sprintCol = String.fromCharCode(65 + 3 + (sprintNumber - 1));

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.READATHON_LEADERBOARD_ID,
      range: `${tabName}!A:C`,
    });

    const rows = response.data.values || [];

    const houseRoles = {
      [process.env.ASPHODEL_ROLE_ID]: 'Asphodel',
      [process.env.DREANNI_ROLE_ID]: 'Dreanni',
      [process.env.LAIIDON_ROLE_ID]: 'Laiidon',
      [process.env.ZELDARIAN_ROLE_ID]: 'Zeldarian'
    };

    for (const [userId, minutes] of Object.entries(sprintResults)) {
      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch (e) {
        console.log(`Could not fetch member ${userId} for Readathon Sprint #${sprintNumber}`);
        continue;
      }

      let house = null;
      for (const [roleId, houseName] of Object.entries(houseRoles)) {
        if (member.roles.cache.has(roleId)) {
          house = houseName;
          break;
        }
      }

      if (!house) {
        console.log(`No house found for ${userId} in Readathon Sprint #${sprintNumber}`);
        continue;
      }

      const displayName = member.displayName;
      const existingRowIndex = rows.findIndex(row => row[0] === userId);

      if (existingRowIndex !== -1) {
        const rowNumber = existingRowIndex + 1;
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.READATHON_LEADERBOARD_ID,
          range: `${tabName}!${sprintCol}${rowNumber}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[minutes]] }
        });
        console.log(`Updated ${displayName} (${userId}) in Readathon Sprint #${sprintNumber} — ${minutes} minutes`);
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.READATHON_LEADERBOARD_ID,
          range: `${tabName}!A:C`,
          valueInputOption: 'RAW',
          requestBody: { values: [[userId, house, displayName]] }
        });

        const newResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.READATHON_LEADERBOARD_ID,
          range: `${tabName}!A:C`,
        });
        const newRows = newResponse.data.values || [];
        const newRowIndex = newRows.findIndex(row => row[0] === userId);
        if (newRowIndex !== -1) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.READATHON_LEADERBOARD_ID,
            range: `${tabName}!${sprintCol}${newRowIndex + 1}`,
            valueInputOption: 'RAW',
            requestBody: { values: [[minutes]] }
          });
        }
        console.log(`Added ${displayName} (${userId}) to Readathon Sprint #${sprintNumber} — ${minutes} minutes`);
      }
    }
    console.log(`Readathon Sprint #${sprintNumber} results fully written to Readathon Leaderboard!`);
    return true;
  } catch (error) {
    console.error('Error writing to Readathon Leaderboard:', error);
    return false;
  }
}

async function writeSprintToSheets(sprintResults, guild, sprintType, sprintNumber = null) {
  try {
    if (sprintType === 'Writing Sprint' || sprintType === 'Art Sprint' || sprintType === 'Study Sprint') {
      return await writeCreativeSprints(sprintResults, guild, sprintType);
    }

    let readathonSuccess = true;
    if (sprintType === 'Readathon Sprint') {
      readathonSuccess = await writeReadathonToSheets(sprintResults, guild, sprintNumber);
    }

    if (sprintType !== 'Tall Tomes Sprint' && sprintType !== 'Short Stacks Sprint' && sprintType !== 'Readathon Sprint') {
      return false;
    }

    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const now = new Date();
    const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const tabName = `${monthNames[easternTime.getMonth()]} ${easternTime.getFullYear()}`;

    for (const targetTab of [tabName, '2026 Overall']) {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPRINT_LEADERBOARD_ID,
        range: `${targetTab}!A:E`,
      });

      const rows = response.data.values || [];

      for (const [userId, minutes] of Object.entries(sprintResults)) {
        let member;
        try {
          member = await guild.members.fetch(userId);
        } catch (e) {
          console.log(`Could not fetch member ${userId} for ${sprintType} in ${targetTab}`);
          continue;
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

        if (!house) {
          console.log(`No house found for ${userId} in ${sprintType} — ${targetTab}`);
          continue;
        }

        const displayName = member.displayName;
        const existingRowIndex = rows.findIndex(row => row[0] === userId);

        if (existingRowIndex !== -1) {
          const currentMinutes = parseFloat(rows[existingRowIndex][3]) || 0;
          const currentSprints = parseInt(rows[existingRowIndex][4]) || 0;
          const rowNumber = existingRowIndex + 1;

          await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.SPRINT_LEADERBOARD_ID,
            range: `${targetTab}!D${rowNumber}:E${rowNumber}`,
            valueInputOption: 'RAW',
            requestBody: { values: [[currentMinutes + minutes, currentSprints + 1]] }
          });
          console.log(`Updated ${displayName} (${userId}) in ${targetTab} — +${minutes} minutes`);
        } else {
          await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.SPRINT_LEADERBOARD_ID,
            range: `${targetTab}!A:E`,
            valueInputOption: 'RAW',
            requestBody: { values: [[userId, house, displayName, minutes, 1]] }
          });
          console.log(`Added ${displayName} (${userId}) to ${targetTab} — ${minutes} minutes`);
        }
      }
    }

    console.log(`Sprint results written to ${tabName} and 2026 Overall!`);
    return readathonSuccess;
  } catch (error) {
    console.error('Error writing to Google Sheets:', error);
    return false;
  }
}

// ---- RESTORE SPRINT STATE ----
async function restoreSprintState() {
  try {
    const guild = client.guilds.cache.first();

    // Restore pending sprints FIRST so the check in scheduled sprints works
    const pendingResult = await pool.query('SELECT * FROM pending_sprints');
    for (const row of pendingResult.rows) {
      const msUntilStart = row.starts_at - Date.now();

      if (msUntilStart <= 0) {
        const missedBy = Math.abs(msUntilStart);
        const sprintDurationMs = row.duration * 60 * 1000;
        if (missedBy < sprintDurationMs) {
          console.log(`Pending sprint missed start by ${Math.floor(missedBy / 1000)}s, starting immediately`);
          const carriedParticipants = row.participants || [];
          await deletePendingSprint(row.channel_id);
          await startSprint(row.channel_id, row.type, row.duration, row.sprint_number, carriedParticipants, guild);
          await postSprintStart(row.channel_id);
        } else {
          await deletePendingSprint(row.channel_id);
        }
        continue;
      }

      pendingSprints[row.channel_id] = {
        type: row.type,
        duration: row.duration,
        startsAt: row.starts_at,
        guildId: row.guild_id,
        participants: row.participants || [],
        sprintNumber: row.sprint_number,
        pendingTimer: setTimeout(async () => {
          const pending = pendingSprints[row.channel_id];
          const carriedParticipants = pending ? [...pending.participants] : [];
          delete pendingSprints[row.channel_id];
          await deletePendingSprint(row.channel_id);
          await startSprint(row.channel_id, row.type, row.duration, row.sprint_number, carriedParticipants, guild);
          await postSprintStart(row.channel_id);
        }, msUntilStart)
      };

      console.log(`Restored pending ${row.type} in channel ${row.channel_id}`);
    }

    // Restore scheduled sprints SECOND
    const scheduledResult = await pool.query('SELECT * FROM scheduled_sprints');
    for (const row of scheduledResult.rows) {
      const msUntilStart = row.start_time - Date.now();
      const msUntilWarning = msUntilStart - 15 * 60 * 1000;

      if (msUntilStart <= 0) {
        await deleteScheduledSprint(row.channel_id, row.sprint_number);
        continue;
      }

      if (!scheduledSprints[row.channel_id]) scheduledSprints[row.channel_id] = [];

      const warningTimer = msUntilWarning > 0 ? setTimeout(async () => {
        const channel = await client.channels.fetch(row.channel_id);
        const warningTimestamp = Math.floor(row.start_time / 1000);
        await channel.send(`<@&${process.env.READATHON_ROLE_ID}> Readathon Sprint #${row.sprint_number} is starting <t:${warningTimestamp}:R>! Use \`/join\` to read with us!`);

        const scheduled = scheduledSprints[row.channel_id]?.find(s => s.number === row.sprint_number);
        const carriedParticipants = scheduled?.participants || [];
        pendingSprints[row.channel_id] = {
          type: 'Readathon Sprint',
          duration: row.duration,
          startsAt: row.start_time,
          guildId: row.guild_id,
          participants: [...carriedParticipants],
          sprintNumber: row.sprint_number,
          pendingTimer: setTimeout(async () => {
            const pending = pendingSprints[row.channel_id];
            const carried = pending ? [...pending.participants] : [];
            delete pendingSprints[row.channel_id];
            if (scheduledSprints[row.channel_id]) {
              scheduledSprints[row.channel_id] = scheduledSprints[row.channel_id].filter(s => s.number !== row.sprint_number);
            }
            await deleteScheduledSprint(row.channel_id, row.sprint_number);
            await startSprint(row.channel_id, 'Readathon Sprint', row.duration, row.sprint_number, carried, guild);
            await postSprintStart(row.channel_id);
          }, 15 * 60 * 1000)
        };
        await savePendingSprint(row.channel_id, pendingSprints[row.channel_id]);
      }, msUntilWarning) : null;

      const pendingTimer = (msUntilWarning <= 0 && !pendingSprints[row.channel_id]) ? setTimeout(async () => {
        const pending = pendingSprints[row.channel_id];
        const carried = pending ? [...pending.participants] : [];
        delete pendingSprints[row.channel_id];
        if (scheduledSprints[row.channel_id]) {
          scheduledSprints[row.channel_id] = scheduledSprints[row.channel_id].filter(s => s.number !== row.sprint_number);
        }
        await deleteScheduledSprint(row.channel_id, row.sprint_number);
        await startSprint(row.channel_id, 'Readathon Sprint', row.duration, row.sprint_number, carried, guild);
        await postSprintStart(row.channel_id);
      }, msUntilStart) : null;

      scheduledSprints[row.channel_id].push({
        number: row.sprint_number,
        minutes: row.duration,
        startTime: row.start_time,
        guildId: row.guild_id,
        participants: row.participants || [],
        warningTimer,
        pendingTimer
      });

      console.log(`Restored Readathon Sprint #${row.sprint_number} in channel ${row.channel_id}`);
    }

    // Restore active sprints LAST
    const activeResult = await pool.query('SELECT * FROM active_sprints');
    for (const row of activeResult.rows) {
      const msRemaining = row.end_time - Date.now();

      if (msRemaining <= 0) {
        if (Object.keys(row.final_times).length > 0) {
          await postLeaderboard(row.channel_id, guild);
        } else {
          await deleteActiveSprint(row.channel_id);
        }
        continue;
      }

      activeSprints[row.channel_id] = {
        type: row.type,
        duration: row.duration,
        startTime: row.start_time,
        endTime: row.end_time,
        participants: row.participants || [],
        originalParticipants: new Set(row.original_participants || []),
        finalTimes: row.final_times || {},
        submittedUsers: new Set(row.submitted_users || []),
        sprintNumber: row.sprint_number,
        guildId: row.guild_id,
        endMessageSent: false,

        timer: setTimeout(async () => {
          const sprint = activeSprints[row.channel_id];
          if (!sprint || sprint.endMessageSent) return;
          sprint.endMessageSent = true;
          const channel = await client.channels.fetch(row.channel_id);
          const verb = sprintVerbs[sprint.type];
          const submitWindow = sprint.duration <= 30 ? 5 : 7;
          const finalDeadline = Math.floor((Date.now() + submitWindow * 60 * 1000) / 1000);
          const mentions = sprint.originalParticipants.size > 0
            ? [...sprint.originalParticipants].map(id => `<@${id}>`).join(', ')
            : null;
          const endEmoji = randomEmoji(sprint.type);
          const sprintLabel = sprint.sprintNumber ? `Readathon Sprint #${sprint.sprintNumber}` : sprint.type;
          const participantText = mentions ? `\n\n✨ **Participants:**\n${mentions}` : '\n\n✨ **Participants:**';
          await channel.send(`${endEmoji} **THE SPRINT IS OVER** ${endEmoji}\n\nThis **${sprintLabel}** is over, please put in the amount of time you ${verb}. The leaderboard will post <t:${finalDeadline}:R>, you have until then to put in your final count!${participantText}`);

          sprint.reminderTimer = setTimeout(async () => {
            const unsubmitted = [...sprint.originalParticipants].filter(id => !sprint.submittedUsers.has(id));
            if (unsubmitted.length > 0) {
              const reminderMentions = unsubmitted.map(id => `<@${id}>`).join(', ');
              await channel.send(`‼️ **Reminder:**\n${reminderMentions}\nYou have 2 minutes left to submit your final time with \`/final\`!`);
            }
          }, (submitWindow - 2) * 60 * 1000);

          const allAlreadySubmitted = [...sprint.originalParticipants].every(id => sprint.submittedUsers.has(id));
          if (allAlreadySubmitted && Object.keys(sprint.finalTimes).length > 0) {
            await postLeaderboard(row.channel_id, guild);
          } else {
            sprint.finalTimer = setTimeout(() => postLeaderboard(row.channel_id, guild), submitWindow * 60 * 1000);
          }
        }, msRemaining)
      };

      console.log(`Restored active ${row.type} in channel ${row.channel_id} with ${msRemaining}ms remaining`);
    }

    console.log('Sprint state restored!');
  } catch (error) {
    console.error('Error restoring sprint state:', error);
  }
}

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
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
  console.log('All commands registered!');
}

// ---- BOT READY ----
client.once('clientReady', async () => {
  console.log(`Bot is online as ${client.user.tag}!`);
  await initializeDatabase();
  await initializeLastProcessedRow();
  await registerCommands();
  await restoreSprintState();

  cron.schedule('*/30 * * * *', () => {
    postHouseLeaderboard();
  });

  cron.schedule('* * * * *', () => {
    checkForNewQuizSubmissions();
  });

  // 8AM EST = 13:00 UTC
cron.schedule('0 13 * * *', async () => {
  console.log('Posting common room messages...');
  for (const house of COMMON_ROOM_HOUSES) {
    try {
      const channel = await client.channels.fetch(house.channelId);
      const message = await channel.send(
        `<@&${house.roleId}> Hello, House ${house.name}! Have you done these?\n**Please react to this message in order of the emojis shown!**\n*-# (If you haven't done them yet, but you know you will, you can still react)*\n\n__**Morning Tasks**__\n🪥 | Brushed your teeth?\n🛏️ | Made your bed?\n👑 | Styled your hair?\n💊 | Took medication?\n👕 | Got dressed?\n\n__**Evening Tasks**__\n🦷 | Brushed your teeth?\n⚕️ | Took additional medication?\n🚿 | Had a wash today? - includes washing hands, face etc.\n🥛 | Had a drink today?\n🍕 | Had a meal today?\n📖 | Read your book?\n\n**Also make sure to Check In!**\n${CHECKIN_EMOJI} | Check in\n\nRemember, we love you all and hope you have a wonderful day!\n♥️`
      );
      commonRoomMessageIds[house.channelId] = message.id;

      for (const emoji of COMMON_ROOM_EMOJIS) {
        await message.react(emoji);
        await new Promise(res => setTimeout(res, 300));
      }
    } catch (err) {
      console.error(`Failed to post common room message for ${house.name}:`, err);
    }
  }
});

// 5PM EST = 22:00 UTC
cron.schedule('0 22 * * *', async () => {
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
          await new Promise(res => setTimeout(res, 300));
        }
      }
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
      await deleteActiveSprint(channelId);
      await deletePendingSprint(channelId);
      delete activeSprints[channelId];
      delete pendingSprints[channelId];
      await interaction.update({ content: `The **${sprint.type}** has been cancelled. <@&${roleId}>`, components: [] });
    }

    if (interaction.customId === 'deny_cancel') {
      const sprint = activeSprints[channelId] || pendingSprints[channelId];
      const happyVerb = sprint ? sprintHappyVerbs[sprint.type] : 'Happy reading!';
      await interaction.update({ content: `The sprint remains! ${happyVerb}`, components: [] });
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
      await saveActiveSprint(channelId, { ...sprint, guildId: interaction.guild.id });

      await interaction.update({ content: `Got it! Your **${minutes} minutes** have been logged.`, components: [] });
      const sprintVerb = activeSprints[channelId] ? sprintVerbs[activeSprints[channelId].type] : 'read';
      await interaction.channel.send(`<@${userId}> has ${sprintVerb} for **${minutes} minutes**!`);

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
      if (activeSprints[channelId]) {
        await saveActiveSprint(channelId, { ...activeSprints[channelId], guildId: interaction.guild.id });
      } else if (pendingSprints[channelId]) {
        await deletePendingSprint(channelId);
      }
      await interaction.update({ content: `You've been removed from the sprint. See you next time!`, components: [] });
      await interaction.channel.send(`<@${userId}> has left the **${sprint.type}**.`);
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
      const housePoints = await getSheetData();
      const embed = buildLeaderboardEmbed(housePoints);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error handling leaderboard command:', error);
    }
  }

// ---- /mystats ----
if (interaction.commandName === 'mystats') {
  try {
    await interaction.deferReply();
    
    // Grab what the user chose for period and date
    const period = interaction.options.getString('period');
    const date = interaction.options.getString('date');

    // Get current month and year as defaults
    const now = new Date();
    const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const currentMonth = monthNames[easternTime.getMonth()];
    const currentYear = easternTime.getFullYear();

    // If they provided a date, parse it, otherwise use current month/year
    let month;
    if (date) {
      month = date.split(' ')[0];
    } else {
      month = currentMonth;
    }

    let year;
if (date) {
  const parts = date.split(' ');
  year = parseInt(parts.length === 1 ? parts[0] : parts[1]);
} else {
  year = currentYear;
}

    // Query the database based on the chosen period
    let result;
    if (period === 'monthly') {
      result = await pool.query(
        'SELECT * FROM sprint_results WHERE user_id = $1 AND EXTRACT(MONTH FROM sprint_date) = $2 AND EXTRACT(YEAR FROM sprint_date) = $3',
        [interaction.user.id, monthNames.indexOf(month) + 1, year]
      );
    } else if (period === 'yearly') {
      result = await pool.query(
        'SELECT * FROM sprint_results WHERE user_id = $1 AND EXTRACT(YEAR FROM sprint_date) = $2',
        [interaction.user.id, year]
      );
    } else {
      // Lifetime - no date filter
      result = await pool.query(
        'SELECT * FROM sprint_results WHERE user_id = $1',
        [interaction.user.id]
      );
    }

    // Calculate totals from the results
    const sprintCount = result.rows.length;
    const totalMinutes = result.rows.reduce((sum, row) => sum + row.minutes, 0);

    // If no results, send ephemeral message
    if (sprintCount === 0) {
      await interaction.editReply({ content: `You haven't participated in any sprints this period! Join us in <#${process.env.TALL_TOMES_CHANNEL_ID}> or <#${process.env.SHORT_STACKS_CHANNEL_ID}> to add to your stats!`, flags: 64 });
      return;
    }

    // Build the period label for the message
    let chosenPeriod;
    if (period === 'monthly') {
      chosenPeriod = `${month} ${year}`;
    } else if (period === 'yearly') {
      chosenPeriod = year;
    } else {
      chosenPeriod = null;
    }

    // Build and send the response
    const title = period === 'lifetime'
      ? `<a:book_pages:838547896361811979> **${interaction.user.username}'s Lifetime Stats**`
      : `<a:book_pages:838547896361811979> **${interaction.user.username}'s ${period.charAt(0).toUpperCase() + period.slice(1)} Stats for ${chosenPeriod}**`;

    await interaction.editReply({ content: `${title}\n\nYou've read **${totalMinutes.toLocaleString()} minutes** across **${sprintCount} sprints**!` });

  } catch (error) {
    console.error('Error handling mystats command:', error);
  }
}

// ---- /export ----
if (interaction.commandName === 'export') {
  try {
    await interaction.deferReply({ flags: 64 });

    // Check if the user has the mod role
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

    let month;
    if (date) {
      month = date.split(' ')[0];
    } else {
      month = currentMonth;
    }

    let year;
    if (date) {
      const parts = date.split(' ');
      year = parseInt(parts.length === 1 ? parts[0] : parts[1]);
    } else {
      year = currentYear;
    }

    // Query grouped by user, with totals
    let result;
    if (period === 'monthly') {
      result = await pool.query(
        'SELECT user_id, COUNT(*) as sprints_joined, SUM(minutes) as total_minutes FROM sprint_results WHERE EXTRACT(MONTH FROM sprint_date) = $1 AND EXTRACT(YEAR FROM sprint_date) = $2 GROUP BY user_id',
        [monthNames.indexOf(month) + 1, year]
      );
    } else if (period === 'yearly') {
      result = await pool.query(
        'SELECT user_id, COUNT(*) as sprints_joined, SUM(minutes) as total_minutes FROM sprint_results WHERE EXTRACT(YEAR FROM sprint_date) = $1 GROUP BY user_id',
        [year]
      );
    } else {
      result = await pool.query(
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

    // Build CSV rows
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
      } catch {
        // Member may have left the server — keep user_id as username and Unknown as house
      }

      csvRows.push(`${row.user_id},${username},${house},${row.sprints_joined},${row.total_minutes}`);
    }

    const csvContent = csvRows.join('\n');

    // Build period label for filename
    let periodLabel;
    if (period === 'monthly') {
      periodLabel = `${month}_${year}`;
    } else if (period === 'yearly') {
      periodLabel = `${year}`;
    } else {
      periodLabel = 'lifetime';
    }

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

    const allScheduled = [];
    for (const [channelId, sprints] of Object.entries(scheduledSprints)) {
      for (const sprint of sprints) {
        allScheduled.push({ ...sprint, channelId });
      }
    }

    allScheduled.sort((a, b) => a.startTime - b.startTime);

    if (allScheduled.length === 0) {
      await interaction.reply({ content: 'There are no sprints currently scheduled.' });
      return;
    }

    const lines = allScheduled.map(s => {
      const timestamp = Math.floor(s.startTime / 1000);
      return `**Readathon Sprint #${s.number}** — <#${s.channelId}> — starts <t:${timestamp}:R> at <t:${timestamp}:t> — ${s.minutes} minutes long`;
    });

    await interaction.reply({ content: `📅 **Upcoming Scheduled Sprints:**\n\n${lines.join('\n')}` });
  } catch (error) {
    console.error('Error handling scheduled command:', error);
  }
}

  // ---- /stick ----
  if (interaction.commandName === 'stick') {
    try {
      await interaction.deferReply({ flags: 64 });
      const message = interaction.options.getString('message');
      const channel = interaction.channel;
      const existing = await getStickyByChannel(channel.id);
      if (existing && existing.message_id) {
        try {
          const oldMessage = await channel.messages.fetch(existing.message_id);
          await oldMessage.delete();
        } catch (e) {}
      }
      const sent = await channel.send(`${message}`);
      await saveStickyMessage(channel.name, channel.id, message, sent.id);
      await interaction.editReply({ content: 'Sticky message set!' });
    } catch (error) {
      console.error('Error setting sticky message:', error);
    }
  }

  // ---- /editstick ----
  if (interaction.commandName === 'editstick') {
    try {
      await interaction.deferReply({ flags: 64 });
      const message = interaction.options.getString('message');
      const channel = interaction.channel;
      const existing = await getStickyByChannel(channel.id);
      if (!existing) {
        await interaction.editReply({ content: 'No sticky message found in this channel!' });
        return;
      }
      if (existing.message_id) {
        try {
          const oldMessage = await channel.messages.fetch(existing.message_id);
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

  // ---- /unstick ----
  if (interaction.commandName === 'unstick') {
    try {
      await interaction.deferReply({ flags: 64 });
      const channel = interaction.channel;
      const existing = await getStickyByChannel(channel.id);
      if (!existing) {
        await interaction.editReply({ content: 'No sticky message found in this channel!' });
        return;
      }
      if (existing.message_id) {
        try {
          const oldMessage = await channel.messages.fetch(existing.message_id);
          await oldMessage.delete();
        } catch (e) {}
      }
      await deleteStickyMessage(channel.id);
      await interaction.editReply({ content: 'Sticky message removed!' });
    } catch (error) {
      console.error('Error removing sticky message:', error);
    }
  }

  // ---- /sprint ----
  if (interaction.commandName === 'sprint') {
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
        const carriedParticipants = pending ? [...pending.participants] : [];
        delete pendingSprints[channelId];
        const guild = client.guilds.cache.get(pending.guildId);
        await startSprint(channelId, type, minutes, null, carriedParticipants, guild);
        await postSprintStart(channelId);
      }, startsIn * 60 * 1000)
    };
    await savePendingSprint(channelId, pendingSprints[channelId]);
  }

  // ---- /schedule ----
  if (interaction.commandName === 'schedule') {
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

    await saveScheduledSprint(channelId, scheduledSprints[channelId].find(s => s.number === number));

    await interaction.reply(`✅ Readathon Sprint #${number} scheduled for <t:${startTimestamp}:t>! It will post 15 minutes before its start time.`);
  }

  // ---- /cancel ----
  if (interaction.commandName === 'cancel') {
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

      await deleteScheduledSprint(channelId, sprintNumber);
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
        content: `Are you sure you want to cancel? **${sprint.participants.length}** ${sprint.participants.length === 1 ? 'person has' : 'people have'} joined this sprint.`,
        components: [row]
      });
    } else {
      clearTimeout(sprint.timer);
      clearTimeout(sprint.pendingTimer);
      clearTimeout(sprint.warningTimer);
      clearTimeout(sprint.finalTimer);
      clearTimeout(sprint.reminderTimer);
      await deleteActiveSprint(channelId);
      await deletePendingSprint(channelId);
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

    sprint.participants.push(interaction.user.id);
    if (activeSprints[channelId]) {
      sprint.originalParticipants.add(interaction.user.id);
      await saveActiveSprint(channelId, { ...activeSprints[channelId], guildId: interaction.guild.id });
    } else if (pendingSprints[channelId]) {
      await savePendingSprint(channelId, pendingSprints[channelId]);
    }
    await interaction.reply(`<@${interaction.user.id}> has joined the **${sprint.type}**!`);
  }

  // ---- /time ----
  if (interaction.commandName === 'time') {
    if (activeSprints[channelId]) {
      const sprint = activeSprints[channelId];
      const endTime = Math.floor(sprint.endTime / 1000);
      await interaction.reply(`The sprint will end <t:${endTime}:R>, at <t:${endTime}:t>.`);
      return;
    }

    if (pendingSprints[channelId]) {
      const sprint = pendingSprints[channelId];
      const startsAt = Math.floor(sprint.startsAt / 1000);
      await interaction.reply({ content: `Readathon Sprint #${sprint.sprintNumber} is starting <t:${startsAt}:R>! Use \`/join\` to join!`, flags: 64 });
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

    sprint.finalTimes[interaction.user.id] = minutes;
    sprint.submittedUsers.add(interaction.user.id);
    sprint.originalParticipants.add(interaction.user.id);
    sprint.participants = sprint.participants.filter(id => id !== interaction.user.id);
    await saveActiveSprint(channelId, { ...sprint, guildId: interaction.guild.id });

    await interaction.reply(`<@${interaction.user.id}> has ${verb} for **${minutes} minutes**!`);

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
      await interaction.reply({ content: `There isn't a sprint running in this channel right now.`, flags: 64 });
      return;
    }

    if (!sprint.participants.includes(interaction.user.id)) {
      await interaction.reply({ content: `You haven't joined this sprint!`, flags: 64 });
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

// ---- MESSAGE CREATE ----
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // @mention sprint commands
  if (message.mentions.has(client.user)) {
    const channelId = message.channelId;
    const type = channelSprintTypes[channelId];
    if (type) {
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
          sprint.originalParticipants.add(message.author.id);
        }
        await message.reply(`<@${message.author.id}> has joined the **${sprint.type}**!`);
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

  // Sticky message handler
  if (message.author.id === client.user.id) return;
  try {
    const existing = await getStickyByChannel(message.channelId);
    if (!existing || !existing.message) return;
    if (existing.message_id) {
      try {
        const oldMessage = await message.channel.messages.fetch(existing.message_id);
        await oldMessage.delete();
      } catch (e) {}
    }
    const sent = await message.channel.send(`${existing.message}`);
    await saveStickyMessage(existing.channel_name, existing.channel_id, existing.message, sent.id);
  } catch (error) {
    console.error('Error reposting sticky message:', error);
  }
});

// ---- GUILD MEMBER ADD ----
client.on('guildMemberAdd', async member => {
  try {
    const { createCanvas, loadImage, registerFont } = require('canvas');
    registerFont('./Roboto-Bold.ttf', { family: 'Roboto', weight: 'bold' });
    registerFont('./Roboto-Regular.ttf', { family: 'Roboto' });
    const canvas = createCanvas(800, 300);
    const ctx = canvas.getContext('2d');

    const background = await loadImage('./welcome-background.png');
    ctx.drawImage(background, 0, 0, 800, 300);

    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
    const avatar = await loadImage(avatarURL);
    ctx.save();
    ctx.beginPath();
    ctx.arc(150, 150, 90, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 60, 60, 180, 180);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(150, 150, 91, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#b16caf';
    ctx.font = 'bold 34px Roboto';
    ctx.fillText('Welcome to The Book Realm!', 280, 120);

    ctx.fillStyle = '#555555';
    let usernameFontSize = 28;
    ctx.font = `${usernameFontSize}px Roboto`;
    while (ctx.measureText(`${member.user.username} just joined the server`).width > 480 && usernameFontSize > 14) {
      usernameFontSize--;
      ctx.font = `${usernameFontSize}px Roboto`;
    }
    ctx.fillText(`${member.user.username} just joined the server`, 280, 170);

    const memberCount = member.guild.memberCount;
    ctx.font = '22px Roboto';
    ctx.fillStyle = '#888888';
    ctx.fillText(`Member #${memberCount}`, 280, 215);

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

// ---- GUILD MEMBER REMOVE ----
client.on('guildMemberRemove', async member => {
  try {
    if (member.partial) await member.fetch();
    const channel = await client.channels.fetch(process.env.JOINS_LEAVES_CHANNEL_ID);
    await channel.send(`**${member.user.username}** just left the realm <a:book_pages:838547896361811979> We will miss you! :(`);
    const logChannel = await client.channels.fetch(process.env.KEEPERS_LOG_CHANNEL_ID);
    await logChannel.send(`**${member.user.username}** (ID: \`${member.user.id}\`) just left the server.`);
  } catch (error) {
    console.error('Error sending leave message:', error);
  }
});

// ---- LOGIN ----
client.login(process.env.DISCORD_TOKEN);