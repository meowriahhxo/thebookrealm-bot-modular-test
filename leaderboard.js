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
  const easternTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const month = easternTime.getMonth() + 1;
  const year = easternTime.getFullYear();

  // get manual points from house_points
  const pointsResult = await pool.query(
    `SELECT house, SUM(points) as total_points 
     FROM house_points 
     WHERE EXTRACT(MONTH FROM created_at) = $1 
     AND EXTRACT(YEAR FROM created_at) = $2
     GROUP BY house`,
    [month, year]
  );

  // get reading sprint minutes by house
  const sprintResult = await pool.query(
    `SELECT house, SUM(minutes) as total_minutes
     FROM sprint_results
     WHERE EXTRACT(MONTH FROM sprint_date) = $1
     AND EXTRACT(YEAR FROM sprint_date) = $2
     AND sprint_type IN ('Tall Tomes Sprint', 'Short Stacks Sprint')
     AND house IS NOT NULL
     GROUP BY house`,
    [month, year]
  );

  // get readathon minutes by house (doubled)
  const readathonResult = await pool.query(
    `SELECT house, SUM(minutes) * 2 as total_minutes
     FROM sprint_results
     WHERE EXTRACT(MONTH FROM sprint_date) = $1
     AND EXTRACT(YEAR FROM sprint_date) = $2
     AND sprint_type = 'Readathon Sprint'
     AND house IS NOT NULL
     GROUP BY house`,
    [month, year]
  );

  // get reading sprint milestones (10 points per sprint joined)
  const milestoneResult = await pool.query(
    `SELECT house, COUNT(*) * 10 as total_points
     FROM sprint_results
     WHERE EXTRACT(MONTH FROM sprint_date) = $1
     AND EXTRACT(YEAR FROM sprint_date) = $2
     AND sprint_type IN ('Tall Tomes Sprint', 'Short Stacks Sprint')
     AND house IS NOT NULL
     GROUP BY house`,
    [month, year]
  );

  return HOUSES.map(house => {
    const shortName = house.name.replace('House ', '');
    const points = pointsResult.rows.find(r => r.house === shortName);
    const sprints = sprintResult.rows.find(r => r.house === shortName);
    const readathon = readathonResult.rows.find(r => r.house === shortName);
    const milestones = milestoneResult.rows.find(r => r.house === shortName);

    const total = (points ? parseInt(points.total_points) : 0)
      + (sprints ? parseInt(sprints.total_minutes) : 0)
      + (readathon ? parseInt(readathon.total_minutes) : 0)
      + (milestones ? parseInt(milestones.total_points) : 0);

    return { name: house.name, points: total, color: house.color };
  });
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