const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

let client;

function init(discordClient) {
  client = discordClient;
}

async function handleKindnessReset(interaction) {
  const channel = interaction.options.getChannel('channel');

  try {
    await interaction.deferReply({ flags: 64 });

    await channel.send(
      'Hi friends ♥️ This is a reminder from your mods to be kind. We are seeing some activity here that concerns us. Please take a moment to reset and remember to lead with kindness. If this behavior continues, warnings may be issued. Thank you!'
    );

    await interaction.editReply({ content: `Kindness reset sent to ${channel}!` });
  } catch (err) {
    console.error('Error sending kindness reset:', err);
    await interaction.editReply({ content: 'Something went wrong sending the message.' });
  }
}

const kindnessResetCommand = new SlashCommandBuilder()
  .setName('kindnessreset')
  .setDescription('Send a kindness reminder to a channel')
  .addChannelOption(option =>
    option.setName('channel')
      .setDescription('The channel to send the reminder to')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

module.exports = {
  init,
  handleKindnessReset,
  kindnessResetCommand
};