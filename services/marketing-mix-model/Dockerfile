FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY pyproject.toml app.py meridian_runner.py ./
RUN pip install --no-cache-dir .[meridian]

EXPOSE 8090
CMD ["uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8090"]
