#!/usr/bin/env python3
"""
meeseeks_server.py - Meeseeks FastAPI Server

A small HTTP API for interacting with the Meeseeks toolkit.

This intentionally stays minimal and uses the Meeseeks LLM caller and tracer.

Run:
  cd tools_core/server
  uvicorn meeseeks_server:app --port 8000 --reload
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
except Exception as e:  # pragma: no cover
    raise ImportError(
        "Meeseeks Server requires FastAPI dependencies.\n"
        "Install: pip install fastapi uvicorn pydantic\n"
        f"Import error: {e}"
    ) from e

# Import from core - try both import paths for flexibility (dash-dir vs tools_core shim)
try:
    from core.meeseeks_llm_caller import call_model, list_available_models, get_default_model
    from core.meeseeks_tracer import get_tracer, Phase
except Exception:  # pragma: no cover
    from tools_core.core.meeseeks_llm_caller import call_model, list_available_models, get_default_model
    from tools_core.core.meeseeks_tracer import get_tracer, Phase

logger = logging.getLogger(__name__)


class ChatMessage(BaseModel):
    role: str = Field(..., description="user|assistant|system")
    content: str = Field(..., max_length=10000)


class ChatRequest(BaseModel):
    message: str = Field(..., max_length=10000)
    model: str = Field(
        default_factory=lambda: get_default_model("google_top"),
        description="Model key from box/00_llm_router_config.json",
    )
    system: Optional[str] = Field(default=None, max_length=20000)
    history: Optional[List[ChatMessage]] = None
    session_id: Optional[str] = Field(
        default=None,
        description="Optional Meeseeks session_id for trace logging",
        max_length=100,
    )


class ChatResponse(BaseModel):
    reply: str
    model_used: str


app = FastAPI(title="Meeseeks Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok"}


@app.get("/models")
def models() -> Dict[str, Any]:
    try:
        return {"models": list_available_models()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    try:
        history_str = ""
        if request.history:
            lines = []
            for m in request.history[-20:]:
                lines.append(f"{m.role}: {m.content}")
            history_str = "\n".join(lines) + "\n\n"

        prompt = f"{history_str}user: {request.message}"
        reply = call_model(
            model=request.model,
            prompt=prompt,
            system=request.system,
        )

        if request.session_id:
            tracer = get_tracer(request.session_id)
            tracer.log(
                phase=Phase.EXECUTION,
                title="Server Chat",
                context=f"model={request.model}",
                reasoning=request.message[:2000],
                decision_action="Returned chat response",
                next_steps=[],
                metadata={"model": request.model},
            )

        return ChatResponse(reply=reply, model_used=request.model)
    except Exception as e:
        logger.error("Chat error", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from e

