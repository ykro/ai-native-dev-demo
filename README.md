# AI-Native Dev — Charla 1

Dos aplicaciones multimodales completas, construidas con **Google Antigravity** y la **API de Gemini 3.1**, desde la idea hasta el deploy en Cloud Run.

> **Demo de la Charla 1 — "Construí una App con IA y No Escribí (casi) Nada"**
>
> ¿Qué pasa cuando un desarrollador deja de escribir código línea por línea y empieza a construir con agentes autónomos? No es vibe coding: es desarrollo **AI-native** donde vos sos el arquitecto y los agentes son tu equipo. Este repo tiene las dos apps que se construyen y demuestran en vivo.

🔗 **Slides:** https://docs.google.com/presentation/d/1Xlhwl7338xxZzfv3znUzMLE3nEqJWfttCKKJ_6TTzI8/edit

| App | Qué hace | Demo en vivo |
|-----|----------|--------------|
| 🏙️ **[CityLore](#-citylore-leyenda)** (leyenda) | Foto de un lugar → leyenda urbana ilustrada | https://citylore-611681112050.us-central1.run.app |
| 💭 **[DreamBooth](#-dreambooth-sueño)** (sueño) | Describí un sueño (texto/voz) → diario visual surrealista | https://dreambooth-611681112050.us-central1.run.app |

Cada app tiene su propio README con más detalle: [`citylore/README.md`](citylore/README.md) · [`dreambooth/README.md`](dreambooth/README.md)

---

## Tech stack (compartido)

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11, FastAPI, uvicorn |
| AI | Google Gemini 3.1 (`google-genai`) — Vision · Text · Image Generation |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Deploy | Docker → Google Cloud Run |

**Modelos usados:**
- `gemini-3.1-flash-lite-preview` — texto y visión
- `gemini-3.1-flash-image-preview` — generación de imágenes

---

## 🏙️ CityLore (leyenda)

Subí una foto de cualquier lugar y Gemini genera una **leyenda urbana ilustrada** ambientada ahí.

**Flujo:** Foto → Gemini Vision analiza arquitectura/época/contexto → genera una narrativa en 4 paneles → genera las ilustraciones estilo novela gráfica (en paralelo, con streaming SSE).

### Partes clave del código (`citylore/app.py`)

```python
client = genai.Client(api_key=os.getenv("GOOGLE_GENAI_API_KEY"))
VISION_MODEL = "gemini-3.1-flash-lite-preview"
IMAGE_MODEL  = "gemini-3.1-flash-image-preview"

# 1. Visión: analiza la foto
analyze_place(image_bytes, mime_type)      # → descripción del lugar
# 2. Texto: genera la leyenda en 4 paneles
generate_legend(place_analysis)            # → "PANEL 1: ... PANEL 4: ..."
# 3. Imagen: una ilustración por panel (en paralelo)
generate_single_panel(panel_desc, place_analysis)
```

- `POST /analyze` arranca un job en background y devuelve un `job_id`.
- `GET /stream/{job_id}` (SSE) emite cada panel a medida que se genera — la UI no espera a los 4.
- `GET /status/{job_id}` es el fallback por polling.

### Correrlo

```bash
cd citylore
uv sync
cp .env.example .env          # poné tu GOOGLE_GENAI_API_KEY
cd frontend && npm install && npm run build && cd ..
uv run uvicorn app:app --reload --port 8000
```

Abrir http://localhost:8000 y subir una foto.

---

## 💭 DreamBooth (sueño)

Describí un sueño (escribiéndolo o **por voz**) y obtené un **diario visual** con imágenes surrealistas generadas por Gemini.

**Flujo:** Texto/Voz (Web Speech API) → extrae 3 escenas → genera una interpretación poética → genera ilustraciones estilo "Dalí meets Studio Ghibli".

### Partes clave del código (`dreambooth/app.py`)

```python
client = genai.Client(api_key=os.getenv("GOOGLE_GENAI_API_KEY"))
TEXT_MODEL  = "gemini-3.1-flash-lite-preview"
IMAGE_MODEL = "gemini-3.1-flash-image-preview"

# Un solo endpoint orquesta las 3 etapas:
extract_dream_scenes(dream_text)              # → 3 escenas
generate_interpretation(dream_text, scenes)   # → interpretación poética
generate_dream_images(scenes)                 # → imágenes base64
```

- `POST /dream` recibe `{ dream_text }` y devuelve interpretación + imágenes.
- La captura de voz es 100% frontend con la **Web Speech API** (Chrome/Edge).

### Correrlo

```bash
cd dreambooth
uv sync
cp .env.example .env          # poné tu GOOGLE_GENAI_API_KEY
cd frontend && npm install && npm run build && cd ..
uv run uvicorn app:app --reload --port 8001
```

Abrir http://localhost:8001 — escribí el sueño o usá el micrófono.

---

## Requisitos

- Python 3.11+ y [`uv`](https://github.com/astral-sh/uv)
- Node 18+ (solo si modificás el frontend)
- Una API key de Google Gemini ([AI Studio](https://aistudio.google.com/apikey))

> **Nota:** las API keys nunca se commitean. En cada app, copiá `.env.example` a `.env` con tu propia key.
