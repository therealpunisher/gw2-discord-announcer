import os
import json
import hashlib
import datetime
import feedparser
import requests

STATE_FILE = "state.json"


def post(webhook, title, description, url=None):
    if not webhook:
        return

    embed = {
        "title": title,
        "description": description[:3500],
    }

    if url:
        embed["url"] = url

    payload = {"embeds": [embed]}

    try:
        requests.post(webhook, json=payload, timeout=15)
    except Exception as e:
        print(f"Failed to post webhook: {e}")


def load_state():
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"posted": []}


def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def item_id(entry):
    raw = entry.get("id") or entry.get("link") or entry.get("title")
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


FEEDS = {
    "game_updates": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_GAME_UPDATES"),
        "keywords": []
    },

    "patch_notes": {
        "url": "https://en-forum.guildwars2.com/categories/game-release-notes/feed.rss",
        "webhook": os.getenv("WEBHOOK_PATCH_NOTES"),
        "keywords": []
    },

    "festivals": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_FESTIVALS"),
        "keywords": [
            "festival",
            "dragon bash",
            "wintersday",
            "mad king",
            "four winds",
            "super adventure"
        ]
    },

    "bonus_events": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_BONUS_EVENTS"),
        "keywords": [
            "bonus event",
            "world boss rush",
            "wvw rush",
            "fractal rush"
        ]
    },

    "livestreams": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_LIVESTREAMS"),
        "keywords": [
            "livestream",
            "guild chat",
            "arenanet live"
        ]
    },

    "gemstore": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_GEMSTORE"),
        "keywords": [
            "gem store",
            "sale",
            "discount"
        ]
    },

    "blacklion": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_BLACKLION"),
        "keywords": [
            "black lion",
            "black lion chest"
        ]
    }
}


def matches(entry, keywords):
    if not keywords:
        return True

    text = f"{entry.get('title','')} {entry.get('summary','')}".lower()
    return any(k.lower() in text for k in keywords)


def check_rss():
    state = load_state()

    for name, cfg in FEEDS.items():

        feed = feedparser.parse(cfg["url"])

        for entry in reversed(feed.entries[:10]):

            uid = f"{name}:{item_id(entry)}"

            if uid in state["posted"]:
                continue

            if not matches(entry, cfg["keywords"]):
                continue

            post(
                cfg["webhook"],
                f"📢 {entry.get('title','Guild Wars 2 Update')}",
                entry.get("summary","New update."),
                entry.get("link")
            )

            state["posted"].append(uid)

    state["posted"] = state["posted"][-500:]
    save_state(state)


def scheduled_messages():
    now = datetime.datetime.utcnow()
    weekday = now.weekday()

    if now.hour == 23 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_DAILY_RESET"),
            "🕒 Daily Reset Reminder",
            "Daily reset is coming soon."
        )

    if weekday == 0 and now.hour == 8 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_WEEKLY_RESET"),
            "📅 Weekly Reset",
            "Weekly content has reset."
        )

    if weekday == 4 and now.hour == 18 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_WVW_RESET"),
            "⚔️ WvW Reset Reminder",
            "WvW reset in 1 hour."
        )

    if weekday == 6 and now.hour == 18 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_GUILD_REMINDERS"),
            "🏰 Guild Reminder",
            "Guild missions reminder."
        )


WORLD_BOSS_ALERTS = [
    ("Tequatl the Sunless", "23:30"),
    ("Triple Trouble", "18:30"),
]


def world_boss_messages():

    now = datetime.datetime.utcnow().replace(
        second=0,
        microsecond=0
    )

    for boss, boss_time_str in WORLD_BOSS_ALERTS:

        hour, minute = map(
            int,
            boss_time_str.split(":")
        )

        boss_time = now.replace(
            hour=hour,
            minute=minute
        )

        alert_time = boss_time - datetime.timedelta(
            minutes=30
        )

        if (
            now.hour == alert_time.hour
            and now.minute < 30
            and now.minute >= alert_time.minute
        ):

            post(
                os.getenv("WEBHOOK_WORLD_BOSSES"),
                f"🐉 {boss} in 30 minutes",
                f"{boss} begins soon."
            )


def daily_achievements():

    now = datetime.datetime.utcnow()

    if now.hour != 0 or now.minute >= 30:
        return

    try:

        r = requests.get(
            "https://api.guildwars2.com/v2/achievements/daily",
            timeout=15
        )

        data = r.json()

        pve = len(data.get("pve",[]))
        pvp = len(data.get("pvp",[]))
        wvw = len(data.get("wvw",[]))
        fractals = len(data.get("fractals",[]))

        post(
            os.getenv("WEBHOOK_DAILIES"),
            "✅ Daily Achievements Updated",
            f"PvE: {pve}\nPvP: {pvp}\nWvW: {wvw}"
        )

        post(
            os.getenv("WEBHOOK_FRACTALS"),
            "🌀 Daily Fractals Updated",
            f"{fractals} fractal dailies available."
        )

    except Exception as e:
        print(e)


def strike_rotation_reminder():

    now = datetime.datetime.utcnow()

    if (
        now.weekday() == 0
        and now.hour == 8
        and now.minute < 30
    ):

        post(
            os.getenv("WEBHOOK_STRIKES"),
            "⚔️ Weekly Strike Rotation",
            "Weekly strike rewards have reset."
        )


ECONOMY_ITEMS = {
    19976: "Mystic Coin",
    19721: "Glob of Ectoplasm",
}


def economy_alerts():

    now = datetime.datetime.utcnow()

    if now.hour != 12 or now.minute >= 30:
        return

    ids = ",".join(
        str(i)
        for i in ECONOMY_ITEMS.keys()
    )

    url = (
        "https://api.guildwars2.com/v2/commerce/prices?ids="
        + ids
    )

    try:

        r = requests.get(
            url,
            timeout=15
        )

        prices = r.json()

        lines = []

        for item in prices:

            name = ECONOMY_ITEMS[item["id"]]

            buy_price = (
                item["buys"]["unit_price"] / 10000
            )

            sell_price = (
                item["sells"]["unit_price"] / 10000
            )

            lines.append(
                f"{name}\n"
                f"Buy {buy_price:.2f}g\n"
                f"Sell {sell_price:.2f}g"
            )

        post(
            os.getenv("WEBHOOK_ECONOMY"),
            "💰 Daily Economy Snapshot",
            "\n\n".join(lines)
        )

    except Exception as e:
        print(e)


def main():
    check_rss()
    scheduled_messages()
    world_boss_messages()
    daily_achievements()
    strike_rotation_reminder()
    economy_alerts()


if __name__ == "__main__":
    main()
