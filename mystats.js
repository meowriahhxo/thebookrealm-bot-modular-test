const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const { pool } = require('./db');
const { monthNames } = require('./constants');

registerFont('./Roboto-Bold.ttf', { family: 'Roboto', weight: 'bold' });
registerFont('./Roboto-Regular.ttf', { family: 'Roboto' });
registerFont('./RobotoMono-Regular.ttf', { family: 'Roboto Mono' });

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
async function generateStatsCard({ username, avatarURL, house, period, totalMinutes, sprintCount, member }) {
  const W = 680;
  const H = 270;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ---- BACKGROUND ----
  ctx.fillStyle = '#12102a';
  ctx.fillRect(0, 0, W, H);

  // Card
  const cardX = 0;
  const cardY = 0;
  const cardW = W;
  const cardH = H;
  ctx.fillStyle = '#faf7ef';
  ctx.fillRect(cardX, cardY, cardW, cardH);

  // Top + bottom borders only
ctx.strokeStyle = '#d8d0ba';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(cardX, cardY);
ctx.lineTo(cardX + cardW, cardY);
ctx.stroke();

  const IL = cardX + 14; // inner left
  const IR = cardX + cardW - 14; // inner right

function label(text, x, y, size = 10) {
    ctx.font = `${size}px "Roboto Mono"`;
    ctx.fillStyle = '#6a5f48';
    ctx.fillText(text, x, y);
  }

  function value(text, x, y, maxWidth) {
    ctx.font = '18px "Roboto Mono"';
    ctx.fillStyle = '#2a2418';
    let size = 18;
    while (ctx.measureText(text).width > maxWidth && size > 11) {
      size--;
      ctx.font = `${size}px "Roboto Mono"`;
    }
    ctx.fillText(text, x, y);
  }

  function divider(y) {
    ctx.beginPath();
    ctx.moveTo(cardX, y);
    ctx.lineTo(cardX + cardW, y);
    ctx.strokeStyle = '#2a2418';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ---- ROW 1: Header ----
label('FROM THE LIBRARY OF THE BOOK REALM', IL, cardY + 26, 15);


  // Call number top right
  ctx.font = '10px "Roboto Mono"';
  ctx.fillStyle = '#6a5f48';
  ctx.textAlign = 'right';
  ctx.fillText('TBR.RDR', IR, cardY + 20);
  ctx.textAlign = 'left';

  // House stamp
  if (house && HOUSE_COLORS[house]) {
    const colors = HOUSE_COLORS[house];
    const stampText = house.toUpperCase();
    ctx.font = 'bold 9px "Roboto Mono"';
    const stampW = ctx.measureText(stampText).width + 14;
    const stampH = 16;
    const stampX = IR - stampW;
    const stampY = cardY + 28;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(stampX, stampY, stampW, stampH);
    ctx.fillStyle = colors.text;
    ctx.fillText(stampText, stampX + 7, stampY + 11);
  }

  divider(cardY + 55);

  // ---- ROW 2: Reader (avatar + username) ----
  const row2Y = cardY + 55;
  const avatarR = 24;
  const avatarCX = IL + avatarR;
  const avatarCY = row2Y + 30;
  await drawAvatar(ctx, avatarURL, avatarCX, avatarCY, avatarR);

  const textX = IL + avatarR * 2 + 14;
  label('READER', textX, row2Y + 18);
  value(username, textX, row2Y + 42, IR - textX);

  divider(row2Y + 62);

  // ---- ROW 3: Period ----
  const row3Y = row2Y + 62;
  label('PERIOD', IL, row3Y + 18);
  ctx.font = '16px "Roboto Mono"';
  ctx.fillStyle = '#2a2418';
  ctx.fillText(period, IL, row3Y + 38);

  divider(row3Y + 55);

  // ---- ROW 4: Minutes | Sprints ----
  const row4Y = row3Y + 55;
  const splitX = cardX + cardW / 2;

  label('MINUTES READ', IL, row4Y + 18);
  value(totalMinutes.toLocaleString(), IL, row4Y + 46, splitX - IL - 10);

  // Vertical divider
  ctx.beginPath();
  ctx.moveTo(splitX, row4Y);
  ctx.lineTo(splitX, row4Y + 65);
  ctx.strokeStyle = '#2a2418';
  ctx.lineWidth = 1;
  ctx.stroke();

  const rightX = splitX + 14;
  label('SPRINTS JOINED', rightX, row4Y + 18);
  value(sprintCount.toLocaleString(), rightX, row4Y + 46, IR - rightX);

  divider(row4Y + 65);

  // ---- FOOTER ----
  const footerY = row4Y + 55;
  const joinedAt = member ? member.joinedAt : null;
  const memberSince = joinedAt ? `MEMBER SINCE  ${joinedAt.toLocaleString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()}` : '';
  ctx.font = '9px "Roboto Mono"';
  ctx.fillStyle = '#c2ab81';
  ctx.textAlign = 'left';
  ctx.fillText(memberSince, IL, footerY + 20);
  ctx.textAlign = 'right';
  ctx.fillText('THE BOOK REALM — EST. 2021', IR, footerY + 20);
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
    // ---- HOUSE LOOKUP ----
    let house = null;
    let member = null;
    try {
      member = await interaction.guild.members.fetch(interaction.user.id);
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
      member,
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