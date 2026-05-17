// housePoints.js — handles /addpoints, /removepoints, and /pointslog commands

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Pool } = require('pg');

// database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// maps each point category to its announcement channel
const categoryChannels = {
    'Reading Challenges': '1473034184858669168',
    'Passive Competitions': '1473035227462111317',
    'Live Competitions': '1473035166589915136',
    'Ranks / Levels': '1473036356208038001',
    'QOTD': '1473036393839067345',
    'Bingo': '1473037242657149102',
    'Book Reviews': '1473037306322485351',
    'Boosts': '1473037974345089250',
    'Book Club Discussion': '1473038020100751390',
    'Book Club Rating': '1473038020100751390',
    'Mod Points': '1487877846558052443'
};

// /addpoints command definition
const addPointsCommand = new SlashCommandBuilder()
    .setName('addpoints')
    .setDescription('Add house points for a member')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('The member to award points to')
            .setRequired(true))
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
    .addStringOption(option =>
        option.setName('note')
            .setDescription('Optional note about why points are being awarded')
            .setRequired(false));

// handles the /addpoints command
async function handleAddPoints(interaction) {

    // check if the user has the mod role
    const modMember = await interaction.guild.members.fetch(interaction.user.id);
    if (!modMember.roles.cache.has(process.env.MOD_ROLE_ID)) {
        return interaction.reply({
            content: 'You do not have permission to use this command.',
            flags: 64
        });
    }
    // get all the options the mod selected
    const targetUser = interaction.options.getUser('user');
    const category = interaction.options.getString('category');
    const points = interaction.options.getInteger('points');
    const note = interaction.options.getString('note');

    // fetch the member from the guild so we can check their roles
    const member = await interaction.guild.members.fetch(targetUser.id);

    // house role IDs
    const houseRoles = {
        'Asphodel': process.env.ASPHODEL_ROLE_ID,
        'Dreanni': process.env.DREANNI_ROLE_ID,
        'Laiidon': process.env.LAIIDON_ROLE_ID,
        'Zeldarian': process.env.ZELDARIAN_ROLE_ID
    };

    // figure out which house the member belongs to
    let house = null;
    for (const [houseName, roleId] of Object.entries(houseRoles)) {
        if (member.roles.cache.has(roleId)) {
            house = houseName;
            break;
        }
    }

    // if they don't have a house role, stop here
    if (!house) {
        return interaction.reply({
            content: `${targetUser.username} doesn't have a house role assigned yet!`,
            flags: 64
        });
    }

    // save to the database
    const result = await pool.query(
        `INSERT INTO house_points (user_id, username, house, category, points, added_by, channel_id, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
            targetUser.id,
            targetUser.username,
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
    const announcementChannel = await interaction.client.channels.fetch(categoryChannels[category]);
    await announcementChannel.send(
        `${house} - ${targetUser.username} - ${category} - ${points} points` +
        (note ? `\n*📝 ${note}*` : '')
    );

    // send ephemeral confirmation to the mod
    await interaction.reply({
        content: `${house} - ${targetUser.username} - ${category} - ${points} points` +
            (note ? `\n*📝 ${note}*` : '') +
            `\n✅ Logged - Entry ID: \`${entryId}\``,
        flags: 64
    });
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
    // check if the user has the mod role
    const modMember = await interaction.guild.members.fetch(interaction.user.id);
    if (!modMember.roles.cache.has(process.env.MOD_ROLE_ID)) {
        return interaction.reply({
            content: 'You do not have permission to use this command.',
            flags: 64
        });
    }
    const id = interaction.options.getInteger('id');

    // check if the entry exists first
    const check = await pool.query(
        'SELECT * FROM house_points WHERE id = $1',
        [id]
    );

    // if no entry found, tell the mod
    if (check.rows.length === 0) {
        return interaction.reply({
            content: `❌ No entry found with ID \`${id}\`.`,
            flags: 64
        });
    }

    // delete the entry
    const entry = check.rows[0];
    await pool.query('DELETE FROM house_points WHERE id = $1', [id]);

    // confirm to the mod
    await interaction.reply({
        content: `🗑️ Removed entry \`${id}\` — ${entry.house} - ${entry.username} - ${entry.category} - ${entry.points} points`,
        flags: 64
    });
}

// /pointslog command definition
const pointsLogCommand = new SlashCommandBuilder()
    .setName('pointslog')
    .setDescription('View recent house points entries');

// handles the /pointslog command
async function handlePointsLog(interaction) {
    // check if the user has the mod role
    const modMember = await interaction.guild.members.fetch(interaction.user.id);
    if (!modMember.roles.cache.has(process.env.MOD_ROLE_ID)) {
        return interaction.reply({
            content: 'You do not have permission to use this command.',
            flags: 64
        });
    }
    // fetch all entries from the database, newest first
    const result = await pool.query(
        'SELECT * FROM house_points ORDER BY created_at DESC'
    );

    const entries = result.rows;
    const pageSize = 15;
    const totalPages = Math.ceil(entries.length / pageSize);
    let currentPage = 0;

    // builds the text for a given page
    function buildPage(page) {
        const start = page * pageSize;
        const slice = entries.slice(start, start + pageSize);
        const lines = slice.map(e => {
            const date = new Date(e.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            return `\`${e.id}\` - ${e.house} - ${e.username} - ${e.category} - ${e.points} points - ${date} - added by ${e.added_by}`;
        }).join('\n');
        return lines;
    }

    // build the initial embed
    const embed = new EmbedBuilder()
        .setTitle('House Points Log')
        .setDescription(buildPage(0))
        .setFooter({ text: `Page 1 of ${totalPages}` })
        .setColor(0x9b59b6);

    // send with Previous/Next buttons
    await interaction.reply({
        embeds: [embed],
        components: [{
            type: 1,
            components: [
                { type: 2, style: 2, label: 'Previous', custom_id: 'log_prev', disabled: true },
                { type: 2, style: 2, label: 'Next', custom_id: 'log_next', disabled: totalPages <= 1 }
            ]
        }],
        flags: 64
    });

    // listen for button clicks
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
}

// export commands and handlers for use in index.js
module.exports = {
    commands: [addPointsCommand, removePointsCommand, pointsLogCommand],
    handleAddPoints,
    handleRemovePoints,
    handlePointsLog
};