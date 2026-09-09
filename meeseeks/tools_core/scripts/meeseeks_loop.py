#!/usr/bin/env python3
"""
Meeseeks Loop Runner CLI - Simple 3-Loop Cycle
"I'M MR. MEESEEKS! THREE LOOPS AND I'M DONE!"

Simple 3-loop RSI cycle without the full orchestrator.
Use this for quick analysis or when you want manual control.

For full orchestration with arbiter decisions, use meeseeks_spin.py instead.

Usage:
    ./meeseeks_loop.py "Analyze this codebase"
    ./meeseeks_loop.py "Quick check" --loops 1
    ./meeseeks_loop.py --file task.md

Examples:
    # Basic 3-loop cycle
    ./meeseeks_loop.py "Analyze the authentication module"
    
    # Single loop for quick check
    ./meeseeks_loop.py "Check for security issues" --loops 1
    
    # From file
    ./meeseeks_loop.py --file box/prime_directive.md
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
        description="🔵 Meeseeks Loop Runner - Simple 3-Loop Cycle",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run 3-loop cycle
  %(prog)s "Analyze the database schema"
  
  # Single loop for quick analysis
  %(prog)s "Check for bugs" --loops 1
  
  # From file
  %(prog)s --file box/prime_directive.md
  
  # Custom output
  %(prog)s "Review API" --output logs/api_review

Note: For full orchestration with arbiter (continue/pivot/spawn decisions),
      use meeseeks_spin.py instead.
        """
    )
    
    parser.add_argument(
        "task",
        nargs="?",
        help="The task to analyze"
    )
    parser.add_argument(
        "--file", "-f",
        help="Read task from file"
    )
    parser.add_argument(
        "--loops", "-l",
        type=int,
        default=3,
        choices=[1, 2, 3],
        help="Number of loops (1-3). Default: 3"
    )
    parser.add_argument(
        "--output", "-o",
        help="Output directory for session logs"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose logging"
    )
    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Minimal output"
    )
    parser.add_argument("--no-verify", action="store_true",
                        help="Skip probe synthesis and execution (cheaper, unverified)")
    parser.add_argument("--test-command", default=None,
                        help="Command a CHECK_INVARIANT probe runs, e.g. "
                             "'venv/bin/pytest tests/test_costs.py -q'. Defaults to "
                             "the whole suite, which is slow inside a loop.")
    parser.add_argument("--max-probes", type=int, default=3,
                        help="How many dissents get a probe each loop. Concerns "
                             "beyond this are reported as unexamined rather than "
                             "counted against the resolution rate (default 3)")
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
    from reasoning import MeeseeksLoopRunner
    
    output_dir = Path(args.output) if args.output else None
    
    print("=" * 60)
    print("🔵 *poof* I'M MR. MEESEEKS!")
    print("=" * 60)
    print(f"Task: {task[:80]}{'...' if len(task) > 80 else ''}")
    print(f"Loops: {args.loops}")
    print("=" * 60)
    print()
    
    runner = MeeseeksLoopRunner(
        prime_directive=task,
        output_dir=output_dir,
        repo_root=args.repo_root,
        verify=not args.no_verify,
        test_command=args.test_command.split() if args.test_command else None,
        probe_timeout=args.probe_timeout,
        max_probes_per_loop=args.max_probes,
    )
    
    # Override max loops if specified
    if args.loops != 3:
        runner.MAX_LOOPS = args.loops
    
    result = runner.run()
    
    # Print results
    print()
    print("=" * 60)
    if result.status.value in ["task_complete", "execute_with_monitoring"]:
        print("🔵 ANALYSIS COMPLETE! CAN DO!")
    else:
        print(f"🔵 Status: {result.status.value}")
    print("=" * 60)
    print(f"Status: {result.status.value}")
    print(f"Final Confidence: {result.final_confidence:.0%}")
    print(f"Session ID: {result.session_id}")
    print(f"Loops Completed: {result.loops_completed}")
    
    if result.artifacts:
        print(f"\nArtifacts:")
        for artifact in result.artifacts[:5]:
            print(f"  • {artifact}")
    
    # Exit code
    success = result.status.value in ["task_complete", "execute_with_monitoring"]
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
