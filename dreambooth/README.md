# DreamBooth

Describe un sueno (texto o voz) y obtene un diario visual con imagenes surrealistas generadas por Gemini.

**Flow:** Texto/Voz (Web Speech API) → extrae 3 escenas → genera interpretacion poetica → genera ilustraciones estilo "Dali meets Studio Ghibli".

**Demo de:** "Construi una App con IA y No Escribi (casi) Nada"

> Volver al [README principal](../README.md) · [Slides de la presentación](https://docs.google.com/presentation/d/1Xlhwl7338xxZzfv3znUzMLE3nEqJWfttCKKJ_6TTzI8/edit)

## Deploy

https://dreambooth-611681112050.us-central1.run.app

## Tech stack

| Capa | Tecnologia |
|------|-----------|
| Backend | Python 3.11, FastAPI, uvicorn |
| AI | Google Gemini 3.1 (`google-genai`) — Text + Image Generation |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Web Speech API |
| Deploy | Docker → Google Cloud Run |

## Setup local

```bash
# 1. Instalar dependencias del backend
cd dreambooth
uv sync

# 2. Configurar API key
cp .env.example .env
# Editar .env con tu GOOGLE_GENAI_API_KEY

# 3. Build del frontend (solo si modificas el frontend)
cd frontend && npm install && npm run build && cd ..

# 4. Correr
uv run uvicorn app:app --reload --port 8001
```

Abrir http://localhost:8001 — podes escribir el sueno o usar el microfono (Chrome/Edge).
