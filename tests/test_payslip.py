"""Payslip section contract and the display.hidden hint."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from tests.helpers import envelope

ROOT = Path(__file__).resolve().parents[1]


def _line(code: str, label: str, group: str, amount: float) -> dict[str, object]:
    return {"code": code, "label": label, "group": group, "amount": amount}


def _payslip(**overrides: Any) -> dict[str, Any]:
    extra: dict[str, Any] = {
        "currency": "PLN",
        "month": "2026-10",
        "employer": "Tenneco Automotive E. E.",
        "gross": 17888.13,
        "net": 8606.34,
        "deductions_total": 9340.29,
        "deductions": [
            _line("pit", "PIT", "pit", 4638.0),
            _line("emerytalna", "Emerytalna", "zus", 1747.83),
        ],
        "components": [
            _line("net", "Na konto", "net", 8606.34),
            _line("pit", "PIT", "pit", 4638.0),
            _line("premia", "Premia", "addition", 2981.36),
        ],
        "previous_month": {
            "month": "2026-09",
            "gross": 17000,
            "net": 8200,
            "deductions": [_line("pit", "PIT", "pit", 4400)],
            "components": [_line("net", "Na konto", "net", 8200)],
            "items": [
                {
                    "name": "PIT",
                    "amount": 4400,
                    "currency": "PLN",
                    "kind": "deduction",
                    "group": "pit",
                }
            ],
        },
        "history": [
            {"month": "2026-09", "gross": 17000, "net": 8200},
            {"month": "2026-10", "gross": 17888.13, "net": 8606.34},
        ],
        "diff_vs_previous": {"gross": 888.13, "net": 406.34, "pit": 238},
    }
    extra_override = overrides.pop("extra", None)
    if isinstance(extra_override, dict):
        extra.update(extra_override)
    payload = envelope(
        section="payslip",
        schema_version=2,
        title="Pasek płacowy",
        summary="Październik 2026",
        items=[
            {
                "id": "base",
                "name": "Płaca zasadnicza",
                "amount": 14906.77,
                "currency": "PLN",
                "kind": "earning",
                "group": "earning",
            }
        ],
        extra=extra,
        display={"hidden": True, "simple": False},
    )
    payload.update(overrides)
    return payload


def test_payslip_contract_is_stored(client: TestClient, auth_header: dict[str, str]) -> None:
    response = client.post("/api/update", json=_payslip(), headers=auth_header)
    assert response.status_code == 200, response.text
    row = client.get("/api/latest").json()["sections"][0]
    assert row["section"] == "payslip"
    assert row["display"]["hidden"] is True
    assert row["extra"]["gross"] == 17888.13
    assert row["extra"]["net"] == 8606.34
    assert row["extra"]["diff_vs_previous"]["pit"] == 238
    assert row["extra"]["previous_month"]["month"] == "2026-09"
    assert row["extra"]["history"][1]["net"] == 8606.34
    assert row["items"][0]["kind"] == "earning"


def test_payslip_accepts_null_comparison(client: TestClient, auth_header: dict[str, str]) -> None:
    payload = _payslip(extra={"previous_month": None, "diff_vs_previous": None, "history": []})
    # _payslip merges extra, so the nulls override. An empty history is a list, which is valid.
    response = client.post("/api/update", json=payload, headers=auth_header)
    assert response.status_code == 200, response.text
    stored = client.get("/api/latest").json()["sections"][0]["extra"]
    assert stored["previous_month"] is None
    assert stored["diff_vs_previous"] is None


def test_payslip_rejects_bad_fields(client: TestClient, auth_header: dict[str, str]) -> None:
    bad_month = _payslip(extra={"month": "2026-13"})
    assert client.post("/api/update", json=bad_month, headers=auth_header).status_code == 422

    bad_group = _payslip(
        items=[{"name": "X", "amount": 1, "currency": "PLN", "kind": "deduction", "group": "tax"}]
    )
    assert client.post("/api/update", json=bad_group, headers=auth_header).status_code == 422

    bad_gross = _payslip(extra={"gross": "17 888,13"})
    assert client.post("/api/update", json=bad_gross, headers=auth_header).status_code == 422

    bad_line = _payslip(extra={"deductions": [{"label": "PIT", "amount": "dużo"}]})
    assert client.post("/api/update", json=bad_line, headers=auth_header).status_code == 422

    bad_history = _payslip(extra={"history": [{"gross": 1}]})
    assert client.post("/api/update", json=bad_history, headers=auth_header).status_code == 422

    bad_diff = _payslip(extra={"diff_vs_previous": {"net": "więcej"}})
    assert client.post("/api/update", json=bad_diff, headers=auth_header).status_code == 422

    nested = _payslip(
        extra={"previous_month": {"month": "2026-09", "previous_month": {"month": "2026-08"}}}
    )
    assert client.post("/api/update", json=nested, headers=auth_header).status_code == 422


def test_payslip_accepts_numeric_diff(client: TestClient, auth_header: dict[str, str]) -> None:
    payload = _payslip(extra={"diff_vs_previous": 406.34, "previous_month": None})
    response = client.post("/api/update", json=payload, headers=auth_header)
    assert response.status_code == 200, response.text
    assert client.get("/api/latest").json()["sections"][0]["extra"]["diff_vs_previous"] == 406.34


def test_display_hidden_must_be_boolean(client: TestClient, auth_header: dict[str, str]) -> None:
    hidden = envelope(section="calendar", items=[], display={"hidden": True, "collapsed": False})
    assert client.post("/api/update", json=hidden, headers=auth_header).status_code == 200

    text = envelope(section="calendar", items=[], display={"hidden": "yes"})
    assert client.post("/api/update", json=text, headers=auth_header).status_code == 422

    number = envelope(section="calendar", items=[], display={"hidden": 1})
    assert client.post("/api/update", json=number, headers=auth_header).status_code == 422

    missing = envelope(section="parcels")
    assert client.post("/api/update", json=missing, headers=auth_header).status_code == 200


def test_october_sample_is_hidden_and_matches_the_slip() -> None:
    payload = json.loads((ROOT / "samples" / "payslip.json").read_text(encoding="utf-8"))
    assert payload["display"]["hidden"] is True
    assert payload["extra"]["month"] == "2026-10"
    assert payload["extra"]["gross"] == 17888.13
    assert payload["extra"]["net"] == 8606.34
    assert payload["extra"]["deductions_total"] == 9340.29
    assert payload["extra"]["previous_month"] is None
    deductions = round(sum(row["amount"] for row in payload["extra"]["deductions"]), 2)
    assert deductions == 9340.29
    allocation = [
        row
        for row in payload["extra"]["components"]
        if row["group"] not in {"addition", "earning", "info"}
    ]
    assert round(sum(row["amount"] for row in allocation), 2) == round(
        payload["extra"]["gross"] + 58.5, 2
    )
