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
            .setDescription('The member to award points to')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('house')
            .setDescription('Award points to a whole house instead of a specific user')
            .setRequired(false)
            .addChoices(
                { name: 'Asphodel', value: 'Asphodel' },
                { name: 'Dreanni', value: 'Dreanni' },
                { name: 'Laiidon', value: 'Laiidon' },
                { name: 'Zeldarian', value: 'Zeldarian' }
            ))
    .addStringOption(option =>
        option.setName('note')
            .setDescription('Optional note about why points are being awarded')
            .setRequired(false));

// handles the /addpoints command
async function handleAddPoints(interaction) {
  try {
    await interaction.deferReply({ flags: 64 });

    const modMember = await interaction.guild.members.fetch(interaction.user.id);
    if (!modMember.roles.cache.has(process.env.MOD_ROLE_ID)) {
      return interaction.editReply({ content: 'You do not have permission to use this command.' });
    }

    const targetUser = interaction.options.getUser('user');
    const houseOption = interaction.options.getString('house');
    const category = interaction.options.getString('category');
    const points = interaction.options.getInteger('points');
    const note = interaction.options.getString('note');

    // must provide either a user or a house
    if (!targetUser && !houseOption) {
      return interaction.editReply({ content: 'Please provide either a user or a house to award points to.' });
    }

    let house;
    let username;
    let userId;

    if (targetUser) {
      // user provided — look up their house from their roles
      const member = await interaction.guild.members.fetch(targetUser.id);
      const houseRoles = {
        'Asphodel': process.env.ASPHODEL_ROLE_ID,
        'Dreanni': process.env.DREANNI_ROLE_ID,
        'Laiidon': process.env.LAIIDON_ROLE_ID,
        'Zeldarian': process.env.ZELDARIAN_ROLE_ID
      };

      house = null;
      for (const [houseName, roleId] of Object.entries(houseRoles)) {
        if (member.roles.cache.has(roleId)) {
          house = houseName;
          break;
        }
      }

      if (!house) {
        return interaction.editReply({ content: `${targetUser.username} doesn't have a house role assigned yet!` });
      }

      username = targetUser.username;
      userId = targetUser.id;
    } else {
      // house provided directly — no specific user
      house = houseOption;
      username = `House ${houseOption}`;
      userId = null;
    }

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

    // post public announcement in the category spam channel
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
    await interaction.deferReply({ flags: 64 });

    const modMember = await interaction.guild.members.fetch(interaction.user.id);
    if (!modMember.roles.cache.has(process.env.MOD_ROLE_ID)) {
      return interaction.editReply({ content: 'You do not have permission to use this command.' });
    }

    const id = interaction.options.getInteger('id');

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
    await interaction.deferReply({ flags: 64 });

    const modMember = await interaction.guild.members.fetch(interaction.user.id);
    if (!modMember.roles.cache.has(process.env.MOD_ROLE_ID)) {
      return interaction.editReply({ content: 'You do not have permission to use this command.' });
    }

    console.log(`[pointslog] ${interaction.user.username} viewed the points log`);

    const result = await pool.query('SELECT * FROM house_points ORDER BY created_at DESC');

    const entries = result.rows;
    const pageSize = 15;
    const totalPages = Math.ceil(entries.length / pageSize);
    let currentPage = 0;

    function buildPage(page) {
      const start = page * pageSize;
      const slice = entries.slice(start, start + pageSize);
      const lines = slice.map(e => {
        const date = new Date(e.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        return `\`${e.id}\` - ${e.house} - ${e.username} - ${e.category} - ${e.points} points - ${date} - added by ${e.added_by}`;
      }).join('\n');
      return lines;
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

    const collector = interaction.channel.createMessageComponentCollector({ time: 60000 });
    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) return;
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