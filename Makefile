.PHONY: install dev test build run sample

install:
	uv sync --extra dev
	npm --prefix frontend install

dev:
	just dev

test:
	uv run python -m pytest

build:
	npm --prefix frontend run build

run:
	uv run python -m app

sample:
	uv run python scripts/send_sample.py --fresh
