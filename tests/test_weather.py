from fastapi.testclient import TestClient


def test_weather_endpoint(client: TestClient) -> None:
    response = client.get("/api/weather")
    assert response.status_code == 200
    data = response.json()
    assert data["city"] == "Gliwice"
    assert "current" in data
    assert "temp" in data["current"]
    assert "hourly" in data
    assert isinstance(data["hourly"], list)
