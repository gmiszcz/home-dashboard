"""Contracts for the chart tiles and family events. schema_version 1 stays valid."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.helpers import envelope


def test_legacy_expenses_payload_is_still_accepted(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    payload = envelope(
        section="expenses_weekly",
        title="Wydatki tygodnia",
        items=[{"name": "Zakupy", "amount": 10, "currency": "PLN"}],
        extra={"total": 10, "currency": "PLN", "week": "2026-W44"},
    )
    response = client.post("/api/update", json=payload, headers=auth_header)
    assert response.status_code == 200, response.text


def test_expenses_chart_contract_is_accepted(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    payload = envelope(
        section="expenses_weekly",
        schema_version=1,
        items=[
            {
                "id": "e1",
                "name": "Chleb",
                "amount": 12.5,
                "currency": "PLN",
                "date": "2026-10-26",
                "category": "spożywcze",
            }
        ],
        extra={
            "total": 12.5,
            "currency": "PLN",
            "week": "2026-W44",
            "week_from": "2026-10-26",
            "week_to": "2026-11-01",
            "data_until": "2026-10-30",
            "by_category": [{"category": "spożywcze", "amount": 12.5}],
            "by_day": [{"date": "2026-10-26", "label": "Pn", "amount": 12.5}],
            "diff_vs_previous": 2.5,
            "previous_week": {
                "week": "2026-W43",
                "week_from": "2026-10-19",
                "week_to": "2026-10-25",
                "total": 10,
                "by_category": [{"category": "spożywcze", "amount": 10}],
                "by_day": [{"date": "2026-10-19", "label": "Pn", "amount": 10}],
                "items": [
                    {
                        "name": "Mleko",
                        "amount": 10,
                        "currency": "PLN",
                        "date": "2026-10-19",
                        "category": "spożywcze",
                    }
                ],
            },
        },
    )
    response = client.post("/api/update", json=payload, headers=auth_header)
    assert response.status_code == 200, response.text
    row = client.get("/api/latest").json()["sections"][0]
    assert row["schema_version"] == 1
    assert row["extra"]["diff_vs_previous"] == 2.5
    assert row["items"][0]["date"] == "2026-10-26"
    assert row["extra"]["previous_week"]["items"][0]["category"] == "spożywcze"


def test_expenses_reject_unknown_category_and_day_label(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    bad_category = envelope(
        section="expenses_weekly",
        items=[{"name": "X", "amount": 1, "currency": "PLN", "category": "groceries"}],
        extra={},
    )
    assert client.post("/api/update", json=bad_category, headers=auth_header).status_code == 422

    bad_day = envelope(
        section="expenses_weekly",
        items=[],
        extra={"by_day": [{"date": "2026-10-26", "label": "Mon", "amount": 1}]},
    )
    assert client.post("/api/update", json=bad_day, headers=auth_header).status_code == 422


def test_finance_budget_null_and_direction(client: TestClient, auth_header: dict[str, str]) -> None:
    payload = envelope(
        section="finance",
        items=[{"name": "Czynsz", "amount": 100, "currency": "PLN", "direction": "out"}],
        extra={
            "balance": 10,
            "incoming": 5,
            "outgoing": 100,
            "budget": None,
            "forecast_outgoing": 400,
            "by_day": [{"date": "2026-10-30", "out": 100, "in": 5}],
        },
    )
    response = client.post("/api/update", json=payload, headers=auth_header)
    assert response.status_code == 200, response.text
    stored = client.get("/api/latest").json()["sections"][0]
    assert stored["extra"]["budget"] is None
    assert stored["items"][0]["direction"] == "out"

    bad = envelope(
        section="finance",
        items=[{"name": "Czynsz", "amount": 1, "currency": "PLN", "direction": "sideways"}],
        extra={},
    )
    assert client.post("/api/update", json=bad, headers=auth_header).status_code == 422

    bad_budget = envelope(section="finance", items=[], extra={"budget": "dużo"})
    assert client.post("/api/update", json=bad_budget, headers=auth_header).status_code == 422


def test_finance_monthly_chart_contract(client: TestClient, auth_header: dict[str, str]) -> None:
    receipt = {
        "source": "kaufland_app",
        "total": 20,
        "breakdown": [
            {
                "subcategory": "nabial",
                "label": "Nabiał",
                "amount": 20,
                "lines": [{"name": "Masło", "qty": 2, "unit_price": 10, "amount": 20}],
            }
        ],
    }
    payload = envelope(
        section="finance",
        items=[
            {
                "name": "Kaufland (31.10)",
                "amount": 20,
                "currency": "PLN",
                "direction": "out",
                "category": "spożywcze",
                "date": "2026-10-31",
                "receipt": receipt,
            }
        ],
        extra={
            "currency": "PLN",
            "month": "2026-10",
            "month_from": "2026-10-01",
            "month_to": "2026-10-31",
            "data_until": "2026-10-31",
            "total": 20,
            "outgoing": 20,
            "incoming": 100,
            "diff_vs_previous": -5,
            "by_category": [{"category": "spożywcze", "amount": 20}],
            "by_day": [{"date": "2026-10-31", "out": 20, "in": 0}],
            "previous_month": {
                "month": "2026-09",
                "total": 25,
                "by_category": [{"category": "paliwo", "amount": 25}],
                "by_day": [{"date": "2026-09-10", "out": 25, "in": 0}],
                "items": [
                    {
                        "name": "Orlen",
                        "amount": 25,
                        "currency": "PLN",
                        "direction": "out",
                        "category": "paliwo",
                    }
                ],
            },
        },
    )
    response = client.post("/api/update", json=payload, headers=auth_header)
    assert response.status_code == 200, response.text

    bad = envelope(
        section="finance",
        items=[{"name": "X", "amount": 1, "currency": "PLN", "category": "groceries"}],
        extra={},
    )
    assert client.post("/api/update", json=bad, headers=auth_header).status_code == 422


def test_expenses_monthly_chart_contract(client: TestClient, auth_header: dict[str, str]) -> None:
    receipt = {
        "source": "kaufland_app",
        "total": 20,
        "breakdown": [{"subcategory": "nabial", "label": "Nabiał", "amount": 20}],
    }
    payload = envelope(
        section="expenses_monthly",
        title="Wydatki miesiąca",
        items=[
            {
                "id": "m1",
                "name": "Kaufland",
                "amount": 20,
                "currency": "PLN",
                "date": "2026-10-03",
                "category": "spożywcze",
                "period": "miesiąc",
                "direction": "out",
                "receipt": receipt,
            }
        ],
        extra={
            "total": 20,
            "currency": "PLN",
            "month": "2026-10",
            "month_from": "2026-10-01",
            "month_to": "2026-10-31",
            "data_until": None,
            "diff_vs_previous": -5,
            "by_category": [{"category": "spożywcze", "amount": 20}],
            "by_category_detailed": [
                {
                    "category": "spożywcze",
                    "amount": 20,
                    "subcategories": [
                        {"subcategory": "nabial", "label": "Nabiał", "amount": 12},
                        {"subcategory": "_bez_paragonu", "label": "Bez paragonu", "amount": 8},
                    ],
                }
            ],
            "receipts": {"count": 1, "covered_amount": 20},
            # Day bars use DD.MM labels (not Pn..Nd) and carry a separate weekday.
            "by_day": [
                {
                    "date": "2026-10-03",
                    "label": "03.10",
                    "weekday": "Pt",
                    "amount": 20,
                    "out": 20,
                    "in": 0,
                }
            ],
            "previous_month": {
                "month": "2026-09",
                "month_from": "2026-09-01",
                "month_to": "2026-09-30",
                "total": 25,
                "by_category": [{"category": "paliwo", "amount": 25}],
                "receipts": {"count": 0, "covered_amount": 0},
                "by_day": [
                    {
                        "date": "2026-09-10",
                        "label": "10.09",
                        "weekday": "Cz",
                        "amount": 25,
                        "out": 25,
                        "in": 0,
                    }
                ],
                "items": [
                    {
                        "name": "Orlen",
                        "amount": 25,
                        "currency": "PLN",
                        "date": "2026-09-10",
                        "category": "paliwo",
                        "direction": "out",
                    }
                ],
            },
        },
    )
    response = client.post("/api/update", json=payload, headers=auth_header)
    assert response.status_code == 200, response.text
    row = client.get("/api/latest").json()["sections"][0]
    assert row["extra"]["month"] == "2026-10"
    assert row["extra"]["by_day"][0]["label"] == "03.10"
    assert row["extra"]["previous_month"]["items"][0]["category"] == "paliwo"

    bad_category = envelope(
        section="expenses_monthly",
        items=[{"name": "X", "amount": 1, "currency": "PLN", "category": "groceries"}],
        extra={},
    )
    assert client.post("/api/update", json=bad_category, headers=auth_header).status_code == 422


def test_expenses_monthly_item_limit_is_higher_than_weekly(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    def many(count: int) -> dict:
        return envelope(
            section="expenses_monthly",
            items=[
                {
                    "id": f"m{i}",
                    "name": f"Zakup {i}",
                    "amount": 1,
                    "currency": "PLN",
                    "date": "2026-10-03",
                    "category": "inne",
                }
                for i in range(count)
            ],
            extra={"total": count, "currency": "PLN", "month": "2026-10"},
        )

    # A month easily exceeds the weekly cap of 100 (October had 112 transactions).
    assert client.post("/api/update", json=many(300), headers=auth_header).status_code == 200
    assert client.post("/api/update", json=many(500), headers=auth_header).status_code == 200
    # But there is still a ceiling, so a runaway payload is rejected.
    assert client.post("/api/update", json=many(501), headers=auth_header).status_code == 422


def test_subscriptions_next_30_days_and_prices_history(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    subscriptions = envelope(
        section="subscriptions",
        items=[{"name": "Muzyka", "amount": 19.99, "currency": "PLN", "next_charge": "2026-11-04"}],
        extra={
            "total": 19.99,
            "currency": "PLN",
            "period": "miesiąc",
            "next_30_days": [{"date": "2026-11-04", "name": "Muzyka", "amount": 19.99}],
        },
    )
    assert client.post("/api/update", json=subscriptions, headers=auth_header).status_code == 200

    prices = envelope(
        section="prices",
        items=[
            {
                "product": "Kawa",
                "price": 42.9,
                "currency": "PLN",
                "threshold": 45,
                "availability": "online_delivery",
            }
        ],
        extra={
            "history": {
                "Kawa": [
                    {"date": "2026-10-01", "price": 48.9, "store": "Sklep"},
                    {"date": "2026-10-30", "price": 42.9, "store": "Sklep"},
                ]
            }
        },
    )
    assert client.post("/api/update", json=prices, headers=auth_header).status_code == 200

    bad_history = envelope(section="prices", items=[], extra={"history": []})
    assert client.post("/api/update", json=bad_history, headers=auth_header).status_code == 422


def test_family_events_promotions_image_and_passthrough_sections(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    family = envelope(
        section="family_events",
        title="Maja",
        items=[
            {
                "id": "maja-1",
                "title": "Szczepienie",
                "date": "2026-11-04",
                "location": "Przychodnia",
                "note": "Książeczka",
                "priority": "high",
                "simple": True,
            }
        ],
        extra={},
    )
    response = client.post("/api/update", json=family, headers=auth_header)
    assert response.status_code == 200, response.text
    row = client.get("/api/latest").json()["sections"][0]
    assert row["title"] == "Maja"
    assert row["items"][0]["date"] == "2026-11-04"
    assert row["items"][0]["simple"] is True

    bad_date = envelope(
        section="family_events",
        items=[{"title": "Wizyta", "date": "jutro"}],
        extra={},
    )
    assert client.post("/api/update", json=bad_date, headers=auth_header).status_code == 422

    promo = envelope(
        section="promotions",
        items=[
            {
                "product": "Herbata",
                "price": 18.99,
                "currency": "PLN",
                "image": "https://sklep.example/herbata.jpg",
                "valid_to": "2026-11-02T23:59:00+01:00",
            }
        ],
        extra={},
    )
    assert client.post("/api/update", json=promo, headers=auth_header).status_code == 200

    bad_image = envelope(
        section="promotions",
        items=[{"product": "Herbata", "price": 1, "currency": "PLN", "image": 12}],
        extra={},
    )
    assert client.post("/api/update", json=bad_image, headers=auth_header).status_code == 422

    for section in ("allegro_watch", "security_alerts"):
        payload = envelope(
            section=section,
            items=[
                {"id": "x", "title": "Pozycja", "status": "open", "url": "https://example.com/x"}
            ],
            extra={},
        )
        assert client.post("/api/update", json=payload, headers=auth_header).status_code == 200
