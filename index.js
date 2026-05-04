import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const GW2_API = "https://api.guildwars2.com/v2";
const GREECE_TIMEZONE = "Europe/Athens";
const MARKER = "GW2_DAILIES_TRACKER_MESSAGE";

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

function formatGreeceTime(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: GREECE_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function timeUntil(date) {
  const ms = date - new Date();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function rotationIndex(length, offset = 0) {
  const start = Math.floor(Date.UTC(2024, 0, 1) / 86400000);
  const today = Math.floor(Date.now() / 86400000);
  return ((today - start + offset) % length + length) % length;
}

async function gw2(path) {
  const res = await fetch(`${GW2_API}${path}`);

  if (!res.ok) {
    throw new Error(`GW2 API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

async function getAchievementNames(ids) {
  if (!ids || ids.length === 0) return [];

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

  for (const [sectionName, entries] of Object.entries(sections)) {
    const ids = entries.map(entry => entry.id);
    result[sectionName] = await getAchievementNames(ids);
  }

  return result;
}

function formatList(items) {
  if (!items || items.length === 0) return "No data found.";
  return items.map(item => `• ${item}`).join("\n");
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
      `Updates automatically every 15 minutes.\n` +
      `Next GW2 reset in Greece: **${formatGreeceTime(reset)}**\n` +
      `Time remaining: **${timeUntil(reset)}**\n\n` +
      `${MARKER}`
    )
    .addFields(
      {
        name: "PvE Today",
        value: formatList(today.PvE),
        inline: false
      },
      {
        name: "PvP Today",
        value: formatList(today.PvP),
        inline: false
      },
      {
        name: "WvW Today",
        value: formatList(today.WvW),
        inline: false
      },
      {
        name: "Fractals Today",
        value: formatList(today.Fractals),
        inline: false
      },
      {
        name: "PSNA",
        value: `Today: **${psnaToday}**\nTomorrow: **${psnaTomorrow}**`,
        inline: false
      },
      {
        name: "Strike Mission",
        value: `Today: **${strikeToday}**\nTomorrow: **${strikeTomorrow}**`,
        inline: false
      },
      {
        name: "Coming Tomorrow",
        value:
          `PvE:\n${formatList(tomorrow.PvE)}\n\n` +
          `PvP:\n${formatList(tomorrow.PvP)}\n\n` +
          `WvW:\n${formatList(tomorrow.WvW)}\n\n` +
          `Fractals:\n${formatList(tomorrow.Fractals)}`,
        inline: false
      }
    )
    .setFooter({
      text: "GW2 data from official API where available. PSNA/Strike use local rotation."
    })
    .setTimestamp();
}

async function main() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.once("ready", async () => {
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      const embed = await buildEmbed();

      const messages = await channel.messages.fetch({ limit: 20 });

      const existing = messages.find(message =>
        message.author.id === client.user.id &&
        message.embeds.some(embed =>
          embed.description && embed.description.includes(MARKER)
        )
      );

      if (existing) {
        await existing.edit({ embeds: [embed] });
        console.log("Updated existing GW2 daily message.");
      } else {
        await channel.send({ embeds: [embed] });
        console.log("Sent new GW2 daily message.");
      }
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      client.destroy();
    }
  });

  await client.login(TOKEN);
}

main();
