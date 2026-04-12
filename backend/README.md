# Backend (FastAPI)

Run locally with Poetry:

```
poetry install
poetry run uvicorn mampfi_api.main:app --reload --host 0.0.0.0 --port 8000
```

Environment variables: see `.env.example`.

Database migrations (placeholder):

```
poetry run alembic upgrade head
```

