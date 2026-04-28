import os
import json
import hashlib
import datetime
import feedparser
import requests

STATE_FILE = "state.json"


def post(webhook, title, description, url=None):
    if not webhook:
        print(f"Missing webhook for {title}")
        return

    embed = {
        "title": title,
        "description": description[:3500],
    }

    if url:
        embed["url"] = url

    try:
        r = requests.post(webhook, json={"embeds": [embed]}, timeout=15)
        print(f"{title} -> {r.status_code}")
    except Exception as e:
        print(f"Error posting {title}: {e}")


def load_state():
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"posted": [], "initialized": False}


def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def item_id(entry):
    raw = entry.get("id") or entry.get("link") or entry.get("title", "")
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


FEEDS = {
    "game_updates": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_GAME_UPDATES"),
        "keywords": [],
    },
    "patch_notes": {
        "url": "https://en-forum.guildwars2.com/categories/game-release-notes/feed.rss",
        "webhook": os.getenv("WEBHOOK_PATCH_NOTES"),
        "keywords": [],
    },
    "festivals": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_FESTIVALS"),
        "keywords": [
            "festival",
            "dragon bash",
            "wintersday",
            "mad king",
            "halloween",
            "four winds",
            "super adventure",
            "lunar new year",
        ],
    },
    "bonus_events": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_BONUS_EVENTS"),
        "keywords": [
            "bonus event",
            "bonus xp",
            "world boss rush",
            "wvw rush",
            "fractal rush",
            "rush event",
        ],
    },
    "livestreams": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_LIVESTREAMS"),
        "keywords": [
            "livestream",
            "live stream",
            "guild chat",
            "arenanet live",
            "twitch",
        ],
    },
    "gemstore": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_GEMSTORE"),
        "keywords": [
            "gem store",
            "gemstore",
            "sale",
            "discount",
            "new in the gem store",
        ],
    },
    "blacklion": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_BLACKLION"),
        "keywords": [
            "black lion",
            "black lion chest",
            "black lion key",
            "black lion trading company",
        ],
    },
}


def matches(entry, keywords):
    if not keywords:
        return True

    text = f"{entry.get('title', '')} {entry.get('summary', '')}".lower()
    return any(keyword.lower() in text for keyword in keywords)


def check_rss():
    state = load_state()

    if "posted" not in state:
        state["posted"] = []

    first_run = not state.get("initialized", False)

    for name, cfg in FEEDS.items():
        feed = feedparser.parse(cfg["url"])

        for entry in reversed(feed.entries[:10]):
            uid = f"{name}:{item_id(entry)}"

            if uid in state["posted"]:
                continue

            if not matches(entry, cfg["keywords"]):
                continue

            if first_run:
                state["posted"].append(uid)
                continue

            post(
                cfg["webhook"],
                f"📢 {entry.get('title', 'Guild Wars 2 Update')}",
                entry.get("summary", "New Guild Wars 2 announcement."),
                entry.get("link"),
            )

            state["posted"].append(uid)

    state["initialized"] = True
    state["posted"] = state["posted"][-500:]
    save_state(state)


def scheduled_messages():
    now = datetime.datetime.utcnow()
    weekday = now.weekday()

    if now.hour == 23 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_DAILY_RESET"),
            "🕒 Daily Reset Reminder",
            "Daily reset is coming soon. Finish your dailies, Wizard's Vault tasks, and daily fractals.",
        )

    if weekday == 0 and now.hour == 8 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_WEEKLY_RESET"),
            "📅 Weekly Reset",
            "Weekly raids, strikes, weekly achievements, and other weekly content have reset.",
        )

    if weekday == 4 and now.hour == 18 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_WVW_RESET"),
            "⚔️ WvW Reset Reminder",
            "WvW reset is coming soon. Get your squad ready.",
        )

    if weekday == 6 and now.hour == 18 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_GUILD_REMINDERS"),
            "🏰 Guild Reminder",
            "Guild missions / guild activities reminder. Edit this message in the script.",
        )


WORLD_BOSS_ALERTS = [
    ("Tequatl the Sunless", "23:30"),
    ("Triple Trouble", "18:30"),
]


def world_boss_messages():
    now = datetime.datetime.utcnow().replace(second=0, microsecond=0)

    for boss, boss_time_str in WORLD_BOSS_ALERTS:
        hour, minute = map(int, boss_time_str.split(":"))

        boss_time = now.replace(hour=hour, minute=minute)
        alert_time = boss_time - datetime.timedelta(minutes=30)

        if now.hour == alert_time.hour and alert_time.minute <= now.minute < alert_time.minute + 30:
            post(
                os.getenv("WEBHOOK_WORLD_BOSSES"),
                f"🐉 {boss} in 30 minutes",
                f"{boss} begins soon. Get to the map early.",
            )


def daily_achievements():
    now = datetime.datetime.utcnow()

    if now.hour != 0 or now.minute >= 30:
        return

    try:
        r = requests.get(
            "https://api.guildwars2.com/v2/achievements/daily",
            timeout=15,
        )

        data = r.json()

        pve = len(data.get("pve", []))
        pvp = len(data.get("pvp", []))
        wvw = len(data.get("wvw", []))
        fractals = len(data.get("fractals", []))

        post(
            os.getenv("WEBHOOK_DAILIES"),
            "✅ Daily Achievements Updated",
            f"PvE dailies: {pve}\nPvP dailies: {pvp}\nWvW dailies: {wvw}\nFractal dailies: {fractals}",
        )

        post(
            os.getenv("WEBHOOK_FRACTALS"),
            "🌀 Daily Fractals Updated",
            f"{fractals} daily fractal achievements are available today.",
        )

    except Exception as e:
        print(f"Failed to fetch daily achievements: {e}")


def strike_rotation_reminder():
    now = datetime.datetime.utcnow()

    if now.weekday() == 0 and now.hour == 8 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_STRIKES"),
            "⚔️ Weekly Strike Rotation",
            "Weekly strike rewards have reset. Check the current strike rotation in-game.",
        )


ECONOMY_ITEMS = {
    19976: "Mystic Coin",
    19721: "Glob of Ectoplasm",
}


def economy_alerts():
    now = datetime.datetime.utcnow()

    if now.hour != 12 or now.minute >= 30:
        return

    ids = ",".join(str(item_id) for item_id in ECONOMY_ITEMS.keys())
    url = f"https://api.guildwars2.com/v2/commerce/prices?ids={ids}"

    try:
        r = requests.get(url, timeout=15)
        prices = r.json()

        lines = []

        for item in prices:
            item_id_value = item["id"]
            name = ECONOMY_ITEMS.get(item_id_value, f"Item {item_id_value}")

            buy_price = item["buys"]["unit_price"] / 10000
            sell_price = item["sells"]["unit_price"] / 10000

            lines.append(
                f"**{name}**\n"
                f"Buy order: {buy_price:.2f}g\n"
                f"Sell price: {sell_price:.2f}g"
            )

        post(
            os.getenv("WEBHOOK_ECONOMY"),
            "💰 Daily Economy Snapshot",
            "\n\n".join(lines),
        )

    except Exception as e:
        print(f"Failed to fetch economy prices: {e}")


def main():
    check_rss()
    scheduled_messages()
    world_boss_messages()
    daily_achievements()
    strike_rotation_reminder()
    economy_alerts()


if __name__ == "__main__":
    main()
