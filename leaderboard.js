const { EmbedBuilder } = require('discord.js');
const { HOUSES, monthNames } = require('./constants');
const { pool } = require('./db');

let client;

function init(discordClient) {
    client = discordClient;
}

// ---- LEADERBOARD ----
let lastLeaderboardPost = 0;

async function getSheetData() {
// load double points category from DB
const easternTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const month = easternTime.getMonth() + 1;
  const year = easternTime.getFullYear();

  let doubleCategories = [];
  try {
    const setting = await pool.query(
      `SELECT value FROM bot_settings WHERE key = 'double_points_category' AND effective_month = $1 AND effective_year = $2`,
      [month, year]
    );
    doubleCategories = setting.rows.map(r => r.value);
  } catch (err) {
    console.error('[Leaderboard] Failed to load double_points_category, defaulting to none:', err.message);
  }

  const pointsResult = await pool.query(
    `SELECT house, SUM(points) as total_points 
     FROM house_points 
     WHERE EXTRACT(MONTH FROM created_at AT TIME ZONE 'America/New_York') = $1 
     AND EXTRACT(YEAR FROM created_at AT TIME ZONE 'America/New_York') = $2
     AND category != 'Self Care'
     GROUP BY house`,
    [month, year]
  );

  const sprintResult = await pool.query(
    `SELECT house, SUM(minutes) as total_minutes
     FROM sprint_results
     WHERE EXTRACT(MONTH FROM sprint_ended_at AT TIME ZONE 'America/New_York') = $1
     AND EXTRACT(YEAR FROM sprint_ended_at AT TIME ZONE 'America/New_York') = $2
     AND sprint_type IN ('Tall Tomes Sprint', 'Short Stacks Sprint', 'Readathon Sprint')
     AND house IS NOT NULL
     GROUP BY house`,
    [month, year]
  );

  const readathonBonusResult = await pool.query(
    `SELECT house, SUM(minutes) as total_minutes
     FROM sprint_results
     WHERE EXTRACT(MONTH FROM sprint_ended_at AT TIME ZONE 'America/New_York') = $1
     AND EXTRACT(YEAR FROM sprint_ended_at AT TIME ZONE 'America/New_York') = $2
     AND sprint_type = 'Readathon Sprint'
     AND house IS NOT NULL
     GROUP BY house`,
    [month, year]
  );

  const milestoneResult = await pool.query(
    `SELECT house, COUNT(*) * 10 as total_points
     FROM sprint_results
     WHERE EXTRACT(MONTH FROM sprint_ended_at AT TIME ZONE 'America/New_York') = $1
     AND EXTRACT(YEAR FROM sprint_ended_at AT TIME ZONE 'America/New_York') = $2
     AND sprint_type IN ('Tall Tomes Sprint', 'Short Stacks Sprint', 'Readathon Sprint')
     AND house IS NOT NULL
     GROUP BY house`,
    [month, year]
  );

  const selfcareResult = await pool.query(
    `SELECT 
      (SUM(checkin_asphodel) + SUM(checkin_dreanni) * 0 + SUM(checkin_dreanni) * 0) * 0 as dummy,
      SUM(checkin_asphodel) * 10 as checkin_asp, SUM(checkin_dreanni) * 10 as checkin_dre, SUM(checkin_laiidon) * 10 as checkin_lai, SUM(checkin_zeldarian) * 10 as checkin_zel,
      (SUM(teeth_morning_asphodel) + SUM(teeth_evening_asphodel)) * 10 as teeth_asp,
      (SUM(teeth_morning_dreanni) + SUM(teeth_evening_dreanni)) * 10 as teeth_dre,
      (SUM(teeth_morning_laiidon) + SUM(teeth_evening_laiidon)) * 10 as teeth_lai,
      (SUM(teeth_morning_zeldarian) + SUM(teeth_evening_zeldarian)) * 10 as teeth_zel,
      SUM(bed_asphodel) * 10 as bed_asp, SUM(bed_dreanni) * 10 as bed_dre, SUM(bed_laiidon) * 10 as bed_lai, SUM(bed_zeldarian) * 10 as bed_zel,
      SUM(hair_asphodel) * 10 as hair_asp, SUM(hair_dreanni) * 10 as hair_dre, SUM(hair_laiidon) * 10 as hair_lai, SUM(hair_zeldarian) * 10 as hair_zel,
      (SUM(meds_morning_asphodel) + SUM(meds_evening_asphodel)) * 10 as meds_asp,
      (SUM(meds_morning_dreanni) + SUM(meds_evening_dreanni)) * 10 as meds_dre,
      (SUM(meds_morning_laiidon) + SUM(meds_evening_laiidon)) * 10 as meds_lai,
      (SUM(meds_morning_zeldarian) + SUM(meds_evening_zeldarian)) * 10 as meds_zel,
      SUM(dressed_asphodel) * 10 as dressed_asp, SUM(dressed_dreanni) * 10 as dressed_dre, SUM(dressed_laiidon) * 10 as dressed_lai, SUM(dressed_zeldarian) * 10 as dressed_zel,
      SUM(wash_asphodel) * 10 as wash_asp, SUM(wash_dreanni) * 10 as wash_dre, SUM(wash_laiidon) * 10 as wash_lai, SUM(wash_zeldarian) * 10 as wash_zel,
      SUM(drink_asphodel) * 10 as drink_asp, SUM(drink_dreanni) * 10 as drink_dre, SUM(drink_laiidon) * 10 as drink_lai, SUM(drink_zeldarian) * 10 as drink_zel,
      SUM(meal_asphodel) * 10 as meal_asp, SUM(meal_dreanni) * 10 as meal_dre, SUM(meal_laiidon) * 10 as meal_lai, SUM(meal_zeldarian) * 10 as meal_zel,
      SUM(read_asphodel) * 10 as read_asp, SUM(read_dreanni) * 10 as read_dre, SUM(read_laiidon) * 10 as read_lai, SUM(read_zeldarian) * 10 as read_zel
     FROM selfcare_points
     WHERE EXTRACT(MONTH FROM processed_at AT TIME ZONE 'America/New_York') = $1
     AND EXTRACT(YEAR FROM processed_at AT TIME ZONE 'America/New_York') = $2`,
    [month, year]
  );

  const sc = selfcareResult.rows[0] || {};

  const selfcareTotals = {
    Asphodel: (parseInt(sc.checkin_asp) || 0) + (parseInt(sc.teeth_asp) || 0) + (parseInt(sc.bed_asp) || 0) + (parseInt(sc.hair_asp) || 0) + (parseInt(sc.meds_asp) || 0) + (parseInt(sc.dressed_asp) || 0) + (parseInt(sc.wash_asp) || 0) + (parseInt(sc.drink_asp) || 0) + (parseInt(sc.meal_asp) || 0) + (parseInt(sc.read_asp) || 0),
    Dreanni: (parseInt(sc.checkin_dre) || 0) + (parseInt(sc.teeth_dre) || 0) + (parseInt(sc.bed_dre) || 0) + (parseInt(sc.hair_dre) || 0) + (parseInt(sc.meds_dre) || 0) + (parseInt(sc.dressed_dre) || 0) + (parseInt(sc.wash_dre) || 0) + (parseInt(sc.drink_dre) || 0) + (parseInt(sc.meal_dre) || 0) + (parseInt(sc.read_dre) || 0),
    Laiidon: (parseInt(sc.checkin_lai) || 0) + (parseInt(sc.teeth_lai) || 0) + (parseInt(sc.bed_lai) || 0) + (parseInt(sc.hair_lai) || 0) + (parseInt(sc.meds_lai) || 0) + (parseInt(sc.dressed_lai) || 0) + (parseInt(sc.wash_lai) || 0) + (parseInt(sc.drink_lai) || 0) + (parseInt(sc.meal_lai) || 0) + (parseInt(sc.read_lai) || 0),
    Zeldarian: (parseInt(sc.checkin_zel) || 0) + (parseInt(sc.teeth_zel) || 0) + (parseInt(sc.bed_zel) || 0) + (parseInt(sc.hair_zel) || 0) + (parseInt(sc.meds_zel) || 0) + (parseInt(sc.dressed_zel) || 0) + (parseInt(sc.wash_zel) || 0) + (parseInt(sc.drink_zel) || 0) + (parseInt(sc.meal_zel) || 0) + (parseInt(sc.read_zel) || 0),
  };

  return Promise.all(HOUSES.map(async house => {
    const shortName = house.name.replace('House ', '');
    const points = pointsResult.rows.find(r => r.house === shortName);
    const sprints = sprintResult.rows.find(r => r.house === shortName);
    const readathonBonus = readathonBonusResult.rows.find(r => r.house === shortName);
    const milestones = milestoneResult.rows.find(r => r.house === shortName);
    const selfcare = selfcareTotals[shortName] || 0;

    // calculate double points bonus — selfcare comes from selfcare_points, everything else from house_points
let doubleBonus = 0;
    for (const doubleCategory of doubleCategories) {
      if (doubleCategory === 'Self Care') {
        doubleBonus += selfcare;
      } else {
        const bonusResult = await pool.query(
          `SELECT COALESCE(SUM(points), 0) as bonus FROM house_points
           WHERE house = $1 AND category = $2
           AND EXTRACT(MONTH FROM created_at AT TIME ZONE 'America/New_York') = $3
           AND EXTRACT(YEAR FROM created_at AT TIME ZONE 'America/New_York') = $4`,
          [shortName, doubleCategory, month, year]
        );
        doubleBonus += parseInt(bonusResult.rows[0].bonus) || 0;
      }
    }

    const total = (points ? parseInt(points.total_points) : 0)
      + (sprints ? parseInt(sprints.total_minutes) : 0)
      + (readathonBonus ? parseInt(readathonBonus.total_minutes) : 0)
      + (milestones ? parseInt(milestones.total_points) : 0)
      + selfcare
      + doubleBonus;
      
    return { name: house.name, points: total, color: house.color };
  }));
}

function buildLeaderboardEmbed(housePoints) {
    const sorted = [...housePoints].sort((a, b) => b.points - a.points);
    const medals = ["🥇", "🥈", "🥉", "4️⃣"];
    const easternTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const month = `${monthNames[easternTime.getMonth()]} ${easternTime.getFullYear()}`;
    const gap = (sorted[0].points - sorted[1].points).toLocaleString();

    const embed = new EmbedBuilder()
    .setTitle(`🏆 ${month} House Point Standings`)
    .setURL('https://thebookrealm.net/leaderboard')
    .setColor(sorted[0].color)
        .setTimestamp()
        .setFooter({ text: "The Book Realm • Click the title to view the full leaderboard!" });

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
        console.error('[HouseLeaderboard] Failed to post leaderboard:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
}

module.exports = {
    init,
    getSheetData,
    buildLeaderboardEmbed,
    postHouseLeaderboard,
};