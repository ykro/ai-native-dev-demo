"""CityLore — Photo of any place -> Gemini generates an illustrated urban legend.

Demo: "Construi una App con IA y No Escribi (casi) Nada"
Flow: Photo -> Gemini Vision analyzes architecture/era/context -> generates narrative -> generates illustrated panels
"""

import asyncio
import base64
import json
import os
import time
import traceback
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import StreamingResponse

load_dotenv()

from google import genai
from google.genai import types

# Initialize client
client = genai.Client(api_key=os.getenv("GOOGLE_GENAI_API_KEY"))
VISION_MODEL = "gemini-3.1-flash-lite-preview"
IMAGE_MODEL = "gemini-3.1-flash-image-preview"

app = FastAPI(title="CityLore")

# Serve static files (Vite build output)
dist_dir = Path(__file__).parent / "static" / "dist"
dist_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static/dist", StaticFiles(directory=str(dist_dir)), name="static")

# In-memory job storage
jobs: dict[str, dict] = {}

JOB_TTL_SECONDS = 600  # 10 minutes


def cleanup_old_jobs():
    """Remove jobs older than 10 minutes."""
    now = time.time()
    expired = [jid for jid, job in jobs.items() if now - job["created_at"] > JOB_TTL_SECONDS]
    for jid in expired:
        del jobs[jid]


@app.get("/")
async def index():
    return FileResponse(str(dist_dir / "index.html"))


def analyze_place(image_bytes: bytes, mime_type: str) -> str:
    """Step 1: Use Gemini Vision to analyze the place in the photo."""
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

    response = client.models.generate_content(
        model=VISION_MODEL,
        contents=[
            types.Content(
                role="user",
                parts=[
                    image_part,
                    types.Part.from_text(text=
                        "Analyze this place in detail. Describe:\n"
                        "1. The architectural style and approximate era\n"
                        "2. The type of building or location (church, market, alley, park, etc.)\n"
                        "3. The atmosphere and mood it conveys\n"
                        "4. Any notable details (signs, textures, wear, vegetation)\n"
                        "5. What city or region this might be in\n\n"
                        "Be specific and evocative — this description will be used to create a fictional urban legend set in this place."
                    ),
                ],
            )
        ],
    )
    return response.text


def generate_legend(place_analysis: str) -> str:
    """Step 2: Generate an urban legend narrative based on the place analysis."""
    response = client.models.generate_content(
        model=VISION_MODEL,
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=
                        f"Based on this description of a real place:\n\n{place_analysis}\n\n"
                        "Create a compelling urban legend set in this exact location. The legend should:\n"
                        "1. Feel rooted in the specific architecture and atmosphere described\n"
                        "2. Have a mysterious or supernatural element\n"
                        "3. Include a protagonist who discovers something unexpected\n"
                        "4. Be structured in exactly 4 scenes (for 4 graphic novel panels)\n"
                        "5. Each scene should be 2-3 sentences max\n"
                        "6. End with an eerie but satisfying conclusion\n\n"
                        "Format your response as:\n"
                        "TITLE: [Legend title]\n\n"
                        "PANEL 1: [Scene description]\n"
                        "PANEL 2: [Scene description]\n"
                        "PANEL 3: [Scene description]\n"
                        "PANEL 4: [Scene description]\n\n"
                        "Write in Spanish."
                    ),
                ],
            )
        ],
    )
    return response.text


def generate_single_panel(panel_desc: str, place_analysis: str) -> str:
    """Generate a single graphic novel panel and return as a base64 data URI."""
    prompt = (
        f"Create a graphic novel panel illustration in a dark, atmospheric style. "
        f"Setting: {place_analysis[:200]}. "
        f"Scene: {panel_desc}. "
        f"Style: High contrast, dramatic shadows, muted colors with one accent color, "
        f"ink-wash technique, cinematic composition. No text or speech bubbles."
    )

    response = client.models.generate_content(
        model=IMAGE_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        ),
    )

    for part in response.candidates[0].content.parts:
        if part.inline_data:
            b64 = base64.b64encode(part.inline_data.data).decode()
            mime = part.inline_data.mime_type or "image/png"
            return f"data:{mime};base64,{b64}"

    return ""


