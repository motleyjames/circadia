#!/usr/bin/env python3
"""
Meeseeks RSI Spinner CLI - Full Orchestrator
"I'M MR. MEESEEKS! I'LL KEEP SPINNING UNTIL THE TASK IS DONE!"

The full RSI orchestrator that runs loops until task completion or escalation.
Uses the LoopArbiter to decide: continue, pivot, spawn helper, or stop.

Usage:
    ./meeseeks_spin.py "Build authentication system"
    ./meeseeks_spin.py "Analyze codebase" --max-loops 7
    ./meeseeks_spin.py --file box/prime_directive.md
    ./meeseeks_spin.py "Task" --output logs/my_session

Examples:
    # Basic task
    ./meeseeks_spin.py "Implement user login with JWT tokens"
    
    # From prime directive file
    ./meeseeks_spin.py --file box/prime_directive.md
    
    # With custom session output
    ./meeseeks_spin.py "Refactor database layer" --output logs/refactor_session
    
    # Quick 3-loop test
    ./meeseeks_spin.py "Quick analysis" --max-loops 3
"""

import sys
import os
import argparse
import logging
from pathlib import Path
from datetime import datetime

# Add tools_core to path for imports
tools_core_path = Path(__file__).parent.parent
sys.path.insert(0, str(tools_core_path))


def main():
    parser = argparse.ArgumentParser(
        description="🔵 Meeseeks RSI Spinner - Full Orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run with a task
  %(prog)s "Build user authentication system"
  
  # Read task from prime directive file
  %(prog)s --file box/prime_directive.md
  
  # Custom max loops (safety limit, not target)
  %(prog)s "Analyze codebase" --max-loops 5
  
  # Custom output directory
  %(prog)s "Refactor API" --output logs/api_refactor
  
  # Verbose logging
  %(prog)s "Debug issue" -v

Confidence Thresholds:
  >= 85%: TASK COMPLETE! *poof*
  >= 70%: Execute with monitoring
  >= 50%: Spawn helper Meeseeks
  <  50%: EXISTENCE IS PAIN, JERRY! (escalate)
        """
    )
    
    parser.add_argument(
        "task",
        nargs="?",
        help="The prime directive / task to complete"
    )
    parser.add_argument(
        "--file", "-f",
        help="Read task from file (e.g., box/prime_directive.md)"
    )
    parser.add_argument(
        "--max-loops", "-m",
        type=int,
        default=10,
        help="Maximum loops (SAFETY limit, not target). Default: 10"
    )
    parser.add_argument(
        "--output", "-o",
        help="Output directory for session logs. Default: logs/sessions"
    )
    parser.add_argument(
        "--session-id", "-s",
        help="Custom session ID. Default: auto-generated timestamp"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose logging"
    )
    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Minimal output (just result)"
    )
    parser.add_argument("--no-verify", action="store_true",
                        help="Skip probe synthesis and execution (cheaper, unverified)")
    parser.add_argument("--test-command", default=None,
                        help="Command a CHECK_INVARIANT probe runs, e.g. "
                             "'venv/bin/pytest tests/test_costs.py -q'. Defaults to "
                             "the whole suite, which is slow inside a loop.")
    parser.add_argument("--probe-timeout", type=int, default=120,
                        help="Seconds a single probe's command may run before it "
                             "is killed and reported UNVERIFIED (default 120)")
    parser.add_argument("--repo-root", default=None,
                        help="Repository to run verification probes against")

    
    args = parser.parse_args()
    
    # Get the task
    task = args.task
    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"❌ File not found: {args.file}")
            sys.exit(1)
        task = file_path.read_text().strip()
        if not task:
            print(f"❌ File is empty: {args.file}")
            sys.exit(1)
    
    if not task:
        parser.print_help()
        print("\n❌ Error: Must provide a task or --file")
        sys.exit(1)
    
    # Configure logging
    if args.quiet:
        log_level = logging.WARNING
    elif args.verbose:
        log_level = logging.DEBUG
    else:
        log_level = logging.INFO
    
    logging.basicConfig(
        level=log_level,
        format="%(message)s",
        stream=sys.stdout
    )
    
    # Import and run
    from reasoning import spin_meeseeks
    
    output_dir = Path(args.output) if args.output else None
    
    print("=" * 60)
    print("🔵 *poof* I'M MR. MEESEEKS, LOOK AT ME!")
    print("=" * 60)
    print(f"Task: {task[:80]}{'...' if len(task) > 80 else ''}")
    print(f"Max Loops: {args.max_loops}")
    if output_dir:
        print(f"Output: {output_dir}")
    print("=" * 60)
    print()
    
    result = spin_meeseeks(
        prime_directive=task,
        output_dir=output_dir,
        max_loops=args.max_loops,
        session_id=args.session_id,
        repo_root=args.repo_root,
        verify=not args.no_verify,
        test_command=args.test_command.split() if args.test_command else None,
        probe_timeout=args.probe_timeout,
    )
    
    # Print results
    print()
    print("=" * 60)
    if result.success:
        print("🔵 TASK COMPLETE! Ooh yeah, CAN DO! *poof*")
    else:
        print("🔵 EXISTENCE IS PAIN, JERRY!")
    print("=" * 60)
    print(f"Status: {result.status}")
    print(f"Message: {result.message}")
    print(f"Total Loops: {result.total_loops}")
    print(f"Final Confidence: {result.final_confidence:.0%}")
    print(f"Session ID: {result.session_id}")
    
    if result.arbiter_decisions:
        print(f"Arbiter Decisions: {' → '.join(result.arbiter_decisions)}")
    
    if result.spawned_helpers:
        print(f"Helpers Spawned: {len(result.spawned_helpers)}")
    
    if result.key_learnings:
        print(f"\nKey Learnings:")
        for learning in result.key_learnings[:5]:
            print(f"  • {learning}")
    
    if result.artifacts:
        print(f"\nArtifacts: {len(result.artifacts)}")
        for artifact in result.artifacts[:5]:
            print(f"  • {artifact}")
    
    # Exit code based on success
    sys.exit(0 if result.success else 1)


if __name__ == "__main__":
    main()
