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

async function gw2(path, retries = 3) {
  try {
    const res = await fetch(`${GW2_API}${path}`);

    if (!res.ok) {
      throw new Error(`Status ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    if (retries > 0) {
      console.log(`Retrying GW2 API... (${retries})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return gw2(path, retries - 1);
    }

    console.error(`GW2 API failed for ${path}:`, err.message);
    return null;
  }
}

async function getAchievementDetails(entries) {
  if (!entries || entries.length === 0) return [];

  const ids = entries.map(entry => entry.id);
  const achievements = await gw2(`/achievements?ids=${ids.join(",")}`);

  if (!achievements) {
    return [{ name: "API unavailable" }];
  }

  return entries.map(entry => {
    const achievement = achievements.find(a => a.id === entry.id);

    return {
      id: entry.id,
      name: achievement?.name ?? `Achievement ${entry.id}`,
      level: entry.level ?? null
    };
  });
}

async function getDailies(path = "/achievements/daily") {
  const data = await gw2(path);

  if (!data) {
    return {
      PvE: [{ name: "API unavailable" }],
      PvP: [{ name: "API unavailable" }],
      WvW: [{ name: "API unavailable" }],
      Fractals: [{ name: "API unavailable" }]
    };
  }

  return {
    PvE: await getAchievementDetails(data.pve ?? []),
    PvP: await getAchievementDetails(data.pvp ?? []),
    WvW: await getAchievementDetails(data.wvw ?? []),
    Fractals: await getAchievementDetails(data.fractals ?? [])
  };
}

function formatSimpleList(items) {
  if (!items || items.length === 0) return "No data found.";
  return items.map(item => `• ${item.name}`).join("\n");
}

function fractalTier(level) {
  if (!level) return "Other";

  const max = level.max ?? level.min ?? 0;

  if (max <= 25) return "T1";
  if (max <= 50) return "T2";
  if (max <= 75) return "T3";
  if (max <= 100) return "T4";

  return "Other";
}

function formatFractals(fractals) {
  if (!fractals || fractals.length === 0) return "No fractal data found.";

  const recommended = [];
  const tiers = {
    T1: [],
    T2: [],
    T3: [],
    T4: [],
    Other: []
  };

  for (const fractal of fractals) {
    const name = fractal.name;

    if (name.toLowerCase().includes("recommended")) {
      recommended.push(name);
      continue;
    }

    const tier = fractalTier(fractal.level);
    tiers[tier].push(name);
  }

  let output = "";

  if (recommended.length > 0) {
    output += `⭐ **Recommendeds**\n${recommended.map(x => `• ${x}`).join("\n")}\n\n`;
  }

  for (const [tier, items] of Object.entries(tiers)) {
    if (items.length > 0) {
      output += `🔹 **${tier}**\n${items.map(x => `• ${x}`).join("\n")}\n\n`;
    }
  }

  return output.trim() || "No fractal data found.";
}

function shortText(text) {
  return text.length > 1024 ? text.slice(0, 1020) + "..." : text;
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
    .setColor(0xffcc00)
    .setTitle("⚔️ Guild Wars 2 Daily Tracker")
    .setDescription(
      `🕒 **Updates:** Every 15 minutes\n` +
      `🌍 **Timezone:** Greece / Europe Athens\n` +
      `🔄 **Next Reset:** **${formatGreeceTime(reset)}**\n` +
      `⏳ **Time Remaining:** **${timeUntil(reset)}**\n\n` +
      `${MARKER}`
    )
    .addFields(
      {
        name: "🌿 PvE Dailies",
        value: shortText(formatSimpleList(today.PvE)),
        inline: false
      },
      {
        name: "⚔️ PvP Dailies",
        value: shortText(formatSimpleList(today.PvP)),
        inline: false
      },
      {
        name: "🏰 WvW Dailies",
        value: shortText(formatSimpleList(today.WvW)),
        inline: false
      },
      {
        name: "🌀 Fractals + Recommendeds",
        value: shortText(formatFractals(today.Fractals)),
        inline: false
      },
      {
        name: "🛒 PSNA",
        value:
          `📍 **Today:** ${psnaToday}\n` +
          `➡️ **Tomorrow:** ${psnaTomorrow}`,
        inline: true
      },
      {
        name: "👹 Daily Strike",
        value:
          `🎯 **Today:** ${strikeToday}\n` +
          `➡️ **Tomorrow:** ${strikeTomorrow}`,
        inline: true
      },
      {
        name: "📅 Tomorrow Preview",
        value: shortText(
          `🌿 **PvE**\n${formatSimpleList(tomorrow.PvE)}\n\n` +
          `⚔️ **PvP**\n${formatSimpleList(tomorrow.PvP)}\n\n` +
          `🏰 **WvW**\n${formatSimpleList(tomorrow.WvW)}\n\n` +
          `🌀 **Fractals**\n${formatFractals(tomorrow.Fractals)}`
        ),
        inline: false
      }
    )
    .setFooter({
      text: "Guild Wars 2 Daily Tracker • Updates same Discord message"
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

  client.once("clientReady", async () => {
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
