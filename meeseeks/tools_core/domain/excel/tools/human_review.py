"""
Human Review - Human-in-the-loop approval interface
"""

import logging
from pathlib import Path

from ..core.data_classes import UpdatePlan, ApprovalStatus

logger = logging.getLogger(__name__)


class HumanReview:
    """
    Human-in-the-loop approval interface.
    """
    
    def __init__(self, mode: str = 'cli'):
        """
        Initialize review interface.
        
        Args:
            mode: 'cli' (command line), 'auto' (auto-approve), 'file' (write to file)
        """
        self.mode = mode
    
    def request_approval(self, plan: UpdatePlan, diff: str) -> ApprovalStatus:
        """Request human approval for a plan"""
        
        if self.mode == 'auto':
            logger.info("  → Auto-approval mode: approved")
            return ApprovalStatus.APPROVED
        
        if self.mode == 'file':
            review_path = Path(f"review_{plan.id}.md")
            with open(review_path, 'w') as f:
                f.write(diff)
            logger.info(f"  → Review file written to: {review_path}")
            return ApprovalStatus.PENDING
        
        print("\n" + "=" * 60)
        print("UPDATE PLAN REVIEW")
        print("=" * 60)
        print(diff)
        print("=" * 60)
        
        while True:
            try:
                response = input("\nApprove this update? [y/n/q]: ").lower().strip()
                
                if response == 'y':
                    return ApprovalStatus.APPROVED
                elif response == 'n':
                    return ApprovalStatus.REJECTED
                elif response == 'q':
                    raise KeyboardInterrupt("User cancelled")
                else:
                    print("Please enter 'y' (yes), 'n' (no), or 'q' (quit)")
            except EOFError:
                logger.warning("Non-interactive environment, auto-approving")
                return ApprovalStatus.APPROVED

