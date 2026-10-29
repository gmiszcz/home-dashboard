.PHONY: install test build run sample

install:
	python3 -m venv .venv
	.venv/bin/pip install -r requirements-dev.txt
	cd frontend && npm install

test:
	python3 -m pytest

build:
	cd frontend && npm run build

run:
	python3 -m app

sample:
	python3 scripts/send_sample.py --fresh
