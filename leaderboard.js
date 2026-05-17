const { EmbedBuilder } = require('discord.js');
const { HOUSES, monthNames } = require('./constants');
const { pool } = require('./db');

let client;

function init(discordClient, authFn) {
    client = discordClient;
    getAuth = authFn;
}

// ---- LEADERBOARD ----
let lastLeaderboardPost = 0;

async function getSheetData() {
  const easternTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const month = easternTime.getMonth() + 1;
  const year = easternTime.getFullYear();

  const result = await pool.query(
    `SELECT house, SUM(points) as total_points 
     FROM house_points 
     WHERE EXTRACT(MONTH FROM created_at) = $1 
     AND EXTRACT(YEAR FROM created_at) = $2
     GROUP BY house`,
    [month, year]
  );

  return HOUSES.map(house => {
    const shortName = house.name.replace('House ', '');
    const row = result.rows.find(r => r.house === shortName);
    return { name: house.name, points: row ? parseInt(row.total_points) : 0, color: house.color };
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