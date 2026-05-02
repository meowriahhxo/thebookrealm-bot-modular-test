const { google } = require('googleapis');
const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getAuth() {
  const credentials = JSON.parse(fs.readFileSync('./credentials.json'));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function migrate() {
  try {
    console.log('Starting April 2026 migration...');

    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: '1PNah29zGF1bS4WQZlzX229YI9sJY6Mbi7Zlk_8DxOzI',
      range: 'April 2026!A:E',
    });

    const rows = response.data.values || [];
    console.log(`Found ${rows.length} rows`);

    for (const row of rows) {
      const userId = row[0]?.toString().trim();
      const minutesRaw = row[3]?.toString().trim().replace(/,/g, '');
      const sprintsRaw = row[4]?.toString().trim();

      const minutes = parseInt(minutesRaw);
      const sprints = parseInt(sprintsRaw);

      if (!userId || userId === 'USER ID' || userId === '-' || !minutes || !sprints || isNaN(minutes) || isNaN(sprints)) {
        console.log(`Skipping row — missing or invalid data:`, row);
        continue;
      }

      const baseMinutes = Math.floor(minutes / sprints);
      const remainder = minutes - (baseMinutes * sprints);

      for (let i = 0; i < sprints; i++) {
        const rowMinutes = i === sprints - 1 ? baseMinutes + remainder : baseMinutes;
        await pool.query(
          `INSERT INTO sprint_results (user_id, guild_id, sprint_type, minutes, sprint_date)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, process.env.GUILD_ID, 'Tall Tomes Sprint', rowMinutes, '2026-04-30']
        );
      }

      console.log(`Inserted ${sprints} rows for user ${userId}`);
    }

    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await pool.end();
  }
}

migrate();