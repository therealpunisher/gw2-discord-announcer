import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const MARKER = "GW2_DAILIES_TRACKER_MESSAGE";
const GW2_API = "https://api.guildwars2.com/v2";

if (!TOKEN || !CHANNEL_ID) {
  throw new Error("Missing DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID");
}

const PSNA_ROTATION = [
  "Plains of Ashford",
  "Wayfarer Foothills",
  "Queensdale",
  "Metrica Province",
  "Caledon Forest",
  "Lion's Arch"
];

const DAILY_STRIKES = [
  "Shiverpeaks Pass",
  "Fraenir of Jormag",
  "Voice & Claw",
  "Boneskinner",
  "Whisper of Jormag"
];

function nextResetUtc() {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return reset;
}

function timeUntil(date) {
  const ms = date - new Date();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function rotationIndex(length, offset = 0) {
  const start = Date.UTC(2024, 0, 1) / 86400000;
  const today = Math.floor(Date.now() / 86400000);
  return (today - start + offset) % length;
}

async function gw2(path) {
  const res = await fetch(`${GW2_API}${path}`);
  if (!res.ok) throw new Error(`GW2 API error: ${res.status}`);
  return res.json();
}

async function getAchievementNames(ids) {
  if (!ids.length) return [];
  const data = await gw2(`/achievements?ids=${ids.join(",")}`);
  return data.map(a => a.name);
}

async function getDailies(path = "/achievements/daily") {
  const data = await gw2(path);

  const sections = {
    PvE: data.pve ?? [],
    PvP: data.pvp ?? [],
    WvW: data.wvw ?? [],
    Fractals: data.fractals ?? []
  };

  const result = {};

  for (const [name, entries] of Object.entries(sections)) {
    const ids = entries.map(e => e.id);
    result[name] = await getAchievementNames(ids);
  }

  return result;
}

function formatList(items) {
  if (!items || items.length === 0) return "No data found.";
  return items.map(x => `• ${x}`).join("\n");
}

async function buildEmbed() {
  const today = await getDailies("/achievements/daily");
  const tomorrow = await getDailies("/achievements/daily/tomorrow");

  const reset = nextResetUtc();

  const psnaToday = PSNA_ROTATION[rotationIndex(PSNA_ROTATION.length)];
  const psnaTomorrow = PSNA_ROTATION[rotationIndex(PSNA_ROTATION.length, 1)];

  const strikeToday = DAILY_STRIKES[rotationIndex(DAILY_STRIKES.length)];
  const strikeTomorrow = DAILY_STRIKES[rotationIndex(DAILY_STRIKES.length, 1)];

  return new EmbedBuilder()
    .setTitle("Guild Wars 2 Daily Tracker")
    .setDescription(
      `Updates automatically.\nNext daily reset: **${reset.toUTCString()}**\nTime remaining: **${timeUntil(reset)}**\n\n${MARKER}`
    )
    .addFields(
      { name: "PvE Today", value: formatList(today.PvE), inline: false },
      { name: "PvP Today", value: formatList(today.PvP), inline: false },
      { name: "WvW Today", value: formatList(today.WvW), inline: false },
      { name: "Fractals Today", value: formatList(today.Fractals), inline: false },
      { name: "PSNA", value: `Today: **${psnaToday}**\nTomorrow: **${psnaTomorrow}**`, inline: false },
      { name: "Strike Mission", value: `Today: **${strikeToday}**\nTomorrow: **${strikeTomorrow}**`, inline: false },
      { name: "Coming Tomorrow", value: `PvE:\n${formatList(tomorrow.PvE)}\n\nPvP:\n${formatList(tomorrow.PvP)}\n\nWvW:\n${formatList(tomorrow.WvW)}\n\nFractals:\n${formatList(tomorrow.Fractals)}`, inline: false }
    )
    .setFooter({ text: "Data from Guild Wars 2 API where available. PSNA/Strike rotation is local rotation logic." })
    .setTimestamp();
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", async () => {
  const channel = await client.channels.fetch(CHANNEL_ID);
  const embed = await buildEmbed();

  const messages = await channel.messages.fetch({ limit: 20 });
  const existing = messages.find(
    msg =>
      msg.author.id === client.user.id &&
      msg.embeds.some(e => e.description?.includes(MARKER))
  );

  if (existing) {
    await existing.edit({ embeds: [embed] });
    console.log("Updated existing GW2 daily message.");
  } else {
    await channel.send({ embeds: [embed] });
    console.log("Sent new GW2 daily message.");
  }

  client.destroy();
});

client.login(TOKEN);
