// housePoints.js — handles /addpoints, /removepoints, and /pointslog commands

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { pool } = require('./db');

// maps each point category to its announcement channel
const categoryChannels = {
    'Reading Challenges': '1505683097763709157',
    'Passive Competitions': '1505683097763709157',
    'Live Competitions': '1505683097763709157',
    'Ranks / Levels': '1505683097763709157',
    'QOTD': '1505683097763709157',
    'Bingo': '1505683097763709157',
    'Book Reviews': '1505683097763709157',
    'Boosts': '1505683097763709157',
    'Book Club Discussion': '1505683097763709157',
    'Book Club Rating': '1505683097763709157',
    'Mod Points': '1505683097763709157'
};

// /addpoints command definition
const addPointsCommand = new SlashCommandBuilder()
    .setName('addpoints')
    .setDescription('Add house points for a member or a whole house')
    .addStringOption(option =>
        option.setName('house')
            .setDescription('The house to award points to')
            .setRequired(true)
            .addChoices(
                { name: 'Asphodel', value: 'Asphodel' },
                { name: 'Dreanni', value: 'Dreanni' },
                { name: 'Laiidon', value: 'Laiidon' },
                { name: 'Zeldarian', value: 'Zeldarian' }
            ))
    .addStringOption(option =>
        option.setName('category')
            .setDescription('The category of points')
            .setRequired(true)
            .addChoices(
                { name: 'Reading Challenges', value: 'Reading Challenges' },
                { name: 'Passive Competitions', value: 'Passive Competitions' },
                { name: 'Live Competitions', value: 'Live Competitions' },
                { name: 'Ranks / Levels', value: 'Ranks / Levels' },
                { name: 'QOTD', value: 'QOTD' },
                { name: 'Bingo', value: 'Bingo' },
                { name: 'Book Reviews', value: 'Book Reviews' },
                { name: 'Boosts', value: 'Boosts' },
                { name: 'Book Club Discussion', value: 'Book Club Discussion' },
                { name: 'Book Club Rating', value: 'Book Club Rating' },
                { name: 'Mod Points', value: 'Mod Points' }
            ))
    .addIntegerOption(option =>
        option.setName('points')
            .setDescription('Number of points to award')
            .setRequired(true))
    .addUserOption(option =>
        option.setName('user')
            .setDescription('The specific member to award points to (optional)')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('note')
            .setDescription('Optional note about why points are being awarded')
            .setRequired(false));

// handles the /addpoints command
async function handleAddPoints(interaction) {
  try {
    const modMember = await interaction.guild.members.fetch(interaction.user.id);
    if (!modMember.roles.cache.has(process.env.MOD_ROLE_ID)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: 64 });
    }

    const house = interaction.options.getString('house');
    const category = interaction.options.getString('category');
    const points = interaction.options.getInteger('points');
    const targetUser = interaction.options.getUser('user');
    const note = interaction.options.getString('note');

if (points < 1 || points > 10000) {
  return interaction.reply({ content: 'Points must be between 1 and 10,000.', flags: 64 });
}
    
    const username = targetUser ? targetUser.username : `House ${house}`;
    const userId = targetUser ? targetUser.id : null;

    // all checks passed — defer now before DB work
    await interaction.deferReply({ flags: 64 });

    const result = await pool.query(
      `INSERT INTO house_points (user_id, username, house, category, points, added_by, channel_id, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        userId,
        username,
        house,
        category,
        points,
        interaction.user.username,
        categoryChannels[category],
        note || null
      ]
    );

    const entryId = result.rows[0].id;

    // post public announcement in the category channel
    try {
      const announcementChannel = await interaction.client.channels.fetch(categoryChannels[category]);
      await announcementChannel.send(
        `${house} - ${username} - ${category} - ${points} points` +
        (note ? `\n*📝 ${note}*` : '')
      );
    } catch (e) {
      console.log(`Could not post to announcement channel for ${category} — skipping`);
    }

    console.log(`[addpoints] ${interaction.user.username} added ${points} points to ${username} (${house}) for ${category}`);

    await interaction.editReply({
      content: `${house} - ${username} - ${category} - ${points} points` +
        (note ? `\n*📝 ${note}*` : '') +
        `\n✅ Logged - Entry ID: \`${entryId}\``
    });
  } catch (error) {
    console.error('Error handling addpoints command:', error);
  }
}

