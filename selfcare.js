const constants = require('./constants');
const { monthNames, houseEmojis, COMMON_ROOM_HOUSES, commonRoomMessageIds } = constants;
const { pool, saveCommonRoomMessage, getCommonRoomMessages } = require('./db');

let client;
let getAuth;

function init(discordClient) {
  client = discordClient;
}

// ---- SELF CARE POINTS ----
async function processSelfCarePoints(targetDate) {
  try {
    console.log(`Processing self-care points for ${targetDate}...`);

    // Check if we've already processed this date
    const existing = await pool.query(
      'SELECT date FROM selfcare_points WHERE date = $1',
      [targetDate]
    );
    if (existing.rows.length > 0) {
      console.log(`Self-care points for ${targetDate} already processed, skipping.`);
      return;
    }

        // Build a map of channelId -> message for each house
    const houseMessages = {};

    for (const house of COMMON_ROOM_HOUSES) {
      try {
        const messageId = commonRoomMessageIds[house.channelId];
        if (!messageId) {
          console.log(`No stored message ID for ${house.name}, skipping.`);
          continue;
        }
        const channel = await client.channels.fetch(house.channelId);
        const message = await channel.messages.fetch(messageId);
        houseMessages[house.name] = message;
        console.log(`Successfully fetched morning message for ${house.name}.`);
      } catch (err) {
        console.error(`Failed to fetch morning message for ${house.name}:`, err);
      }
    }

    // For each house, fetch the reaction counts for every emoji
    const reactionCounts = {};

    for (const house of COMMON_ROOM_HOUSES) {
      const message = houseMessages[house.name];
      if (!message) continue;

      try {
        const counts = {};
        for (const emoji of constants.getCommonRoomEmojis()) {
          const reaction = message.reactions.cache.get(emoji);
          if (reaction) {
            const users = await reaction.users.fetch();
            // Only subtract the bot's reaction if it's still present (failsafe for failed unreaction)
            const botReacted = users.has(client.user.id);
            counts[emoji] = botReacted ? users.size - 1 : users.size;
          } else {
            counts[emoji] = 0;
          }
        }
        reactionCounts[house.name] = counts;
        console.log(`Successfully fetched reactions for ${house.name}.`);
      } catch (err) {
        console.error(`Failed to fetch reactions for ${house.name}:`, err);
      }
    }

  // Save raw counts and points to the database
    try {
      await pool.query(`
        INSERT INTO selfcare_points (
          date,
          teeth_morning_asphodel, teeth_morning_dreanni, teeth_morning_laiidon, teeth_morning_zeldarian,
          bed_asphodel, bed_dreanni, bed_laiidon, bed_zeldarian,
          hair_asphodel, hair_dreanni, hair_laiidon, hair_zeldarian,
          meds_morning_asphodel, meds_morning_dreanni, meds_morning_laiidon, meds_morning_zeldarian,
          dressed_asphodel, dressed_dreanni, dressed_laiidon, dressed_zeldarian,
          teeth_evening_asphodel, teeth_evening_dreanni, teeth_evening_laiidon, teeth_evening_zeldarian,
          meds_evening_asphodel, meds_evening_dreanni, meds_evening_laiidon, meds_evening_zeldarian,
          wash_asphodel, wash_dreanni, wash_laiidon, wash_zeldarian,
          drink_asphodel, drink_dreanni, drink_laiidon, drink_zeldarian,
          meal_asphodel, meal_dreanni, meal_laiidon, meal_zeldarian,
          read_asphodel, read_dreanni, read_laiidon, read_zeldarian,
          checkin_asphodel, checkin_dreanni, checkin_laiidon, checkin_zeldarian,
          points_asphodel, points_dreanni, points_laiidon, points_zeldarian
        ) VALUES (
          $1,
          $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16, $17,
          $18, $19, $20, $21,
          $22, $23, $24, $25,
          $26, $27, $28, $29,
          $30, $31, $32, $33,
          $34, $35, $36, $37,
          $38, $39, $40, $41,
          $42, $43, $44, $45,
          $46, $47, $48, $49,
          $50, $51, $52, $53
        )
      `, [
        targetDate,
        // Teeth morning (🪥)
        reactionCounts['Asphodel']?.['🪥'] || 0,
        reactionCounts['Dreanni']?.['🪥'] || 0,
        reactionCounts['Laiidon']?.['🪥'] || 0,
        reactionCounts['Zeldarian']?.['🪥'] || 0,
        // Bed (🛏️)
        reactionCounts['Asphodel']?.['🛏️'] || 0,
        reactionCounts['Dreanni']?.['🛏️'] || 0,
        reactionCounts['Laiidon']?.['🛏️'] || 0,
        reactionCounts['Zeldarian']?.['🛏️'] || 0,
        // Hair (👑)
        reactionCounts['Asphodel']?.['👑'] || 0,
        reactionCounts['Dreanni']?.['👑'] || 0,
        reactionCounts['Laiidon']?.['👑'] || 0,
        reactionCounts['Zeldarian']?.['👑'] || 0,
        // Meds morning (💊)
        reactionCounts['Asphodel']?.['💊'] || 0,
        reactionCounts['Dreanni']?.['💊'] || 0,
        reactionCounts['Laiidon']?.['💊'] || 0,
        reactionCounts['Zeldarian']?.['💊'] || 0,
        // Dressed (👕)
        reactionCounts['Asphodel']?.['👕'] || 0,
        reactionCounts['Dreanni']?.['👕'] || 0,
        reactionCounts['Laiidon']?.['👕'] || 0,
        reactionCounts['Zeldarian']?.['👕'] || 0,
        // Teeth evening (🦷)
        reactionCounts['Asphodel']?.['🦷'] || 0,
        reactionCounts['Dreanni']?.['🦷'] || 0,
        reactionCounts['Laiidon']?.['🦷'] || 0,
        reactionCounts['Zeldarian']?.['🦷'] || 0,
        // Meds evening (⚕️)
        reactionCounts['Asphodel']?.['⚕️'] || 0,
        reactionCounts['Dreanni']?.['⚕️'] || 0,
        reactionCounts['Laiidon']?.['⚕️'] || 0,
        reactionCounts['Zeldarian']?.['⚕️'] || 0,
        // Wash (🚿)
        reactionCounts['Asphodel']?.['🚿'] || 0,
        reactionCounts['Dreanni']?.['🚿'] || 0,
        reactionCounts['Laiidon']?.['🚿'] || 0,
        reactionCounts['Zeldarian']?.['🚿'] || 0,
        // Drink (🥛)
        reactionCounts['Asphodel']?.['🥛'] || 0,
        reactionCounts['Dreanni']?.['🥛'] || 0,
        reactionCounts['Laiidon']?.['🥛'] || 0,
        reactionCounts['Zeldarian']?.['🥛'] || 0,
        // Meal (🍕)
        reactionCounts['Asphodel']?.['🍕'] || 0,
        reactionCounts['Dreanni']?.['🍕'] || 0,
        reactionCounts['Laiidon']?.['🍕'] || 0,
        reactionCounts['Zeldarian']?.['🍕'] || 0,
        // Read (📖)
        reactionCounts['Asphodel']?.['📖'] || 0,
        reactionCounts['Dreanni']?.['📖'] || 0,
        reactionCounts['Laiidon']?.['📖'] || 0,
        reactionCounts['Zeldarian']?.['📖'] || 0,
        // Check-in (variable emoji)
        reactionCounts['Asphodel']?.[constants.CHECKIN_EMOJI] || 0,
        reactionCounts['Dreanni']?.[constants.CHECKIN_EMOJI] || 0,
        reactionCounts['Laiidon']?.[constants.CHECKIN_EMOJI] || 0,
        reactionCounts['Zeldarian']?.[constants.CHECKIN_EMOJI] || 0,
        // Total points per house
        Object.values(reactionCounts['Asphodel'] || {}).reduce((s, c) => s + c, 0) * 10,
        Object.values(reactionCounts['Dreanni'] || {}).reduce((s, c) => s + c, 0) * 10,
        Object.values(reactionCounts['Laiidon'] || {}).reduce((s, c) => s + c, 0) * 10,
        Object.values(reactionCounts['Zeldarian'] || {}).reduce((s, c) => s + c, 0) * 10,
      ]);
      console.log(`Successfully saved self-care data for ${targetDate} to database.`);
    
    // Write self-care summary to house_points for activity feed
try {
  const houses = ['Asphodel', 'Dreanni', 'Laiidon', 'Zeldarian'];
  const houseKeys = ['Asphodel', 'Dreanni', 'Laiidon', 'Zeldarian'];
  const pointsPerHouse = [
    Object.values(reactionCounts['Asphodel'] || {}).reduce((s, c) => s + c, 0) * 10,
    Object.values(reactionCounts['Dreanni'] || {}).reduce((s, c) => s + c, 0) * 10,
    Object.values(reactionCounts['Laiidon'] || {}).reduce((s, c) => s + c, 0) * 10,
    Object.values(reactionCounts['Zeldarian'] || {}).reduce((s, c) => s + c, 0) * 10,
  ];

  for (let i = 0; i < houses.length; i++) {
    if (pointsPerHouse[i] === 0) continue;
    await pool.query(
      `INSERT INTO house_points (house, category, points, added_by, note, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [houses[i], 'Self Care', pointsPerHouse[i], 'Digby', `Self-care points for ${targetDate}`]
    );
  }
  console.log(`Successfully wrote self-care summary to house_points.`);
} catch (err) {
  console.error(`Failed to write self-care summary to house_points:`, err);
}
    
    } catch (err) {
      console.error(`Failed to save self-care data to database:`, err);
    }

// Post summary to self-care spam thread
    try {
      const thread = await client.channels.fetch(process.env.SELFCARE_SPAM_THREAD_ID);

      const taskLabels = [
        { name: 'Check-In',  emojis: [constants.CHECKIN_EMOJI] },
        { name: 'Teeth',     emojis: ['🪥', '🦷'] },
        { name: 'Bed',       emojis: ['🛏️'] },
        { name: 'Hair',      emojis: ['👑'] },
        { name: 'Meds',      emojis: ['💊', '⚕️'] },
        { name: 'Outfit',    emojis: ['👕'] },
        { name: 'Wash',      emojis: ['🚿'] },
        { name: 'Water',     emojis: ['🥛'] },
        { name: 'Food',      emojis: ['🍕'] },
        { name: 'Read',      emojis: ['📖'] },
      ];

      // Format targetDate from YYYY-MM-DD to "April 29, 2026"
      const [year, month, day] = targetDate.split('-').map(Number);
      const formattedDate = `${monthNames[month - 1]} ${day}, ${year}`;

      for (const house of COMMON_ROOM_HOUSES) {
        const counts = reactionCounts[house.name];
        if (!counts) {
          await thread.send(`**${house.name} ${formattedDate} Self-Care**\nNo data available.`);
          continue;
        }

        const lines = taskLabels.map(task => {
          const taskCount = task.emojis.reduce((sum, emoji) => sum + (counts[emoji] || 0), 0);
          const taskPoints = taskCount * 10;
          return `${task.name} - ${taskPoints}`;
        });

        await thread.send(`**${houseEmojis[house.name]} ${house.name} ${formattedDate} Self-Care**\n${lines.join('\n')}`);
        console.log(`Successfully posted self-care summary for ${house.name}.`);
      }
    } catch (err) {
      console.error(`Failed to post self-care summary:`, err);
    }

  } catch (error) {
    console.error('Error processing self-care points:', error);
  }
}

module.exports = {
    init,
  processSelfCarePoints,
};