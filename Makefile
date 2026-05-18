.PHONY: up down logs migrate createsuperuser shell build clean help

help:
	@echo "Available commands:"
	@echo "  make up              - Start all containers"
	@echo "  make down            - Stop all containers"
	@echo "  make logs            - Show logs from all containers"
	@echo "  make logs-django     - Show logs from Django container"
	@echo "  make logs-celery     - Show logs from Celery containers"
	@echo "  make logs-fastapi    - Show logs from FastAPI container"
	@echo "  make logs-nextjs     - Show logs from Next.js container"
	@echo "  make migrate         - Run Django migrations"
	@echo "  make makemigrations  - Create Django migrations"
	@echo "  makesuperuser        - Create Django superuser"
	@echo "  make shell           - Open Django shell"
	@echo "  make build           - Build all containers"
	@echo "  make clean           - Remove all containers and volumes"
	@echo "  make restart         - Restart all containers"

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

logs-django:
	docker compose logs -f django daphne

logs-celery:
	docker compose logs -f celery-worker celery-beat

logs-fastapi:
	docker compose logs -f fastapi

logs-nextjs:
	docker compose logs -f nextjs

migrate:
	docker compose exec django python manage.py migrate

makemigrations:
	docker compose exec django python manage.py makemigrations

createsuperuser:
	docker compose exec django python manage.py createsuperuser

shell:
	docker compose exec django python manage.py shell

build:
	docker compose build

clean:
	docker compose down -v
	docker compose rm -f
	docker volume prune -f

restart:
	docker compose restart
