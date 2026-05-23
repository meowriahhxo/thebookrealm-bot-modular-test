// constants.js — all shared values for The Book Realm Bot
// If you need to update house colors, emojis, sprint types, or channel IDs, this is the file to edit.

// ---- HOUSE CONSTANTS ----
const HOUSES = [
  { name: "House Asphodel", row: 43, col: 2, color: 0x92374e },
  { name: "House Dreanni",  row: 43, col: 3, color: 0x84c6ff },
  { name: "House Laiidon",  row: 43, col: 4, color: 0xc2ab81 },
  { name: "House Zeldarian",row: 43, col: 5, color: 0x3eba9a }
];

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const houseEmojis = {
  Asphodel: "<a:asphbow:1492903800103763988>",
  Dreanni:  "<a:dreannibow:1492903922355011777>",
  Laiidon:  "<a:laiidonbow:1492903941292298260>",
  Zeldarian:"<a:zeldbow:1492903964998369570>"
};

const houseColors = {
  Asphodel: 0x92374e,
  Dreanni:  0x84c6ff,
  Laiidon:  0xc2ab81,
  Zeldarian:0x3eba9a
};

// ---- SPRINT CONSTANTS ----

// Maps each sprint channel to its sprint type
// process.env variables are fine here — they're available at runtime
const channelSprintTypes = {
  [process.env.TALL_TOMES_CHANNEL_ID]:  'Tall Tomes Sprint',
  [process.env.SHORT_STACKS_CHANNEL_ID]:'Short Stacks Sprint',
  [process.env.READATHON_CHANNEL_ID]:   'Readathon Sprint',
  [process.env.WRITING_CHANNEL_ID]:     'Writing Sprint',
  [process.env.ART_CHANNEL_ID]:         'Art Sprint',
  [process.env.STUDY_CHANNEL_ID]:       'Study Sprint'
};

// Reading sprints use monthly emoji arrays; creative sprints use fixed arrays
const sprintEmojis = {
  reading: {
    'January':   ['❄️', '⛸️', '⛄', '🥶', '🌨️', '🐦‍🔥', '🛷', '🩵', '💙', '🐐', '🏺'],
    'February':  ['🩷', '❤️', '💌', '💋', '🥰', '🫶', '❤️‍🔥', '🌹', '🍾', '🧁', '🏳️‍🌈', '🏩', '🏺', '🐟'],
    'March':     ['🍀', '🪙', '☘️', '💚', '🐏', '🕊️', '🌤️', '🌦️', '🌱', '🐣', '☔', '🐟', '🧹'],
    'April':     ['☔', '🌂', '☁️', '🌧️', '🐏', '🌤️', '🌦️', '🎂', '🥚', '🦖', '🌱', '🍫', '🐥', '🐇', '🐂', '🧹'],
    'May':       ['💐', '🌷', '⛅', '👒', '☀️', '🐝', '🪻', '🌿', '🌼', '🌸', '🍓', '🐂', '👯', '🧹'],
    'June':      ['🏳️‍🌈', '🌈', '🏳️‍⚧️', '✨', '☀️', '🐞', '⛱️', '🎓', '🐳', '🌴', '🍹', '🚤', '🌺', '🦀', '👯'],
    'July':      ['☀️', '🌺', '⛱️', '🧺', '🍉', '💫', '🏖️', '🐬', '🏝️', '🦩', '🥵', '🔥', '🌡️', '⛺', '🛶', '🦀', '🦁'],
    'August':    ['🦁', '🥵', '🦀', '🪸', '🐬', '🎂', '🏖️', '🪼', '🌊', '🧜‍♀️', '🌿', '🫧', '🫐', '🌺', '🍑', '🌻'],
    'September': ['🌿', '⚖️', '🌻', '🍂', '🍑', '🎃', '🍃', '🍎', '🍄', '🍄‍🟫', '📚', '🌙', '🎒', '🍏'],
    'October':   ['⚖️', '🦂', '🍂', '🍁', '🎃', '🍎', '🕷️', '🕸️', '👻', '😱', '🌙', '🦇', '🖤', '🌕', '🕯️', '🐈‍⬛'],
    'November':  ['🏹', '🦂', '🍂', '🍁', '🐿️', '🧣', '🌽', '🪵', '🕯️', '🦃', '☕', '🥧', '🌙'],
    'December':  ['🐐', '🏹', '🎄', '🕯️', '❄️', '🎁', '⛄', '🌟', '🍪', '🥂', '🦌', '🎅']
  },
  'Writing Sprint': ['✍️', '📝', '🏫', '🖊️', '🏛️', '⌨️', '💻', '🖨️', '📠', '🗒️', '📃', '🖋️', '✏️'],
  'Art Sprint':     ['🎨', '🖌️', '🎭', '🧶', '🧵', '🪡', '🎞️', '📸', '🖍️', '🩰', '🎤', '🧩'],
  'Study Sprint':   ['🤓', '🧑‍🎓', '💡', '🧠', '🧑‍🏫', '🧑‍💻', '💼', '🔍', '🎓', '🎒', '🏫', '💻', '🔬', '📊', '📋', '📑']
};

