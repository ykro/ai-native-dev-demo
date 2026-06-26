FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir google-genai python-dotenv fastapi "uvicorn[standard]"

COPY app.py .
COPY static/ static/

ENV PORT=8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
