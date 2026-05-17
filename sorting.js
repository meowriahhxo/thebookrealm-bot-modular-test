const { google } = require('googleapis');
const { houseEmojis, houseColors, monthNames } = require('./constants');
const { EmbedBuilder } = require('discord.js');

let client;
let getAuth;

function init(discordClient, authFn) {
  client = discordClient;
  getAuth = authFn;
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
      await processQuizSubmission(rows[i], i + 1, client, getAuth);
    }

    lastProcessedRow = rows.length;
  } catch (error) {
    console.error('Error checking quiz submissions:', error);
  }
}

module.exports = {
    init,
  initializeLastProcessedRow,
  checkForNewQuizSubmissions,
};