// /removepoints command definition
const removePointsCommand = new SlashCommandBuilder()
    .setName('removepoints')
    .setDescription('Remove a house points entry by ID')
    .addIntegerOption(option =>
        option.setName('id')
            .setDescription('The entry ID to remove')
            .setRequired(true));

// handles the /removepoints command
async function handleRemovePoints(interaction) {
  try {
    const modMember = await interaction.guild.members.fetch(interaction.user.id);
    if (!modMember.roles.cache.has(process.env.MOD_ROLE_ID)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: 64 });
    }

    const id = interaction.options.getInteger('id');

    // all checks passed — defer now before DB work
    await interaction.deferReply();

    const check = await pool.query('SELECT * FROM house_points WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return interaction.editReply({ content: `❌ No entry found with ID \`${id}\`.` });
    }

    const entry = check.rows[0];
    await pool.query('DELETE FROM house_points WHERE id = $1', [id]);

    console.log(`[removepoints] ${interaction.user.username} removed entry ${id} — ${entry.house} - ${entry.username} - ${entry.category} - ${entry.points} points`);

    await interaction.editReply({
      content: `🗑️ Removed entry \`${id}\` — ${entry.house} - ${entry.username} - ${entry.category} - ${entry.points} points`
    });
  } catch (error) {
    console.error('Error handling removepoints command:', error);
  }
}

// /pointslog command definition
const pointsLogCommand = new SlashCommandBuilder()
    .setName('pointslog')
    .setDescription('View recent house points entries');

// handles the /pointslog command
async function handlePointsLog(interaction) {
  try {
    const modMember = await interaction.guild.members.fetch(interaction.user.id);
    if (!modMember.roles.cache.has(process.env.MOD_ROLE_ID)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: 64 });
    }

    // all checks passed — defer now before DB work
    await interaction.deferReply();

    console.log(`[pointslog] ${interaction.user.username} viewed the points log`);

    const result = await pool.query(
  'SELECT * FROM house_points WHERE created_at >= NOW() - INTERVAL \'14 days\' ORDER BY created_at DESC'
);
    const entries = result.rows;
    const pageSize = 15;
    const totalPages = Math.ceil(entries.length / pageSize) || 1;
    let currentPage = 0;

    function buildPage(page) {
      const start = page * pageSize;
      const slice = entries.slice(start, start + pageSize);
      if (slice.length === 0) return 'No entries found.';
      return slice.map(e => {
        const date = new Date(e.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        return `\`${e.id}\` - ${e.house} - ${e.username} - ${e.category} - ${e.points} points - ${date} - added by ${e.added_by}`;
      }).join('\n');
    }

    const embed = new EmbedBuilder()
      .setTitle('House Points Log')
      .setDescription(buildPage(0))
      .setFooter({ text: `Page 1 of ${totalPages}` })
      .setColor(0x9b59b6);

    await interaction.editReply({
      embeds: [embed],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 2, label: 'Previous', custom_id: 'log_prev', disabled: true },
          { type: 2, style: 2, label: 'Next', custom_id: 'log_next', disabled: totalPages <= 1 }
        ]
      }]
    });

    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 60000
    });

    collector.on('collect', async i => {
      if (i.customId === 'log_next') currentPage++;
      if (i.customId === 'log_prev') currentPage--;

      const updatedEmbed = new EmbedBuilder()
        .setTitle('House Points Log')
        .setDescription(buildPage(currentPage))
        .setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` })
        .setColor(0x9b59b6);

      await i.update({
        embeds: [updatedEmbed],
        components: [{
          type: 1,
          components: [
            { type: 2, style: 2, label: 'Previous', custom_id: 'log_prev', disabled: currentPage === 0 },
            { type: 2, style: 2, label: 'Next', custom_id: 'log_next', disabled: currentPage === totalPages - 1 }
          ]
        }]
      });
    });
  } catch (error) {
    console.error('Error handling pointslog command:', error);
  }
}

// export commands and handlers for use in index.js
module.exports = {
    commands: [addPointsCommand, removePointsCommand, pointsLogCommand],
    handleAddPoints,
    handleRemovePoints,
    handlePointsLog
};