const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const { pool } = require('./db');
const { monthNames } = require('./constants');

registerFont('./Roboto-Bold.ttf', { family: 'Roboto', weight: 'bold' });
registerFont('./Roboto-Regular.ttf', { family: 'Roboto' });

let client;

function init(discordClient) {
  client = discordClient;
}

// ---- HOUSE COLORS ----
// Matches the blog card stamp colors exactly
const HOUSE_COLORS = {
  Asphodel:  { border: '#92374e', text: '#92374e' },
  Dreanni:   { border: '#4a7eb5', text: '#4a7eb5' },
  Laiidon:   { border: '#8a7347', text: '#8a7347' },
  Zeldarian: { border: '#1f8a6e', text: '#1f8a6e' },
};

const HOUSE_ROLE_MAP = {
  [process.env.ASPHODEL_ROLE_ID]:  'Asphodel',
  [process.env.DREANNI_ROLE_ID]:   'Dreanni',
  [process.env.LAIIDON_ROLE_ID]:   'Laiidon',
  [process.env.ZELDARIAN_ROLE_ID]: 'Zeldarian',
};

// ---- DRAW HELPERS ----

// Draws a horizontal divider line across the card
function drawDivider(ctx, y, x1, x2) {
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.strokeStyle = '#2a2418';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Draws a small uppercase label (like "READER" or "MINUTES READ")
function drawLabel(ctx, text, x, y) {
  ctx.font = '11px Roboto';
  ctx.fillStyle = '#6a5f48';
  ctx.fillText(text, x, y);
}

// Draws a large value (like the username or minute count)
function drawValue(ctx, text, x, y, maxWidth) {
  ctx.font = 'bold 22px Roboto';
  ctx.fillStyle = '#2a2418';
  // Shrink font if text is too wide
  let fontSize = 22;
  while (ctx.measureText(text).width > maxWidth && fontSize > 13) {
    fontSize--;
    ctx.font = `bold ${fontSize}px Roboto`;
  }
  ctx.fillText(text, x, y);
}

// Draws a smaller value (like the period text)
function drawValueSm(ctx, text, x, y) {
  ctx.font = '16px Roboto';
  ctx.fillStyle = '#2a2418';
  ctx.fillText(text, x, y);
}

// Draws the house stamp badge (bordered box with house name)
function drawHouseStamp(ctx, houseName, x, y) {
  const colors = HOUSE_COLORS[houseName] || { border: '#6a5f48', text: '#6a5f48' };
  ctx.font = 'bold 11px Roboto';
  const textWidth = ctx.measureText(houseName.toUpperCase()).width;
  const padX = 8;
  const padY = 4;
  const boxW = textWidth + padX * 2;
  const boxH = 20;

  // Border box
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - padX, y - boxH + padY, boxW, boxH);

  // Text
  ctx.fillStyle = colors.text;
  ctx.fillText(houseName.toUpperCase(), x, y);
}

// Draws a circular avatar from a URL
async function drawAvatar(ctx, avatarURL, cx, cy, radius) {
  try {
    const avatar = await loadImage(avatarURL);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();

    // Border circle around avatar
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
    ctx.strokeStyle = '#d8d0ba';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } catch (err) {
    // Fallback: draw initials circle if avatar fails to load
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#d8d0ba';
    ctx.fill();
    ctx.restore();
  }
}

// ---- CARD GENERATOR ----
async function generateStatsCard({ username, avatarURL, house, period, totalMinutes, sprintCount }) {
  const W = 800;
  const H = 400;
  const MARGIN = 40; // left/right padding inside the card
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ---- BACKGROUND ----
  // Dark outer background (matches the blog page dark bg)
  ctx.fillStyle = '#12102a';
  ctx.fillRect(0, 0, W, H);

  // Card itself — cream colored, inset from edges
  const cardX = 60;
  const cardY = 40;
  const cardW = W - 120;
  const cardH = H - 80;
  ctx.fillStyle = '#faf7ef';
  ctx.fillRect(cardX, cardY, cardW, cardH);

  // Card border
  ctx.strokeStyle = '#d8d0ba';
  ctx.lineWidth = 1;
  ctx.strokeRect(cardX, cardY, cardW, cardH);

  const innerLeft = cardX + MARGIN;
  const innerRight = cardX + cardW - MARGIN;
  const innerWidth = innerRight - innerLeft;

  // ---- ROW 1: Header (FROM THE LIBRARY OF / THE BOOK REALM + call number + house stamp) ----
  const row1Y = cardY;
  const row1H = 65;

  // "FROM THE LIBRARY OF / THE BOOK REALM"
  ctx.font = '11px Roboto';
  ctx.fillStyle = '#6a5f48';
  ctx.fillText('FROM THE LIBRARY OF', innerLeft, row1Y + 22);
  ctx.fillText('THE BOOK REALM', innerLeft, row1Y + 38);

  // Call number top right
  ctx.font = '10px Roboto';
  ctx.fillStyle = '#6a5f48';
  ctx.textAlign = 'right';
  ctx.fillText('READER.001', innerRight, row1Y + 22);
  ctx.textAlign = 'left';

  // House stamp — bottom right of header
  if (house && HOUSE_COLORS[house]) {
    drawHouseStamp(ctx, house, innerRight - ctx.measureText(house.toUpperCase()).width - 8, row1Y + 52);
  }

  // Divider below row 1
  drawDivider(ctx, row1Y + row1H, cardX, cardX + cardW);

  // ---- ROW 2: Avatar + Username ----
  const row2Y = row1Y + row1H;
  const row2H = 80;
  const avatarR = 28;
  const avatarCX = innerLeft + avatarR;
  const avatarCY = row2Y + row2H / 2;

  await drawAvatar(ctx, avatarURL, avatarCX, avatarCY, avatarR);

  // READER label + username to the right of avatar
  const textStartX = innerLeft + avatarR * 2 + 16;
  drawLabel(ctx, 'READER', textStartX, row2Y + 26);
  drawValue(ctx, username, textStartX, row2Y + 54, innerRight - textStartX);

  // Divider below row 2
  drawDivider(ctx, row2Y + row2H, cardX, cardX + cardW);

  // ---- ROW 3: Period ----
  const row3Y = row2Y + row2H;
  const row3H = 52;

  drawLabel(ctx, 'PERIOD', innerLeft, row3Y + 20);
  drawValueSm(ctx, period, innerLeft, row3Y + 40);

  // Divider below row 3
  drawDivider(ctx, row3Y + row3H, cardX, cardX + cardW);

  // ---- ROW 4: Split — Minutes Read | Sprints Joined ----
  const row4Y = row3Y + row3H;
  const row4H = 70;
  const splitX = cardX + cardW / 2; // vertical divider in the middle

  // Left: Minutes Read
  drawLabel(ctx, 'MINUTES READ', innerLeft, row4Y + 22);
  drawValue(ctx, totalMinutes.toLocaleString(), innerLeft, row4Y + 56, splitX - innerLeft - 10);

  // Vertical divider between the two columns
  ctx.beginPath();
  ctx.moveTo(splitX, row4Y);
  ctx.lineTo(splitX, row4Y + row4H);
  ctx.strokeStyle = '#2a2418';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Right: Sprints Joined
  const rightColX = splitX + MARGIN;
  drawLabel(ctx, 'SPRINTS JOINED', rightColX, row4Y + 22);
  drawValue(ctx, sprintCount.toLocaleString(), rightColX, row4Y + 56, innerRight - rightColX);

  // Divider below row 4
  drawDivider(ctx, row4Y + row4H, cardX, cardX + cardW);

  // ---- FOOTER ----
  const footerY = row4Y + row4H;
  ctx.font = '10px Roboto';
  ctx.fillStyle = '#c2ab81';
  ctx.textAlign = 'right';
  ctx.fillText('THE BOOK REALM — EST. 2020', innerRight, footerY + 22);
  ctx.textAlign = 'left';

  return canvas.toBuffer();
}