// Returns the correct emoji array for a given sprint type and current month
function getSprintEmojis(sprintType) {
  const readingSprintTypes = ['Tall Tomes Sprint', 'Short Stacks Sprint', 'Readathon Sprint'];
  if (readingSprintTypes.includes(sprintType)) {
    const monthName = new Date().toLocaleString('default', { month: 'long' });
    return sprintEmojis.reading[monthName];
  }
  return sprintEmojis[sprintType];
}

// What verb to use when someone submits their time ("read", "wrote", etc.)
const sprintVerbs = {
  'Tall Tomes Sprint':  'read',
  'Short Stacks Sprint':'read',
  'Readathon Sprint':   'read',
  'Writing Sprint':     'wrote',
  'Art Sprint':         'created',
  'Study Sprint':       'studied'
};

// What the bot says at the start of a sprint
const sprintHappyVerbs = {
  'Tall Tomes Sprint':  'Happy reading!',
  'Short Stacks Sprint':'Happy reading!',
  'Readathon Sprint':   'Happy reading!',
  'Writing Sprint':     'Happy writing!',
  'Art Sprint':         'Happy creating!',
  'Study Sprint':       'Happy studying!'
};

// Sprint types with a fixed duration — users can't change these
const fixedDurations = {
  'Short Stacks Sprint': 30,
  'Tall Tomes Sprint':   60,
};

// The ping role for each sprint type
const sprintRoles = {
  'Tall Tomes Sprint':  process.env.TALL_TOMES_ROLE_ID,
  'Short Stacks Sprint':process.env.SHORT_STACKS_ROLE_ID,
  'Readathon Sprint':   process.env.READATHON_ROLE_ID,
  'Writing Sprint':     process.env.WRITING_ROLE_ID,
  'Art Sprint':         process.env.ART_ROLE_ID,
  'Study Sprint':       process.env.STUDY_ROLE_ID
};

// The spam/log thread for each sprint type
const sprintSpamThreads = {
  'Tall Tomes Sprint':  process.env.READING_SPAM_THREAD_ID,
  'Short Stacks Sprint':process.env.READING_SPAM_THREAD_ID,
  'Readathon Sprint':   process.env.READING_SPAM_THREAD_ID,
  'Writing Sprint':     process.env.WRITING_SPAM_THREAD_ID,
  'Art Sprint':         process.env.ART_SPAM_THREAD_ID,
  'Study Sprint':       process.env.STUDY_SPAM_THREAD_ID,
};

// ---- MORNING MESSAGE CONSTANTS ----
// Loaded from DB at startup via loadBotSettings() in index.js
let CHECKIN_EMOJI = '✅'; // fallback default

// The emojis the bot reacts with on morning messages, in order
const COMMON_ROOM_EMOJIS_BASE = [
  '🪥', '🛏️', '👑', '💊', '👕',
  '🦷', '⚕️', '🚿', '🥛', '🍕',
  '📖'
];

// use this function instead of the array directly so checkin emoji is always current
function getCommonRoomEmojis() {
  return [...COMMON_ROOM_EMOJIS_BASE, CHECKIN_EMOJI];
}

// One entry per house — channelId is where the morning message posts, roleId is who gets pinged
const COMMON_ROOM_HOUSES = [
  { channelId: process.env.ASPHODEL_COMMONROOM_CHANNEL_ID,  roleId: process.env.ASPHODEL_ROLE_ID,  name: 'Asphodel'  },
  { channelId: process.env.DREANNI_COMMONROOM_CHANNEL_ID,   roleId: process.env.DREANNI_ROLE_ID,   name: 'Dreanni'   },
  { channelId: process.env.LAIIDON_COMMONROOM_CHANNEL_ID,   roleId: process.env.LAIIDON_ROLE_ID,   name: 'Laiidon'   },
  { channelId: process.env.ZELDARIAN_COMMONROOM_CHANNEL_ID, roleId: process.env.ZELDARIAN_ROLE_ID, name: 'Zeldarian' },
];

// Stores morning message IDs in memory so we can fetch reactions and remove bot reactions later
// Gets populated on startup from the database and updated each morning when messages are posted
const commonRoomMessageIds = {};

// allows index.js to update settings loaded from DB at startup
function setBotSettings({ checkinEmoji }) {
  if (checkinEmoji) CHECKIN_EMOJI = checkinEmoji;
}

// ---- EXPORTS ----
// Everything listed here is available to any file that does require('./constants')
module.exports = {
  HOUSES,
  monthNames,
  houseEmojis,
  houseColors,
  channelSprintTypes,
  sprintEmojis,
  getSprintEmojis,
  sprintVerbs,
  sprintHappyVerbs,
  fixedDurations,
  sprintRoles,
  sprintSpamThreads,
  getCheckinEmoji() { return CHECKIN_EMOJI; },
  COMMON_ROOM_EMOJIS_BASE,
  getCommonRoomEmojis,
  COMMON_ROOM_HOUSES,
  commonRoomMessageIds,
  setBotSettings,
};