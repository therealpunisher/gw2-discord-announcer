import os
import requests


def post(webhook, title, description, url=None):
    if not webhook:
        print(f"Missing webhook for {title}")
        return

    embed = {
        "title": title,
        "description": description[:3500]
    }

    if url:
        embed["url"] = url

    payload = {
        "embeds": [embed]
    }

    try:
        r = requests.post(
            webhook,
            json=payload,
            timeout=15
        )

        print(f"{title} -> {r.status_code}")

    except Exception as e:
        print(f"Error posting {title}: {e}")


def test_dailies_and_fractals():
    try:
        r = requests.get(
            "https://api.guildwars2.com/v2/achievements/daily",
            timeout=15
        )

        data = r.json()

        pve = len(data.get("pve", []))
        pvp = len(data.get("pvp", []))
        wvw = len(data.get("wvw", []))
        fractals = len(data.get("fractals", []))

        post(
            os.getenv("WEBHOOK_DAILIES"),
            "✅ Test Daily Achievements",
            f"GW2 API is working.\n\nPvE dailies: {pve}\nPvP dailies: {pvp}\nWvW dailies: {wvw}\nFractal dailies: {fractals}"
        )

        post(
            os.getenv("WEBHOOK_FRACTALS"),
            "🌀 Test Daily Fractals",
            f"GW2 API is working.\n\nFractal daily achievements available: {fractals}"
        )

    except Exception as e:
        print(f"Failed to fetch GW2 daily achievements: {e}")


def main():
    test_dailies_and_fractals()


if __name__ == "__main__":
    main()
