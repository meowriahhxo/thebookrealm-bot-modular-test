const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

    //// Note: sprint_results also has sprint_ended_at (TIMESTAMPTZ), added via ALTER TABLE
   await pool.query(`
  CREATE TABLE IF NOT EXISTS sprint_results (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    sprint_type TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    sprint_date DATE NOT NULL,
    sprint_ended_at TIMESTAMPTZ,
    username TEXT,
    house TEXT,
    sprint_instance_id TEXT
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

//// Note: scheduled_sprints has a UNIQUE constraint on (channel_id, sprint_number), added via ALTER TABLE
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

await pool.query(`
  CREATE TABLE IF NOT EXISTS common_room_messages (
    channel_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS selfcare_points (
    date DATE PRIMARY KEY,
    teeth_morning_asphodel INTEGER DEFAULT 0,
    teeth_morning_dreanni INTEGER DEFAULT 0,
    teeth_morning_laiidon INTEGER DEFAULT 0,
    teeth_morning_zeldarian INTEGER DEFAULT 0,
    bed_asphodel INTEGER DEFAULT 0,
    bed_dreanni INTEGER DEFAULT 0,
    bed_laiidon INTEGER DEFAULT 0,
    bed_zeldarian INTEGER DEFAULT 0,
    hair_asphodel INTEGER DEFAULT 0,
    hair_dreanni INTEGER DEFAULT 0,
    hair_laiidon INTEGER DEFAULT 0,
    hair_zeldarian INTEGER DEFAULT 0,
    meds_morning_asphodel INTEGER DEFAULT 0,
    meds_morning_dreanni INTEGER DEFAULT 0,
    meds_morning_laiidon INTEGER DEFAULT 0,
    meds_morning_zeldarian INTEGER DEFAULT 0,
    dressed_asphodel INTEGER DEFAULT 0,
    dressed_dreanni INTEGER DEFAULT 0,
    dressed_laiidon INTEGER DEFAULT 0,
    dressed_zeldarian INTEGER DEFAULT 0,
    teeth_evening_asphodel INTEGER DEFAULT 0,
    teeth_evening_dreanni INTEGER DEFAULT 0,
    teeth_evening_laiidon INTEGER DEFAULT 0,
    teeth_evening_zeldarian INTEGER DEFAULT 0,
    meds_evening_asphodel INTEGER DEFAULT 0,
    meds_evening_dreanni INTEGER DEFAULT 0,
    meds_evening_laiidon INTEGER DEFAULT 0,
    meds_evening_zeldarian INTEGER DEFAULT 0,
    wash_asphodel INTEGER DEFAULT 0,
    wash_dreanni INTEGER DEFAULT 0,
    wash_laiidon INTEGER DEFAULT 0,
    wash_zeldarian INTEGER DEFAULT 0,
    drink_asphodel INTEGER DEFAULT 0,
    drink_dreanni INTEGER DEFAULT 0,
    drink_laiidon INTEGER DEFAULT 0,
    drink_zeldarian INTEGER DEFAULT 0,
    meal_asphodel INTEGER DEFAULT 0,
    meal_dreanni INTEGER DEFAULT 0,
    meal_laiidon INTEGER DEFAULT 0,
    meal_zeldarian INTEGER DEFAULT 0,
    read_asphodel INTEGER DEFAULT 0,
    read_dreanni INTEGER DEFAULT 0,
    read_laiidon INTEGER DEFAULT 0,
    read_zeldarian INTEGER DEFAULT 0,
    checkin_asphodel INTEGER DEFAULT 0,
    checkin_dreanni INTEGER DEFAULT 0,
    checkin_laiidon INTEGER DEFAULT 0,
    checkin_zeldarian INTEGER DEFAULT 0,
    points_asphodel INTEGER DEFAULT 0,
    points_dreanni INTEGER DEFAULT 0,
    points_laiidon INTEGER DEFAULT 0,
    points_zeldarian INTEGER DEFAULT 0,
    processed_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS ending_sprints (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    type TEXT NOT NULL,
    duration INTEGER NOT NULL,
    sprint_number INTEGER,
    original_participants TEXT[] DEFAULT '{}',
    final_times JSONB DEFAULT '{}',
    submitted_users TEXT[] DEFAULT '{}',
    leaderboard_at BIGINT NOT NULL
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS house_points (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    username TEXT,
    house TEXT,
    category TEXT,
    points INTEGER,
    added_by TEXT,
    channel_id TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
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

async function saveSprintResult(userId, guildId, sprintType, minutes, username, house, sprintInstanceId) {
  try {
    await pool.query(
      `INSERT INTO sprint_results (user_id, guild_id, sprint_type, minutes, sprint_date, sprint_ended_at, username, house, sprint_instance_id)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, NOW(), $5, $6, $7)`,
      [userId, guildId, sprintType, minutes, username || null, house || null, sprintInstanceId || null]
    );
  } catch (error) {
    console.error(`[saveSprintResult] FAILED to save: user=${userId} type=${sprintType} minutes=${minutes}`, error);
    throw error;
  }
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

async function saveEndingSprint(channelId, sprint) {
  await pool.query(`
    INSERT INTO ending_sprints (channel_id, guild_id, type, duration, sprint_number, original_participants, final_times, submitted_users, leaderboard_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (channel_id) DO UPDATE SET
      guild_id = $2, type = $3, duration = $4, sprint_number = $5,
      original_participants = $6, final_times = $7, submitted_users = $8, leaderboard_at = $9
  `, [
    channelId,
    sprint.guildId,
    sprint.type,
    sprint.duration,
    sprint.sprintNumber || null,
    [...(sprint.originalParticipants || [])],
    JSON.stringify(sprint.finalTimes || {}),
    [...(sprint.submittedUsers || [])],
    sprint.leaderboardAt
  ]);
}

async function deleteEndingSprint(channelId) {
  await pool.query('DELETE FROM ending_sprints WHERE channel_id = $1', [channelId]);
}

async function saveCommonRoomMessage(channelId, messageId) {
  await pool.query(`
    INSERT INTO common_room_messages (channel_id, message_id)
    VALUES ($1, $2)
    ON CONFLICT (channel_id) DO UPDATE SET message_id = $2
  `, [channelId, messageId]);
}

async function getCommonRoomMessages() {
  const result = await pool.query('SELECT * FROM common_room_messages');
  return result.rows;
}

module.exports = {
  pool,
  initializeDatabase,
  getStickyMessages,
  getStickyByChannel,
  saveStickyMessage,
  deleteStickyMessage,
  saveSprintResult,
  saveActiveSprint,
  savePendingSprint,
  saveScheduledSprint,
  deleteActiveSprint,
  deletePendingSprint,
  deleteScheduledSprint,
  saveEndingSprint,
  deleteEndingSprint,
  saveCommonRoomMessage,
  getCommonRoomMessages,
};