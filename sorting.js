const express = require('express');
const { houseEmojis, houseColors } = require('./constants');
const { EmbedBuilder } = require('discord.js');
const { pool } = require('./db');

let client;

function init(discordClient) {
  client = discordClient;
}

// ---- ANSWER MAP ----
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

// ---- SORTING RESULT HANDLER ----
// Called by the Express route below when the website POSTs a quiz result
async function postSortingResult({ username, houseCounts, submissionNumber }) {
  const winner = Object.keys(houseCounts).reduce((a, b) => houseCounts[a] > houseCounts[b] ? a : b);
  const topScore = houseCounts[winner];
  const tiedHouses = Object.keys(houseCounts).filter(h => houseCounts[h] === topScore);
  const tieNote = tiedHouses.length > 1
    ? `\n‼️ **Tie between ${tiedHouses.join(" and ")}! Please choose the house with the lower member count!**`
    : "";

  const embed = new EmbedBuilder()
    .setTitle(`✨ New Sorting Quiz Submission ${submissionNumber} ✨`)
    .setDescription(`Don't forget to check house count before announcing the results!`)
    .setColor(tiedHouses.length > 1 ? 0xff0000 : houseColors[winner])
    .setFooter({ text: `Submitted at: ${new Date().toLocaleString()}` })
    .addFields(
      { name: "<:asphheart:1492573486785499307> Asphodel", value: `${houseCounts.Asphodel}`, inline: false },
      { name: "<:dreanniheart:1492573488425340928> Dreanni", value: `${houseCounts.Dreanni}`, inline: false },
      { name: "<:laiidonheart:1492573490434281532> Laiidon", value: `${houseCounts.Laiidon}`, inline: false },
      { name: "<:zeldheart:1492573492564983970> Zeldarian", value: `${houseCounts.Zeldarian}`, inline: false },
      { name: "Results", value: `**${username}** has been sorted into **House ${winner}**! ${houseEmojis[winner]}${tieNote}`, inline: false }
    );

  const channel = await client.channels.fetch(process.env.SORTING_CHANNEL_ID);
  await channel.send({
    content: `<@&${process.env.MOD_ROLE_ID}> A new member has completed the sorting quiz!`,
    embeds: [embed]
  });
}

// ---- EXPRESS LISTENER ----
// Starts a small web server so the website can POST quiz results to the bot
function startSortingListener() {
  const app = express();
  app.use(express.json()); // lets Express read the JSON body the website sends

  app.post('/sorting-result', async (req, res) => {
    try {
      const { username, houseCounts, submissionNumber } = req.body;
      await postSortingResult({ username, houseCounts, submissionNumber });
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error posting sorting result:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  const port = process.env.SORTING_PORT || 3001;
  app.listen(port, () => {
    console.log(`Sorting listener running on port ${port}`);
  });
}

// ---- /sortinglog COMMAND ----
async function handleSortingLog(interaction) {
  try {
    const modMember = await interaction.guild.members.fetch(interaction.user.id);
    if (!modMember.roles.cache.has(process.env.MOD_ROLE_ID)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply();

    const number = interaction.options.getInteger('number');

    // ---- SINGLE SUBMISSION VIEW ----
    if (number) {
      const result = await pool.query(
        'SELECT * FROM sorting_submissions WHERE id = $1',
        [number]
      );

      if (result.rows.length === 0) {
        return interaction.editReply({ content: `No submission found with number #${number}.` });
      }

      const row = result.rows[0];
      const houseCounts = row.house_counts;
      const winner = row.house;
      const topScore = houseCounts[winner];
      const tiedHouses = Object.keys(houseCounts).filter(h => houseCounts[h] === topScore);
      const tieNote = tiedHouses.length > 1
        ? `\n‼️ **Tie between ${tiedHouses.join(' and ')}!**`
        : '';
      const submittedAt = new Date(row.submitted_at).toLocaleString('en-US', { timeZone: 'America/New_York' });

      const embed = new EmbedBuilder()
        .setTitle(`✨ Sorting Quiz Submission #${row.id} ✨`)
        .setDescription(`Don't forget to check house count before announcing the results!`)
        .setColor(tiedHouses.length > 1 ? 0xff0000 : houseColors[winner])
        .setFooter({ text: `Submitted at: ${submittedAt}` })
        .addFields(
          { name: '<:asphheart:1492573486785499307> Asphodel', value: `${houseCounts.Asphodel}`, inline: false },
          { name: '<:dreanniheart:1492573488425340928> Dreanni', value: `${houseCounts.Dreanni}`, inline: false },
          { name: '<:laiidonheart:1492573490434281532> Laiidon', value: `${houseCounts.Laiidon}`, inline: false },
          { name: '<:zeldheart:1492573492564983970> Zeldarian', value: `${houseCounts.Zeldarian}`, inline: false },
          { name: 'Results', value: `**${row.username}** has been sorted into **House ${winner}**! ${houseEmojis[winner]}${tieNote}`, inline: false }
        );

      return interaction.editReply({ embeds: [embed] });
    }

    // ---- LIST VIEW ----
    console.log(`[sortinglog] ${interaction.user.username} viewed the sorting log`);

    const result = await pool.query(
      'SELECT * FROM sorting_submissions ORDER BY id DESC LIMIT 20'
    );
    const entries = result.rows;

    if (entries.length === 0) {
      return interaction.editReply({ content: 'No sorting submissions found.' });
    }

    const pageSize = 10;
    const totalPages = Math.ceil(entries.length / pageSize) || 1;
    let currentPage = 0;

    function buildPage(page) {
      const start = page * pageSize;
      const slice = entries.slice(start, start + pageSize);
      return slice.map(e => {
        const date = new Date(e.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        return `\`#${e.id}\` — ${e.username} — **${e.house}** — ${date}`;
      }).join('\n');
    }

    const embed = new EmbedBuilder()
      .setTitle('Sorting Quiz Log')
      .setDescription(buildPage(0))
      .setFooter({ text: `Page 1 of ${totalPages} · Use /sortinglog number: to view full results` })
      .setColor(0x9b59b6);

    await interaction.editReply({
      embeds: [embed],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 2, label: 'Previous', custom_id: 'sortinglog_prev', disabled: true },
          { type: 2, style: 2, label: 'Next', custom_id: 'sortinglog_next', disabled: totalPages <= 1 }
        ]
      }]
    });

    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 60000
    });

    collector.on('collect', async i => {
      if (i.customId === 'sortinglog_next') currentPage++;
      if (i.customId === 'sortinglog_prev') currentPage--;

      const updatedEmbed = new EmbedBuilder()
        .setTitle('Sorting Quiz Log')
        .setDescription(buildPage(currentPage))
        .setFooter({ text: `Page ${currentPage + 1} of ${totalPages} · Use /sortinglog number: to view full results` })
        .setColor(0x9b59b6);

      await i.update({
        embeds: [updatedEmbed],
        components: [{
          type: 1,
          components: [
            { type: 2, style: 2, label: 'Previous', custom_id: 'sortinglog_prev', disabled: currentPage === 0 },
            { type: 2, style: 2, label: 'Next', custom_id: 'sortinglog_next', disabled: currentPage === totalPages - 1 }
          ]
        }]
      });
    });

  } catch (error) {
    console.error('Error handling sortinglog command:', error);
  }
}

module.exports = {
  init,
  answers,
  startSortingListener,
  handleSortingLog
};