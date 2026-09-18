"""
Executor - Safe Excel writing with backups
"""

import shutil
import logging
import openpyxl
from pathlib import Path
from datetime import datetime
from typing import Optional

from ..core.data_classes import UpdatePlan, UpdateTarget, UpdateType, ExecutionResult

logger = logging.getLogger(__name__)


class Executor:
    """
    Safely executes updates on Excel files.
    
    Features:
    - Automatic backups
    - Atomic updates
    - Rollback capability
    - Preserves formulas and formatting
    """
    
    def __init__(self, backup_dir: Optional[Path] = None):
        self.backup_dir = backup_dir or Path('backups')
        self.backup_dir.mkdir(exist_ok=True)
    
    def execute(self, excel_path: Path, plan: UpdatePlan) -> ExecutionResult:
        """Execute an update plan on an Excel file"""
        excel_path = Path(excel_path)
        start_time = datetime.now()
        
        logger.info(f"🔧 Executing update plan: {plan.id}")
        
        backup_path = self._create_backup(excel_path)
        logger.info(f"  ✓ Backup created: {backup_path.name}")
        
        errors = []
        updates_applied = 0
        updates_failed = 0
        
        try:
            wb = openpyxl.load_workbook(excel_path, keep_vba=True)
            
            for idx in plan.execution_order:
                target = plan.targets[idx]
                
                try:
                    self._apply_update(wb, target)
                    updates_applied += 1
                except Exception as e:
                    errors.append(f"Failed to update {target.location.sheet}!{target.location.cell}: {e}")
                    updates_failed += 1
            
            output_path = self._get_output_path(excel_path)
            wb.save(output_path)
            wb.close()
            
            logger.info(f"  ✓ Applied {updates_applied} updates")
            logger.info(f"  ✓ Saved to: {output_path.name}")
            
            duration = (datetime.now() - start_time).total_seconds()
            
            return ExecutionResult(
                success=updates_failed == 0,
                plan_id=plan.id,
                updates_applied=updates_applied,
                updates_failed=updates_failed,
                errors=errors,
                backup_path=str(backup_path),
                output_path=str(output_path),
                duration_seconds=duration
            )
            
        except Exception as e:
            logger.error(f"  ✗ Execution failed: {e}")
            return ExecutionResult(
                success=False,
                plan_id=plan.id,
                updates_applied=updates_applied,
                updates_failed=updates_failed + 1,
                errors=errors + [str(e)],
                backup_path=str(backup_path),
                output_path='',
                duration_seconds=(datetime.now() - start_time).total_seconds()
            )
    
    def _create_backup(self, excel_path: Path) -> Path:
        """Create a backup of the Excel file"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_name = f"{excel_path.stem}_backup_{timestamp}{excel_path.suffix}"
        backup_path = self.backup_dir / backup_name
        shutil.copy2(excel_path, backup_path)
        return backup_path
    
    def _get_output_path(self, excel_path: Path) -> Path:
        """Generate output path with version"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_name = f"{excel_path.stem}_updated_{timestamp}{excel_path.suffix}"
        return excel_path.parent / output_name
    
    def _apply_update(self, wb: openpyxl.Workbook, target: UpdateTarget):
        """Apply a single update to the workbook"""
        sheet = wb[target.location.sheet]
        cell = sheet[target.location.cell]
        
        if target.update_type == UpdateType.INSERT:
            cell.value = target.new_value
        elif target.update_type == UpdateType.UPDATE:
            cell.value = target.new_value
        elif target.update_type == UpdateType.DELETE:
            cell.value = None
    
    def rollback(self, backup_path: Path, original_path: Path):
        """Rollback to backup"""
        logger.info(f"⏪ Rolling back to: {backup_path}")
        shutil.copy2(backup_path, original_path)

