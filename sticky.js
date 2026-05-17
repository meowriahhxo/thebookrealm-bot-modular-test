const { getStickyByChannel, saveStickyMessage, deleteStickyMessage } = require('./db');

// ---- /stick ----
async function handleStick(interaction) {
    try {
      await interaction.deferReply({ flags: 64 });
      const message = interaction.options.getString('message');
      const channel = interaction.channel;
      const existing = await getStickyByChannel(channel.id);
      if (existing && existing.message_id) {
        try {
          const oldMessage = await channel.messages.fetch(existing.message_id);
          await oldMessage.delete();
        } catch (e) {}
      }
      const sent = await channel.send(`${message}`);
      await saveStickyMessage(channel.name, channel.id, message, sent.id);
      await interaction.editReply({ content: 'Sticky message set!' });
    } catch (error) {
      console.error('Error setting sticky message:', error);
    }
  }

  // ---- /editstick ----
  async function handleEditStick(interaction) {
    try {
      await interaction.deferReply({ flags: 64 });
      const message = interaction.options.getString('message');
      const channel = interaction.channel;
      const existing = await getStickyByChannel(channel.id);
      if (!existing) {
        await interaction.editReply({ content: 'No sticky message found in this channel!' });
        return;
      }
      if (existing.message_id) {
        try {
          const oldMessage = await channel.messages.fetch(existing.message_id);
          await oldMessage.delete();
        } catch (e) {}
      }
      const sent = await channel.send(`${message}`);
      await saveStickyMessage(channel.name, channel.id, message, sent.id);
      await interaction.editReply({ content: 'Sticky message updated!' });
    } catch (error) {
      console.error('Error editing sticky message:', error);
    }
  }

  // ---- /unstick ----
  async function handleUnstick(interaction) {
    try {
      await interaction.deferReply({ flags: 64 });
      const channel = interaction.channel;
      const existing = await getStickyByChannel(channel.id);
      if (!existing) {
        await interaction.editReply({ content: 'No sticky message found in this channel!' });
        return;
      }
      if (existing.message_id) {
        try {
          const oldMessage = await channel.messages.fetch(existing.message_id);
          await oldMessage.delete();
        } catch (e) {}
      }
      await deleteStickyMessage(channel.id);
      await interaction.editReply({ content: 'Sticky message removed!' });
    } catch (error) {
      console.error('Error removing sticky message:', error);
    }
  }

  // ---- STICKY MESSAGE REPOST ----
// Called from index.js whenever a non-bot message is sent in a channel with a sticky
async function handleStickyRepost(message) {
  try {
    const existing = await getStickyByChannel(message.channelId);
    if (!existing || !existing.message) return;
    if (existing.message_id) {
      try {
        const oldMessage = await message.channel.messages.fetch(existing.message_id);
        await oldMessage.delete();
      } catch (e) {}
    }
    const sent = await message.channel.send(`${existing.message}`);
    await saveStickyMessage(existing.channel_name, existing.channel_id, existing.message, sent.id);
  } catch (error) {
    console.error('Error reposting sticky message:', error);
  }
}

  module.exports = {
  handleStick,
  handleEditStick,
  handleUnstick,
  handleStickyRepost,
};