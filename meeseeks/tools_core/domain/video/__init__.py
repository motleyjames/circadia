"""
Video Domain Module - Video Transcription and Analysis

Provides video transcription using Gemini with focus modes for different use cases.

Usage:
    from tools_core.domain.video import VideoTranscriber
    
    transcriber = VideoTranscriber()
    result = transcriber.transcribe('meeting.mp4', focus='meeting')
    
Focus modes:
- 'meeting': Extract action items, decisions, key points
- 'technical': Focus on code, commands, technical details  
- 'creative': Capture visual descriptions, creative concepts
"""

from .meeseeks_video_transcriber import VideoTranscriber

__all__ = [
    'VideoTranscriber',
]
