const { google } = require('googleapis');
const { monthNames, channelSprintTypes, sprintVerbs, sprintHappyVerbs, fixedDurations, sprintRoles, sprintSpamThreads, getSprintEmojis } = require('./constants');
const { pool, saveActiveSprint, savePendingSprint, saveScheduledSprint, deleteActiveSprint, deletePendingSprint, deleteScheduledSprint, saveEndingSprint, deleteEndingSprint, saveSprintResult } = require('./db');

let client;
let getAuth;

function init(discordClient, authFn) {
  client = discordClient;
  getAuth = authFn;
}

const activeSprints = {};
const pendingSprints = {};
const scheduledSprints = {};
const cooldowns = {};

// ---- DELAY HELPER ----
// Used to avoid hitting the 60 writes/minute quota
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---- SPRINT HELPERS ----
function randomEmoji(type) {
  const pool = getSprintEmojis(type);
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

// ---- SPRINT CLEANUP ----
// Centralized cleanup so all sprint teardown happens in one place.
// If you ever add new timers or new DB tables, update it here and everywhere is covered.
async function cleanupSprint(channelId) {
  const sprint = activeSprints[channelId];
  if (sprint) {
    if (sprint.timer) clearTimeout(sprint.timer);
    if (sprint.finalTimer) clearTimeout(sprint.finalTimer);
    if (sprint.reminderTimer) clearTimeout(sprint.reminderTimer);
  }
  await deleteActiveSprint(channelId);
  await deleteEndingSprint(channelId);
  delete activeSprints[channelId];
}

// ---- SPRINT FUNCTIONS ----
async function startSprint(channelId, type, minutes, sprintNumber = null, carriedParticipants = [], guild = null) {
  if (!guild?.id) {
    console.error(`[startSprint] Missing guild for ${channelId}`);
    return;
  }
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
  if (!sprint || sprint.ending || sprint.endMessageSent) return;
  sprint.ending = true;

  try {
    console.log(`[Sprint ${channelId}] Ending sequence started (${sprint.type})`);
    const verb = sprintVerbs[sprint.type];
    const submitWindow = minutes <= 30 ? 5 : 7;
    const finalDeadline = Math.floor((Date.now() + submitWindow * 60 * 1000) / 1000);
    const mentions = sprint.originalParticipants.size > 0
      ? [...sprint.originalParticipants].filter(id => !sprint.submittedUsers.has(id)).map(id => `<@${id}>`).join(', ')
      : null;
    const endEmoji = randomEmoji(type);

    const mainMessage = `${endEmoji} **THE SPRINT IS OVER** ${endEmoji}\n\nThis **${sprintLabel}** is over, please put in the amount of time you ${verb}. The leaderboard will post <t:${finalDeadline}:R>, you have until then to put in your final count!`;
    const participantText = mentions ? `\n\n✨ **Participants:**\n${mentions}` : '\n\n✨ **Participants:**';
    const fullMessage = mainMessage + participantText;

    if (fullMessage.length > 1900) {
      await channel.send(mainMessage + '\n\n✨ **Participants:**');
      await channel.send(mentions);
    } else {
      await channel.send(fullMessage);
}

    await saveEndingSprint(channelId, {
      guildId: guild.id,
      type: sprint.type,
      duration: sprint.duration,
      sprintNumber: sprint.sprintNumber,
      originalParticipants: sprint.originalParticipants,
      finalTimes: sprint.finalTimes,
      submittedUsers: sprint.submittedUsers,
      leaderboardAt: Date.now() + submitWindow * 60 * 1000
    });

    sprint.endMessageSent = true;
    console.log(`[Sprint ${channelId}] End message sent and ending sprint saved to DB`);

    sprint.reminderTimer = setTimeout(async () => {
      const unsubmitted = [...sprint.originalParticipants].filter(id => !sprint.submittedUsers.has(id));
      if (unsubmitted.length > 0) {
        const reminderMentions = unsubmitted.map(id => `<@${id}>`).join(', ');
        const reminderDeadline = Math.floor((Date.now() + 2 * 60 * 1000) / 1000);
        const reminderMessage = `‼️ **Reminder:**\nYou have until <t:${reminderDeadline}:t> to submit your final time with \`/final\`!\n${reminderMentions}`;
      if (reminderMessage.length > 1900) {
        await channel.send(`‼️ **Reminder:** You have until <t:${reminderDeadline}:t> to submit your final time with \`/final\`!`);
        await channel.send(reminderMentions);
      } else {
        await channel.send(reminderMessage);
      }
      }
    }, (submitWindow - 2) * 60 * 1000);

    const allAlreadySubmitted = [...sprint.originalParticipants].every(id => sprint.submittedUsers.has(id));
    if (allAlreadySubmitted && Object.keys(sprint.finalTimes).length > 0) {
      await postLeaderboard(channelId, guild);
    } else {
      sprint.leaderboardAt = Date.now() + submitWindow * 60 * 1000;
      sprint.finalTimer = setTimeout(() => postLeaderboard(channelId, guild), submitWindow * 60 * 1000);
    }

  } catch (err) {
    console.error(`[Sprint ${channelId}] Error in sprint end sequence (startSprint):`, err);
  } finally {
    if (activeSprints[channelId]) {
      activeSprints[channelId].ending = false;
    }
    console.log(`[Sprint ${channelId}] Ending lock released`);
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
  if (sprint.postingLeaderboard) return;
  sprint.postingLeaderboard = true;

  try {
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
    leaderboard += `\nThanks for joining us. You can use the \`/sprint\` command to start another sprint!\n\n-# If your minutes total is not correct on the leaderboard or if the bot has **not** reacted to this post (please give it 2 minutes to process the data), please tag the Keepers of the Realm role to have it adjusted!\n\n`;

// 1. Save to DB FIRST — canonical records persisted before anything else
if (sprint.type === 'Tall Tomes Sprint' || sprint.type === 'Short Stacks Sprint' || sprint.type === 'Readathon Sprint') {
  for (const [userId, minutes] of Object.entries(sprint.finalTimes)) {
    try {
      let displayName = userId;
      let house = null;
      try {
        const member = await guild.members.fetch(userId);
        displayName = member.displayName;
        const houseRoles = {
          [process.env.ASPHODEL_ROLE_ID]: 'Asphodel',
          [process.env.DREANNI_ROLE_ID]: 'Dreanni',
          [process.env.LAIIDON_ROLE_ID]: 'Laiidon',
          [process.env.ZELDARIAN_ROLE_ID]: 'Zeldarian'
        };
        for (const [roleId, houseName] of Object.entries(houseRoles)) {
          if (member.roles.cache.has(roleId)) {
            house = houseName;
            break;
          }
        }
      } catch {}
      await saveSprintResult(userId, guild.id, sprint.type, minutes, displayName, house);
      console.log(`[DB] Saved: ${displayName} (${userId}) — ${minutes} minutes — ${house}`);
    } catch (error) {
      console.error('Error saving sprint result to database:', error);
    }
  }
}
    // 2. Send leaderboard message
    const chunks = [];
    let current = '';
    for (const line of leaderboard.split('\n')) {
      if ((current + line + '\n').length > 1900) {
        chunks.push(current);
        current = '';
      }
      current += line + '\n';
    }
    if (current) chunks.push(current);

    const leaderboardMessage = await channel.send(chunks[0]);
    const allMessages = [leaderboardMessage];
    for (let i = 1; i < chunks.length; i++) {
      const followUp = await channel.send(chunks[i]);
      allMessages.push(followUp);
    }


    // 3. Clean up sprint state
    await cleanupSprint(channelId);

    // 4. Write to Sheets
    const writeSuccess = await writeSprintToSheets(sprint.finalTimes, guild, sprint.type, sprint.sprintNumber);

    if (writeSuccess) {
  try {
    for (const msg of allMessages) {
  await msg.react('<:i_got:1490375689118158848>');
}
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
} else {
  try {
    const sprintChannel = await client.channels.fetch(process.env.SPRINT_SHENANIGANS_CHANNEL_ID);
    const sprintLabel = sprint.sprintNumber ? `Readathon Sprint #${sprint.sprintNumber}` : sprint.type;
    const messageLink = `https://discord.com/channels/${process.env.GUILD_ID}/${channelId}/${leaderboardMessage.id}`;
    await sprintChannel.send(`⚠️ **Sheets Write Failed**\nSprint: ${sprintLabel}\nThe leaderboard posted but data was not written to Google Sheets. Please update manually — [View Leaderboard](${messageLink})`);
  } catch (alertError) {
    console.error('[postLeaderboard] Failed to send Sheets alert:', alertError);
  }
}

  } catch (err) {
    console.error(`[Sprint ${channelId}] Error in postLeaderboard:`, err);
  } finally {
    if (activeSprints[channelId]) {
      activeSprints[channelId].postingLeaderboard = false;
    }
  }
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

    // Throttle writes to avoid hitting Google Sheets quota
      await delay(500);
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
        await delay(1000);
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
        await delay(1000);
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

      // Throttle writes to avoid hitting Google Sheets quota (60 writes/minute)
      await delay(1000);
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
        valueRenderOption: 'UNFORMATTED_VALUE'
      });

      const rows = response.data.values || [];

      for (const [userId, minutes] of Object.entries(sprintResults)) {
        let member;
        try {
          member = await guild.members.fetch(userId);
        } catch (e) {
          console.log(`Could not fetch member ${userId} for ${sprintType} in ${targetTab}`);
          await delay(1000);
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
          await delay(1000);
          continue;
        }

        const displayName = member.displayName;
        const existingRowIndex = rows.findIndex(row => row[0] === userId);

        if (existingRowIndex !== -1) {
          const currentMinutes = parseInt(rows[existingRowIndex][3]) || 0;
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

        // Throttle writes to avoid hitting Google Sheets quota (60 writes/minute)
        await delay(1000);
      }
    }

    console.log(`[SHEETS WRITE COMPLETE] ${tabName} and 2026 Overall — ${Object.keys(sprintResults).length} users written`);
    return readathonSuccess;
  } catch (error) {
    console.error('Error writing to Google Sheets:', error);
    return false;
  }
}

