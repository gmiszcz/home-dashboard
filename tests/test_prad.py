"""Electricity tile contract. `data.invoices` is optional and ignored by other sections."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from tests.helpers import envelope

ROOT = Path(__file__).resolve().parents[1]


def _invoice(**overrides: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "number": "E/GM2/GN088194/0001/26",
        "kind": "invoice",
        "issued": "2026-01-28",
        "period_from": "2025-11-27",
        "period_to": "2026-01-28",
        "kwh": 401.0,
        "sales": 286.13,
        "distribution": 197.98,
        "total": 484.11,
        "due": "2026-02-13",
        "average_per_kwh": 1.21,
        "status": "paid",
        "source_file": "E_GM2_GN088194_0001_26.pdf",
    }
    row.update(overrides)
    return row


def _payload(**overrides: Any) -> dict[str, Any]:
    payload = envelope(
        section="prad",
        title="Prąd – Tauron",
        summary="Faktury Tauron",
        items=[{"id": "e1", "title": "E/1 · 401 kWh"}],
        extra={},
    )
    payload.update(overrides)
    return payload


def test_prad_invoices_round_trip(client: TestClient, auth_header: dict[str, str]) -> None:
    correction = {
        "number": "E/GM2/GN088194/0003/26",
        "kind": "correction",
        "issued": "2026-05-11",
        "period_from": "2023-01-27",
        "period_to": "2023-03-29",
        "kwh": None,
        "sales": None,
        "distribution": None,
        "total": -125.34,
        "due": None,
        "average_per_kwh": None,
        "status": "settled",
        "note": "per saldo 0 zł",
    }
    payload = _payload(data={"currency": "PLN", "invoices": [_invoice(), correction]})
    response = client.post("/api/update", json=payload, headers=auth_header)
    assert response.status_code == 200, response.text
    stored = client.get("/api/latest").json()["sections"][0]
    assert stored["section"] == "prad"
    assert stored["data"]["invoices"][0]["kwh"] == 401.0
    assert stored["data"]["invoices"][1]["total"] == -125.34
    assert stored["data"]["invoices"][1]["kwh"] is None
    assert stored["items"][0]["title"] == "E/1 · 401 kWh"


def test_prad_without_data_stays_a_generic_list(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    payload = _payload()
    assert "data" not in payload
    response = client.post("/api/update", json=payload, headers=auth_header)
    assert response.status_code == 200, response.text
    stored = client.get("/api/latest").json()["sections"][0]
    assert stored["section"] == "prad"
    assert "data" not in stored
    assert stored["items"][0]["title"] == "E/1 · 401 kWh"


def test_prad_rejects_a_bad_invoice(client: TestClient, auth_header: dict[str, str]) -> None:
    cases: list[dict[str, Any]] = [
        {"data": []},
        {"data": {"invoices": "brak"}},
        {"data": {"invoices": [_invoice(number="")]}},
        {"data": {"invoices": [_invoice(kind=None)]}},
        {"data": {"invoices": [_invoice(kwh="dużo")]}},
        {"data": {"invoices": [_invoice(issued="2026-13-01")]}},
        {"data": {"invoices": [_invoice(period_from="2026-02-01", period_to="2026-01-01")]}},
        {"data": {"invoices": [_invoice(status="Paid")]}},
    ]
    for overrides in cases:
        response = client.post("/api/update", json=_payload(**overrides), headers=auth_header)
        assert response.status_code == 422, overrides


def test_other_sections_keep_working_with_or_without_data(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    parcels = envelope(section="parcels")
    assert "data" not in parcels
    assert client.post("/api/update", json=parcels, headers=auth_header).status_code == 200
    stored = client.get("/api/latest").json()["sections"][0]
    assert stored["section"] == "parcels"
    assert "data" not in stored

    finance = envelope(
        section="finance",
        items=[{"name": "Czynsz", "amount": 10, "currency": "PLN", "direction": "out"}],
        extra={"outgoing": 10},
        data={"note": "not an electricity invoice"},
    )
    response = client.post("/api/update", json=finance, headers=auth_header)
    assert response.status_code == 200, response.text
    row = next(
        item
        for item in client.get("/api/latest").json()["sections"]
        if item["section"] == "finance"
    )
    assert row["data"]["note"] == "not an electricity invoice"
    assert row["extra"]["outgoing"] == 10


def test_prad_sample_matches_the_documented_shape() -> None:
    payload = json.loads((ROOT / "samples" / "prad.json").read_text(encoding="utf-8"))
    invoices = payload["data"]["invoices"]
    assert payload["section"] == "prad"
    assert payload["title"] == "Prąd – Tauron"
    kinds = {row["kind"] for row in invoices}
    assert {"invoice", "correction", "note"} <= kinds
    usage = [row for row in invoices if row["kind"] == "invoice"]
    assert all(
        row["kwh"] and row["sales"] is not None and row["distribution"] is not None for row in usage
    )
    excluded = [row for row in invoices if row["kind"] != "invoice"]
    assert sum(row["total"] for row in excluded) == 0