// ---- /mystats HANDLER ----
async function handleMystats(interaction) {
  try {
    await interaction.deferReply();

    const period = interaction.options.getString('period');
    const date = interaction.options.getString('date');
    const now = new Date();
    const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const currentMonth = monthNames[easternTime.getMonth()];
    const currentYear = easternTime.getFullYear();

    let month = date ? date.split(' ')[0] : currentMonth;
    let year;
    if (date) {
      const parts = date.split(' ');
      year = parseInt(parts.length === 1 ? parts[0] : parts[1]);
    } else {
      year = currentYear;
    }

    // ---- DB QUERY ----
    let result;
    if (period === 'monthly') {
      result = await pool.query(
        'SELECT * FROM sprint_results WHERE user_id = $1 AND EXTRACT(MONTH FROM sprint_date) = $2 AND EXTRACT(YEAR FROM sprint_date) = $3',
        [interaction.user.id, monthNames.indexOf(month) + 1, year]
      );
    } else if (period === 'yearly') {
      result = await pool.query(
        'SELECT * FROM sprint_results WHERE user_id = $1 AND EXTRACT(YEAR FROM sprint_date) = $2',
        [interaction.user.id, year]
      );
    } else {
      result = await pool.query(
        'SELECT * FROM sprint_results WHERE user_id = $1',
        [interaction.user.id]
      );
    }

    const sprintCount = result.rows.length;
    const totalMinutes = result.rows.reduce((sum, row) => sum + row.minutes, 0);

    if (sprintCount === 0) {
      await interaction.editReply({
        content: `You haven't participated in any sprints this period! Join us in <#${process.env.TALL_TOMES_CHANNEL_ID}> or <#${process.env.SHORT_STACKS_CHANNEL_ID}> to add to your stats!`,
        flags: 64
      });
      return;
    }

    // ---- PERIOD LABEL ----
    let periodLabel;
    if (period === 'monthly') periodLabel = `${month} ${year}`;
    else if (period === 'yearly') periodLabel = `${year}`;
    else periodLabel = 'Lifetime';

    // ---- HOUSE LOOKUP ----
    let house = null;
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      for (const [roleId, houseName] of Object.entries(HOUSE_ROLE_MAP)) {
        if (member.roles.cache.has(roleId)) {
          house = houseName;
          break;
        }
      }
    } catch (err) {
      console.error('[mystats] Failed to fetch member roles:', err.message);
    }

    // ---- AVATAR URL ----
    const avatarURL = interaction.user.displayAvatarURL({ extension: 'png', size: 256 });

    console.log(`[mystats] ${interaction.user.username} requested ${period} stats${date ? ` for ${date}` : ''} — ${sprintCount} sprints, ${totalMinutes} minutes, house: ${house}`);

    // ---- GENERATE CARD ----
    const cardBuffer = await generateStatsCard({
      username: interaction.user.username,
      avatarURL,
      house,
      period: periodLabel,
      totalMinutes,
      sprintCount,
    });

    const attachment = new AttachmentBuilder(cardBuffer, { name: 'mystats.png' });
    await interaction.editReply({ files: [attachment] });

  } catch (error) {
    console.error('Error handling mystats command:', error);
    try {
      await interaction.editReply({ content: 'Something went wrong generating your stats card. Please try again!' });
    } catch {
      await interaction.reply({ content: 'Something went wrong generating your stats card. Please try again!', flags: 64 });
    }
  }
}

module.exports = { init, handleMystats };