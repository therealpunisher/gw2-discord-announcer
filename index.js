import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const GREECE_TIMEZONE = "Europe/Athens";
const MARKER = "GW2_DAILY_BOARD_MARKER";

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
  "Voice of the Fallen and Claw of the Fallen",
  "Boneskinner",
  "Whisper of Jormag",
  "Cold War"
];

function greeceTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: GREECE_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function nextResetUtc() {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return reset;
}

function timeUntil(date) {
  const ms = date - new Date();

  if (ms <= 0) return "now";

  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);

  return `${h}h ${m}m`;
}

function rotationIndex(length, offset = 0) {
  const start = Math.floor(Date.UTC(2024, 0, 1) / 86400000);
  const today = Math.floor(Date.now() / 86400000);

  return ((today - start + offset) % length + length) % length;
}

async function deleteOldMessages(channel, client) {
  const messages = await channel.messages.fetch({ limit: 50 });

  const oldMessages = messages.filter(message =>
    message.author.id === client.user.id &&
    message.embeds.some(embed =>
      embed.description?.includes(MARKER) ||
      embed.footer?.text?.includes(MARKER)
    )
  );

  for (const message of oldMessages.values()) {
    await message.delete().catch(() => {});
  }
}

function buildEmbed() {
  const reset = nextResetUtc();

  const psnaToday = PSNA_ROTATION[rotationIndex(PSNA_ROTATION.length)];
  const psnaTomorrow = PSNA_ROTATION[rotationIndex(PSNA_ROTATION.length, 1)];

  const strikeToday = DAILY_STRIKES[rotationIndex(DAILY_STRIKES.length)];
  const strikeTomorrow = DAILY_STRIKES[rotationIndex(DAILY_STRIKES.length, 1)];

  return new EmbedBuilder()
    .setColor(0xf2b632)
    .setTitle("⚔️ Guild Wars 2 Daily Board")
    .setDescription(
      `🕒 **Now:** ${greeceTime()}\n` +
      `🔄 **Reset:** ${greeceTime(reset)}\n` +
      `⏳ **Time Left:** **${timeUntil(reset)}**\n\n` +
      `${MARKER}`
    )
    .addFields(
      {
        name: "🛒 **PSNA**",
        value:
          `📍 **Today:** ${psnaToday}\n` +
          `➡️ **Tomorrow:** ${psnaTomorrow}\n\n` +
          `**What is PSNA?**\n` +
          `A daily rotating **Pact Supply Network Agent** vendor. It sells useful map items and materials.`,
        inline: false
      },
      {
        name: "👹 **Daily Strike**",
        value:
          `🎯 **Today:** ${strikeToday}\n` +
          `➡️ **Tomorrow:** ${strikeTomorrow}\n\n` +
          `**What is a Strike?**\n` +
          `A **10-player boss mission** with daily rewards. Good for quick group content and loot.`,
        inline: false
      }
    )
    .setFooter({
      text: `GW2 Daily Board • ${MARKER}`
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
      const embed = buildEmbed();

      await deleteOldMessages(channel, client);
      await channel.send({ embeds: [embed] });

      console.log("Daily board posted.");
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