def parse_panel_descriptions(legend: str) -> list[str]:
    """Extract panel descriptions from the legend text."""
    panels_desc = []
    for line in legend.split("\n"):
        line = line.strip()
        if line.startswith("PANEL"):
            desc = line.split(":", 1)[1].strip() if ":" in line else line
            panels_desc.append(desc)

    if not panels_desc:
        panels_desc = [legend]

    return panels_desc


async def process_job(job_id: str, image_bytes: bytes, mime_type: str):
    """Background task that runs the full CityLore pipeline and updates the job dict."""
    job = jobs[job_id]

    try:
        # Step 0: Analyzing place
        job["step"] = 0
        job["events"].append(("step", {"step": 0, "name": "Analyzing place"}))
        job["step_event"].set()
        job["step_event"] = asyncio.Event()

        analysis = await asyncio.to_thread(analyze_place, image_bytes, mime_type)
        job["analysis"] = analysis
        job["events"].append(("analysis", {"analysis": analysis}))
        job["step_event"].set()
        job["step_event"] = asyncio.Event()

        # Step 1: Generating legend
        job["step"] = 1
        job["events"].append(("step", {"step": 1, "name": "Generating legend"}))
        job["step_event"].set()
        job["step_event"] = asyncio.Event()

        legend = await asyncio.to_thread(generate_legend, analysis)
        job["legend"] = legend
        job["events"].append(("legend", {"legend": legend}))
        job["step_event"].set()
        job["step_event"] = asyncio.Event()

        # Step 2: Generating panels (in parallel)
        job["step"] = 2
        job["events"].append(("step", {"step": 2, "name": "Generating panels"}))
        job["step_event"].set()
        job["step_event"] = asyncio.Event()

        panels_desc = parse_panel_descriptions(legend)

        async def generate_and_store_panel(idx: int, desc: str):
            image_data = await asyncio.to_thread(generate_single_panel, desc, analysis)
            job["panels"].append(image_data)
            job["events"].append(("panel", {"index": idx, "image": image_data}))
            job["step_event"].set()
            job["step_event"] = asyncio.Event()

        await asyncio.gather(
            *[generate_and_store_panel(i, desc) for i, desc in enumerate(panels_desc)]
        )

        # Step 3: Done
        job["step"] = 3
        job["status"] = "done"
        job["events"].append(("done", {}))
        job["step_event"].set()

    except Exception as e:
        traceback.print_exc()
        job["status"] = "error"
        job["error"] = str(e)
        job["events"].append(("error", {"error": str(e)}))
        job["step_event"].set()


@app.post("/analyze")
async def analyze(file: UploadFile):
    """Start the CityLore pipeline on an uploaded image. Returns a job_id immediately."""
    image_bytes = await file.read()

    suffix_to_mime = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".heic": "image/heic",
    }
    ext = Path(file.filename or "photo.jpg").suffix.lower()
    mime_type = suffix_to_mime.get(ext, "image/jpeg")

    # Cleanup old jobs
    cleanup_old_jobs()

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "processing",
        "step": 0,
        "analysis": None,
        "legend": None,
        "panels": [],
        "error": None,
        "events": [],
        "event_cursor": 0,
        "step_event": asyncio.Event(),
        "created_at": time.time(),
    }

    asyncio.create_task(process_job(job_id, image_bytes, mime_type))

    return {"job_id": job_id}


@app.get("/status/{job_id}")
async def get_status(job_id: str):
    """Poll the current state of a job."""
    if job_id not in jobs:
        return {"error": "Job not found"}, 404

    job = jobs[job_id]
    return {
        "status": job["status"],
        "step": job["step"],
        "analysis": job["analysis"],
        "legend": job["legend"],
        "panels": list(job["panels"]),
        "error": job["error"],
    }


@app.get("/stream/{job_id}")
async def stream_job(job_id: str):
    """Stream job results as Server-Sent Events."""
    if job_id not in jobs:
        async def error_gen():
            yield f"event: error\ndata: {json.dumps({'error': 'Job not found'})}\n\n"
        return StreamingResponse(error_gen(), media_type="text/event-stream")

    async def event_generator():
        job = jobs[job_id]
        cursor = 0

        while True:
            # Emit any new events since our cursor
            while cursor < len(job["events"]):
                event_type, payload = job["events"][cursor]
                yield f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"
                cursor += 1

                # If we just sent done or error, we're finished
                if event_type in ("done", "error"):
                    return

            # Wait for the next event
            await job["step_event"].wait()

    return StreamingResponse(event_generator(), media_type="text/event-stream")