// ---- RESTORE SPRINT STATE ----
async function restoreSprintState() {
  try {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
if (!guild) {
  console.error('Guild not found in cache during sprint restore');
  return;
}

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
          if (!sprint || sprint.ending || sprint.endMessageSent) return;
          sprint.ending = true;

          try {
            console.log(`[Sprint ${row.channel_id}] Ending sequence started (restored) (${sprint.type})`);
            const channel = await client.channels.fetch(row.channel_id);
            const verb = sprintVerbs[sprint.type];
            const submitWindow = sprint.duration <= 30 ? 5 : 7;
            const finalDeadline = Math.floor((Date.now() + submitWindow * 60 * 1000) / 1000);
            const mentions = sprint.originalParticipants.size > 0
              ? [...sprint.originalParticipants].filter(id => !sprint.submittedUsers.has(id)).map(id => `<@${id}>`).join(', ')
              : null;
            const endEmoji = randomEmoji(sprint.type);
            const sprintLabel = sprint.sprintNumber ? `Readathon Sprint #${sprint.sprintNumber}` : sprint.type;
            const mainMessage = `${endEmoji} **THE SPRINT IS OVER** ${endEmoji}\n\nThis **${sprintLabel}** is over, please put in the amount of time you ${verb}. The leaderboard will post <t:${finalDeadline}:R>, you have until then to put in your final count!`;
            const participantText = mentions ? `\n\n✨ **Participants:**\n${mentions}` : '\n\n✨ **Participants:**';
            const fullMessage = mainMessage + participantText;

            if (fullMessage.length > 1900) {
              await channel.send(mainMessage + '\n\n✨ **Participants:**');
              await channel.send(mentions);
            } else {
              await channel.send(fullMessage);
            }

            await saveEndingSprint(row.channel_id, {
              guildId: sprint.guildId,
              type: sprint.type,
              duration: sprint.duration,
              sprintNumber: sprint.sprintNumber,
              originalParticipants: sprint.originalParticipants,
              finalTimes: sprint.finalTimes,
              submittedUsers: sprint.submittedUsers,
              leaderboardAt: Date.now() + submitWindow * 60 * 1000
            });

            sprint.endMessageSent = true;
            console.log(`[Sprint ${row.channel_id}] End message sent and ending sprint saved to DB (restored)`);

            sprint.reminderTimer = setTimeout(async () => {
              const unsubmitted = [...sprint.originalParticipants].filter(id => !sprint.submittedUsers.has(id));
              if (unsubmitted.length > 0) {
                const reminderMentions = unsubmitted.map(id => `<@${id}>`).join(', ');
                const reminderDeadline = Math.floor((Date.now() + 2 * 60 * 1000) / 1000);
                const reminderMessage = `‼️ **Reminder:**\nYou have until <t:${reminderDeadline}:t> to submit your final time with \`/final\`!\n${reminderMentions}`;
                if (reminderMessage.length > 1900) {
                  await channel.send(`‼️ **Reminder:** You have until <t:${reminderDeadline}:t> to submit your final time with \`/final\`!`);
                  await channel.send(reminderMentions);
                } else {
                  await channel.send(reminderMessage);
                }
              }
            }, (submitWindow - 2) * 60 * 1000);

            const allAlreadySubmitted = [...sprint.originalParticipants].every(id => sprint.submittedUsers.has(id));
            if (allAlreadySubmitted && Object.keys(sprint.finalTimes).length > 0) {
              await postLeaderboard(row.channel_id, guild);
            } else {
              sprint.leaderboardAt = Date.now() + submitWindow * 60 * 1000;
              sprint.finalTimer = setTimeout(() => postLeaderboard(row.channel_id, guild), submitWindow * 60 * 1000);
            }

          } catch (err) {
            console.error(`[Sprint ${row.channel_id}] Error in sprint end sequence (restoreSprintState):`, err);
          } finally {
            if (activeSprints[row.channel_id]) {
              activeSprints[row.channel_id].ending = false;
            }
            console.log(`[Sprint ${row.channel_id}] Ending lock released (restored)`);
          }
        }, msRemaining)
      };

      console.log(`Restored active ${row.type} in channel ${row.channel_id} with ${msRemaining}ms remaining`);
    }

    // Restore ending sprints
    const endingResult = await pool.query('SELECT * FROM ending_sprints');
    for (const row of endingResult.rows) {
      const msUntilLeaderboard = row.leaderboard_at - Date.now();

      // If the leaderboard time has already passed, post it now
      if (msUntilLeaderboard <= 0) {
        if (Object.keys(row.final_times).length > 0) {
          activeSprints[row.channel_id] = {
            type: row.type,
            duration: row.duration,
            originalParticipants: new Set(row.original_participants || []),
            finalTimes: row.final_times || {},
            submittedUsers: new Set(row.submitted_users || []),
            sprintNumber: row.sprint_number,
            guildId: row.guild_id,
            endTime: 0
          };
          await postLeaderboard(row.channel_id, guild);
        } else {
          await deleteEndingSprint(row.channel_id);
        }
        continue;
      }

      // Otherwise restore the sprint and set a timer to post the leaderboard
      activeSprints[row.channel_id] = {
        type: row.type,
        duration: row.duration,
        originalParticipants: new Set(row.original_participants || []),
        finalTimes: row.final_times || {},
        submittedUsers: new Set(row.submitted_users || []),
        sprintNumber: row.sprint_number,
        guildId: row.guild_id,
        endTime: 0,
        leaderboardAt: row.leaderboard_at,
        finalTimer: setTimeout(() => postLeaderboard(row.channel_id, guild), msUntilLeaderboard)
      };

      console.log(`Restored ending ${row.type} in channel ${row.channel_id} with ${msUntilLeaderboard}ms until leaderboard`);
    }

    console.log('Sprint state restored!');
  } catch (error) {
    console.error('Error restoring sprint state:', error);
  }
}

module.exports = {
  init,
  activeSprints,
  pendingSprints,
  scheduledSprints,
  cooldowns,
  restoreSprintState,
  startSprint,
  postSprintStart,
  postLeaderboard,
  cleanupSprint,
  delay,
  randomEmoji,
  parseTimeToUTC,
};