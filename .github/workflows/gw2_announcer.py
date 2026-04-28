import os
import json
import hashlib
import datetime
import feedparser
import requests

STATE_FILE = "state.json"

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
        "keywords": ["festival", "dragon bash", "wintersday", "halloween", "four winds", "super adventure"]
    },
    "bonus_events": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_BONUS_EVENTS"),
        "keywords": ["bonus event", "world boss rush", "wvw rush", "fractal rush", "bonus xp"]
    },
    "livestreams": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_LIVESTREAMS"),
        "keywords": ["livestream", "live stream", "guild chat", "arenaNet live"]
    },
    "gemstore": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_GEMSTORE"),
        "keywords": ["gem store", "gemstore", "sale"]
    },
    "blacklion": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_BLACKLION"),
        "keywords": ["black lion", "black lion chest", "black lion key"]
    }
}

def load_state():
    try:
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"posted": []}

def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)

def post(webhook, title, description, url=None):
    if not webhook:
        return

    payload = {
        "embeds": [{
            "title": title,
            "description": description[:3500],
            "url": url,
        }]
    }

    requests.post(webhook, json=payload, timeout=15)

def item_id(entry):
    raw = entry.get("id") or entry.get("link") or entry.get("title")
    return hashlib.sha256(raw.encode()).hexdigest()

def matches(entry, keywords):
    if not keywords:
        return True

    text = f"{entry.get('title', '')} {entry.get('summary', '')}".lower()
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

            title = entry.get("title", "Guild Wars 2 Update")
            summary = entry.get("summary", "")
            link = entry.get("link")

            post(cfg["webhook"], f"📢 {title}", summary, link)
            state["posted"].append(uid)

    state["posted"] = state["posted"][-500:]
    save_state(state)

def main():
    check_rss()

if __name__ == "__main__":
    main()
