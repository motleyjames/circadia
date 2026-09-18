"""
Meeseeks Server Module

FastAPI server for LLM chat and other services.

Components:
- meeseeks_server: Main FastAPI application with chat endpoints
"""

from .meeseeks_server import app

__all__ = ['app']
