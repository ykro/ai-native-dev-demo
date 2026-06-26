# CityLore

Sube una foto de cualquier lugar y Gemini genera una leyenda urbana ilustrada ambientada ahi.

**Flow:** Foto → Gemini Vision analiza arquitectura/era/contexto → genera narrativa en 4 paneles → genera ilustraciones estilo novela grafica.

**Demo de:** "Construi una App con IA y No Escribi (casi) Nada"

> Volver al [README principal](../README.md) · [Slides de la presentación](https://docs.google.com/presentation/d/1Xlhwl7338xxZzfv3znUzMLE3nEqJWfttCKKJ_6TTzI8/edit)

## Deploy

https://citylore-611681112050.us-central1.run.app

## Tech stack

| Capa | Tecnologia |
|------|-----------|
| Backend | Python 3.11, FastAPI, uvicorn |
| AI | Google Gemini 3.1 (`google-genai`) — Vision + Image Generation |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Deploy | Docker → Google Cloud Run |

## Setup local

```bash
# 1. Instalar dependencias del backend
cd citylore
uv sync

# 2. Configurar API key
cp .env.example .env
# Editar .env con tu GOOGLE_GENAI_API_KEY

# 3. Build del frontend (solo si modificas el frontend)
cd frontend && npm install && npm run build && cd ..

# 4. Correr
uv run uvicorn app:app --reload --port 8000
```

Abrir http://localhost:8000 y subir una foto.
