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


ECONOMY_ITEMS = {
    19976: "Mystic Coin",
    19721: "Glob of Ectoplasm",
}


def test_economy_alerts():
    ids = ",".join(str(i) for i in ECONOMY_ITEMS.keys())

    url = (
        "https://api.guildwars2.com/v2/commerce/prices?ids="
        + ids
    )

    try:
        r = requests.get(url, timeout=15)
        data = r.json()

        lines = []

        for item in data:
            item_id = item["id"]
            name = ECONOMY_ITEMS.get(item_id, f"Item {item_id}")

            buy_price = item["buys"]["unit_price"] / 10000
            sell_price = item["sells"]["unit_price"] / 10000

            lines.append(
                f"**{name}**\n"
                f"Buy order: {buy_price:.2f}g\n"
                f"Sell price: {sell_price:.2f}g"
            )

        post(
            os.getenv("WEBHOOK_ECONOMY"),
            "💰 Test Economy Prices",
            "\n\n".join(lines)
        )

    except Exception as e:
        print(f"Failed to fetch economy prices: {e}")


def main():
    test_economy_alerts()


if __name__ == "__main__":
    main()
