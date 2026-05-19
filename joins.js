const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
registerFont('./Roboto-Bold.ttf', { family: 'Roboto', weight: 'bold' });
registerFont('./Roboto-Regular.ttf', { family: 'Roboto' });

let client;

function init(discordClient) {
  client = discordClient;
}

// ---- GUILD MEMBER ADD ----
async function handleMemberAdd(member) {
  try {
    const canvas = createCanvas(800, 300);
    const ctx = canvas.getContext('2d');

    const background = await loadImage('./welcome-background.png');
    ctx.drawImage(background, 0, 0, 800, 300);

    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
    const avatar = await loadImage(avatarURL);
    ctx.save();
    ctx.beginPath();
    ctx.arc(150, 150, 90, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 60, 60, 180, 180);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(150, 150, 91, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#b16caf';
    ctx.font = 'bold 34px Roboto';
    ctx.fillText('Welcome to The Book Realm!', 280, 120);

    ctx.fillStyle = '#555555';
    let usernameFontSize = 28;
    ctx.font = `${usernameFontSize}px Roboto`;
    while (ctx.measureText(`${member.user.username} just joined the server`).width > 480 && usernameFontSize > 14) {
      usernameFontSize--;
      ctx.font = `${usernameFontSize}px Roboto`;
    }
    ctx.fillText(`${member.user.username} just joined the server`, 280, 170);

    const memberCount = member.guild.memberCount;
    ctx.font = '22px Roboto';
    ctx.fillStyle = '#888888';
    ctx.fillText(`Member #${memberCount}`, 280, 215);

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'welcome.png' });
    const channel = await client.channels.fetch(process.env.JOINS_LEAVES_CHANNEL_ID);
    await channel.send({
      content: `Hello <@${member.id}>, welcome to **The Book Realm**!\nAll of the server channels and rules can be found in <#971504387056885861>. <a:book_pages:1506118494779998279> We suggest you first take the house quiz, which can be found in the same channel under the *House System* header. Each house competes monthly for the House Cup! Next, you can head over to <#971504539138130010> and let us know a little bit about you, and then <#971501013297135636> to choose which channels and activities you'd like to be notified about or participate in. If you have any questions, please feel free to ping a moderator or DM the ModMail bot (instructions are outlined in the welcome channel). The moderators are pink, purple, and dark blue 💜`,
      files: [attachment]
    });
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
}

// ---- GUILD MEMBER REMOVE ----
async function handleMemberRemove(member) {
  try {
    if (member.partial) await member.fetch();
    const channel = await client.channels.fetch(process.env.JOINS_LEAVES_CHANNEL_ID);
    await channel.send(`**${member.user.username}** just left the realm <a:book_pages:838547896361811979> We will miss you! :(`);
    const logChannel = await client.channels.fetch(process.env.KEEPERS_LOG_CHANNEL_ID);
    await logChannel.send(`**${member.user.username}** (ID: \`${member.user.id}\`) just left the server.`);
  } catch (error) {
    console.error('Error sending leave message:', error);
  }
}


module.exports = {
    init,
  handleMemberAdd,
  handleMemberRemove,
};