"""
Excel Engine - Production-Grade Excel Handling

Fixes the limitations of openpyxl:
1. xlwings - Uses REAL Excel app for accurate formula execution & screenshots
2. calamine - Rust-based reader for 10x faster ingestion
3. Proper screenshot capture that actually works

Priority order for operations:
- Reading large files: calamine (fastest)
- Reading with formulas: openpyxl (compatible)
- Writing/Screenshots: xlwings (uses real Excel, no corruption)
- Fallback: openpyxl (always available)
"""

import os
import sys
import logging
import tempfile
import base64
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

# Check available engines
XLWINGS_AVAILABLE = False
CALAMINE_AVAILABLE = False
OPENPYXL_AVAILABLE = False

try:
    import xlwings as xw
    XLWINGS_AVAILABLE = True
    logger.info("  ✓ xlwings available (real Excel integration)")
except ImportError:
    logger.debug("  xlwings not available")

try:
    import python_calamine as calamine
    CALAMINE_AVAILABLE = True
    logger.info("  ✓ calamine available (fast Rust reader)")
except ImportError:
    try:
        from calamine import CalamineReader
        CALAMINE_AVAILABLE = True
        logger.info("  ✓ calamine available (fast Rust reader)")
    except ImportError:
        logger.debug("  calamine not available")

try:
    import openpyxl
    OPENPYXL_AVAILABLE = True
except ImportError:
    logger.warning("  openpyxl not available!")


@dataclass
class ExcelCapture:
    """Result of capturing an Excel range"""
    sheet_name: str
    range_ref: str
    image_path: str
    base64_data: str
    method: str  # 'xlwings', 'excel2img', 'mock'
    width: int = 0
    height: int = 0


class ExcelEngine:
    """
    Production Excel Engine
    
    Uses the best available tool for each operation:
    - xlwings: Real Excel (Windows/Mac with Excel installed)
    - calamine: Fast reading (any platform)
    - openpyxl: Fallback (any platform)
    """
    
    def __init__(self, excel_path: Path):
        self.excel_path = Path(excel_path)
        
        if not self.excel_path.exists():
            raise FileNotFoundError(f"Excel file not found: {excel_path}")
        
        # Determine best engine
        self.xlwings_app = None
        self.xlwings_book = None
        
        logger.info(f"\n  📊 ExcelEngine: {self.excel_path.name}")
        logger.info(f"     xlwings: {'✓' if XLWINGS_AVAILABLE else '✗'}")
        logger.info(f"     calamine: {'✓' if CALAMINE_AVAILABLE else '✗'}")
        logger.info(f"     openpyxl: {'✓' if OPENPYXL_AVAILABLE else '✗'}")
    
    # =========================================================================
    # FAST READING (calamine)
    # =========================================================================
    
    def read_fast(self) -> Dict[str, List[List[Any]]]:
        """
        Read entire workbook FAST using calamine (Rust).
        
        Returns dict of sheet_name -> 2D list of values
        
        This is 10x faster than openpyxl for large files.
        """
        if CALAMINE_AVAILABLE:
            return self._read_with_calamine()
        else:
            logger.warning("  calamine not available, falling back to openpyxl")
            return self._read_with_openpyxl()
    
    def _read_with_calamine(self) -> Dict[str, List[List[Any]]]:
        """Read with calamine (Rust-based, very fast)"""
        try:
            from python_calamine import CalamineWorkbook
            
            workbook = CalamineWorkbook.from_path(str(self.excel_path))
            sheets = {}
            
            for sheet_name in workbook.sheet_names:
                data = workbook.get_sheet_by_name(sheet_name).to_python()
                sheets[sheet_name] = data
            
            logger.info(f"  ✓ calamine read {len(sheets)} sheets")
            return sheets
            
        except Exception as e:
            logger.error(f"  calamine read failed: {e}")
            return self._read_with_openpyxl()
    
    def _read_with_openpyxl(self) -> Dict[str, List[List[Any]]]:
        """Fallback read with openpyxl"""
        import openpyxl
        
        wb = openpyxl.load_workbook(self.excel_path, data_only=True, read_only=True)
        sheets = {}
        
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            data = []
            for row in ws.iter_rows():
                row_data = [cell.value for cell in row]
                data.append(row_data)
            sheets[sheet_name] = data
        
        wb.close()
        logger.info(f"  ✓ openpyxl read {len(sheets)} sheets")
        return sheets
    
    # =========================================================================
    # XLWINGS INTEGRATION (Real Excel)
    # =========================================================================
    
    def open_with_xlwings(self, visible: bool = False) -> bool:
        """
        Open the workbook with xlwings (uses real Excel).
        
        This gives us:
        - Accurate formula execution
        - Real screenshot capture
        - No chart/pivot corruption
        """
        if not XLWINGS_AVAILABLE:
            logger.warning("  xlwings not available")
            return False
        
        try:
            # Check if Excel is available
            self.xlwings_app = xw.App(visible=visible)
            self.xlwings_book = self.xlwings_app.books.open(str(self.excel_path))
            
            logger.info(f"  ✓ Opened with xlwings (Excel PID: {self.xlwings_app.pid})")
            return True
            
        except Exception as e:
            logger.error(f"  xlwings open failed: {e}")
            self.xlwings_app = None
            self.xlwings_book = None
            return False
    
    def close_xlwings(self, save: bool = False):
        """Close xlwings connection"""
        if self.xlwings_book:
            if save:
                self.xlwings_book.save()
            self.xlwings_book.close()
        
        if self.xlwings_app:
            self.xlwings_app.quit()
        
        self.xlwings_book = None
        self.xlwings_app = None
    
    def capture_range_xlwings(self, 
                               sheet_name: str, 
                               range_ref: str,
                               output_path: Optional[Path] = None) -> Optional[ExcelCapture]:
        """
        Capture a screenshot using xlwings (REAL Excel screenshots).
        
        This is the ONLY way to get accurate visual captures:
        - Sees actual formatting
        - Sees charts correctly
        - Sees conditional formatting
        """
        if not XLWINGS_AVAILABLE:
            logger.warning("  xlwings not available for capture")
            return None
        
        need_close = False
        if not self.xlwings_book:
            if not self.open_with_xlwings(visible=False):
                return None
            need_close = True
        
        try:
            # Get the sheet
            sheet = self.xlwings_book.sheets[sheet_name]
            
            # Get the range
            rng = sheet.range(range_ref)
            
            # Create output path
            if not output_path:
                output_path = Path(tempfile.gettempdir()) / f"capture_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            
            # Copy range to clipboard and save as image
            # xlwings uses CopyPicture on Windows/Mac
            rng.api.CopyPicture(Appearance=1, Format=2)  # xlScreen, xlBitmap
            
            # On Mac, use screencapture; on Windows, use clipboard
            if sys.platform == 'darwin':
                # macOS approach
                import subprocess
                
                # First, select the range to highlight it
                rng.select()
                
                # Use screencapture to capture the Excel window
                # This is a workaround since xlwings doesn't have direct image export
                sheet_api = sheet.api
                
                # Alternative: Export to PDF then convert
                temp_pdf = Path(tempfile.gettempdir()) / "temp_capture.pdf"
                sheet.api.ExportAsFixedFormat(0, str(temp_pdf))  # xlTypePDF = 0
                
                # Convert PDF to PNG using sips or ImageMagick
                try:
                    subprocess.run([
                        'sips', '-s', 'format', 'png', 
                        str(temp_pdf), '--out', str(output_path)
                    ], check=True, capture_output=True)
                except subprocess.CalledProcessError:
                    # Fallback: just report that we couldn't convert
                    logger.warning("  Could not convert PDF to PNG")
                    output_path = temp_pdf
                    
            else:
                # Windows approach - can use win32clipboard
                try:
                    import win32clipboard
                    from PIL import Image
                    import io
                    
                    win32clipboard.OpenClipboard()
                    data = win32clipboard.GetClipboardData(win32clipboard.CF_DIB)
                    win32clipboard.CloseClipboard()
                    
                    # Convert DIB to PNG
                    img = Image.open(io.BytesIO(data))
                    img.save(str(output_path), 'PNG')
                    
                except ImportError:
                    logger.warning("  win32clipboard not available")
                    return None
            
            # Read the image and encode
            if output_path.exists():
                with open(output_path, 'rb') as f:
                    image_data = f.read()
                
                capture = ExcelCapture(
                    sheet_name=sheet_name,
                    range_ref=range_ref,
                    image_path=str(output_path),
                    base64_data=base64.b64encode(image_data).decode('utf-8'),
                    method='xlwings'
                )
                
                logger.info(f"  ✓ Captured {sheet_name}!{range_ref} via xlwings")
                return capture
            
            return None
            
        except Exception as e:
            logger.error(f"  xlwings capture failed: {e}")
            return None
        
        finally:
            if need_close:
                self.close_xlwings()
    
    # =========================================================================
    # ALTERNATIVE CAPTURE METHODS
    # =========================================================================
    
    def capture_range_pyautogui(self, 
                                 sheet_name: str, 
                                 range_ref: str) -> Optional[ExcelCapture]:
        """
        Capture using PyAutoGUI (opens Excel and screenshots).
        
        This is a fallback when xlwings image export doesn't work.
        """
        try:
            import pyautogui
            import time
            
            # Open Excel with xlwings (visible)
            if not self.xlwings_book:
                if not self.open_with_xlwings(visible=True):
                    return None
            
            # Navigate to sheet and select range
            sheet = self.xlwings_book.sheets[sheet_name]
            rng = sheet.range(range_ref)
            rng.select()
            
            # Wait for Excel to render
            time.sleep(1)
            
            # Get the screen region of the range
            # This is approximate - we'd need to calculate from cell positions
            # For now, just capture the entire screen and crop
            
            screenshot = pyautogui.screenshot()
            
            # Save to temp file
            output_path = Path(tempfile.gettempdir()) / f"capture_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            screenshot.save(str(output_path))
            
            with open(output_path, 'rb') as f:
                image_data = f.read()
            
            return ExcelCapture(
                sheet_name=sheet_name,
                range_ref=range_ref,
                image_path=str(output_path),
                base64_data=base64.b64encode(image_data).decode('utf-8'),
                method='pyautogui',
                width=screenshot.width,
                height=screenshot.height
            )
            
        except ImportError:
            logger.warning("  pyautogui not available")
            return None
        except Exception as e:
            logger.error(f"  pyautogui capture failed: {e}")
            return None
    
    def capture_range_html(self, 
                            sheet_name: str, 
                            range_ref: str) -> Optional[ExcelCapture]:
        """
        Create an HTML representation and render to image.
        
        This doesn't require Excel but produces a reasonable visual.
        """
        try:
            import openpyxl
            from html2image import Html2Image
            
            # Read the range with openpyxl
            wb = openpyxl.load_workbook(self.excel_path)
            ws = wb[sheet_name]
            
            # Parse range
            from openpyxl.utils import range_boundaries
            min_col, min_row, max_col, max_row = range_boundaries(range_ref)
            
            # Build HTML table
            html = ['<html><head><style>']
            html.append('''
                body { font-family: Calibri, Arial, sans-serif; }
                table { border-collapse: collapse; }
                td, th { border: 1px solid #ccc; padding: 4px 8px; min-width: 80px; }
                th { background: #f0f0f0; }
            ''')
            html.append('</style></head><body><table>')
            
            for row in range(min_row, max_row + 1):
                html.append('<tr>')
                for col in range(min_col, max_col + 1):
                    cell = ws.cell(row=row, column=col)
                    value = cell.value or ''
                    
                    # Get cell styling (with safe color extraction)
                    style = ''
                    try:
                        if cell.fill and cell.fill.fgColor:
                            rgb = cell.fill.fgColor.rgb
                            if rgb and isinstance(rgb, str) and rgb != '00000000' and len(rgb) >= 6:
                                style += f'background-color: #{rgb[-6:]};'
                    except:
                        pass
                    try:
                        if cell.font:
                            if cell.font.bold:
                                style += 'font-weight: bold;'
                            if cell.font.color and cell.font.color.rgb:
                                rgb = cell.font.color.rgb
                                if isinstance(rgb, str) and len(rgb) >= 6:
                                    style += f'color: #{rgb[-6:]};'
                    except:
                        pass
                    try:
                        if cell.alignment and cell.alignment.horizontal:
                            style += f'text-align: {cell.alignment.horizontal};'
                    except:
                        pass
                    
                    html.append(f'<td style="{style}">{value}</td>')
                html.append('</tr>')
            
            html.append('</table></body></html>')
            wb.close()
            
            # Render HTML to image
            hti = Html2Image(output_path=str(Path(tempfile.gettempdir())))
            output_name = f"capture_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            
            hti.screenshot(
                html_str=''.join(html),
                save_as=output_name,
                size=(1200, 800)
            )
            
            output_path = Path(tempfile.gettempdir()) / output_name
            
            with open(output_path, 'rb') as f:
                image_data = f.read()
            
            return ExcelCapture(
                sheet_name=sheet_name,
                range_ref=range_ref,
                image_path=str(output_path),
                base64_data=base64.b64encode(image_data).decode('utf-8'),
                method='html2image'
            )
            
        except ImportError as e:
            logger.warning(f"  HTML capture dependencies missing: {e}")
            return None
        except Exception as e:
            logger.error(f"  HTML capture failed: {e}")
            return None
    
    def capture_range(self, 
                       sheet_name: str, 
                       range_ref: str,
                       output_dir: Optional[Path] = None) -> Optional[ExcelCapture]:
        """
        Capture a range screenshot using the best available method.
        
        Priority (xlwings screenshot is DISABLED - doesn't work on Mac):
        1. html2image (renders HTML - good quality, cross-platform!)
        2. PIL mock (creates basic table image)
        
        Note: xlwings CopyPicture API only works on Windows with Excel.
        html2image works everywhere and produces good results.
        """
        output_path = None
        if output_dir:
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / f"{sheet_name}_{range_ref.replace(':', '_')}_{datetime.now().strftime('%H%M%S')}.png"
        
        # Try HTML rendering first (cross-platform, works great!)
        result = self.capture_range_html(sheet_name, range_ref)
        if result:
            return result
        
        # Fallback to PIL mock
        return self._capture_range_mock(sheet_name, range_ref, output_dir)
    
    def _capture_range_mock(self, 
                             sheet_name: str, 
                             range_ref: str,
                             output_dir: Optional[Path] = None) -> Optional[ExcelCapture]:
        """Create a basic mock capture using PIL"""
        try:
            from PIL import Image, ImageDraw, ImageFont
            import openpyxl
            from openpyxl.utils import range_boundaries
            
            # Read data
            wb = openpyxl.load_workbook(self.excel_path, data_only=True)
            ws = wb[sheet_name]
            
            min_col, min_row, max_col, max_row = range_boundaries(range_ref)
            
            # Create image
            cell_width = 100
            cell_height = 25
            cols = max_col - min_col + 1
            rows = max_row - min_row + 1
            
            img_width = cols * cell_width + 20
            img_height = rows * cell_height + 20
            
            img = Image.new('RGB', (img_width, img_height), 'white')
            draw = ImageDraw.Draw(img)
            
            # Draw cells
            for i, row in enumerate(range(min_row, max_row + 1)):
                for j, col in enumerate(range(min_col, max_col + 1)):
                    cell = ws.cell(row=row, column=col)
                    value = str(cell.value)[:12] if cell.value else ''
                    
                    x = 10 + j * cell_width
                    y = 10 + i * cell_height
                    
                    # Draw border
                    draw.rectangle([x, y, x + cell_width, y + cell_height], outline='#cccccc')
                    
                    # Draw value
                    draw.text((x + 5, y + 5), value, fill='black')
            
            wb.close()
            
            # Save
            if output_dir:
                output_path = output_dir / f"mock_{sheet_name}_{datetime.now().strftime('%H%M%S')}.png"
            else:
                output_path = Path(tempfile.gettempdir()) / f"mock_{datetime.now().strftime('%H%M%S')}.png"
            
            img.save(str(output_path))
            
            with open(output_path, 'rb') as f:
                image_data = f.read()
            
            logger.info(f"  ⚠️ Created mock capture (PIL) for {sheet_name}!{range_ref}")
            
            return ExcelCapture(
                sheet_name=sheet_name,
                range_ref=range_ref,
                image_path=str(output_path),
                base64_data=base64.b64encode(image_data).decode('utf-8'),
                method='mock_pil',
                width=img_width,
                height=img_height
            )
            
        except Exception as e:
            logger.error(f"  Mock capture failed: {e}")
            return None
    
    # =========================================================================
    # FORMULA EXECUTION
    # =========================================================================
    
    def calculate_formulas(self) -> bool:
        """
        Force Excel to recalculate all formulas.
        
        This is only possible with xlwings (real Excel).
        openpyxl cannot execute formulas!
        """
        if not XLWINGS_AVAILABLE:
            logger.warning("  xlwings required for formula calculation")
            return False
        
        need_close = False
        if not self.xlwings_book:
            if not self.open_with_xlwings():
                return False
            need_close = True
        
        try:
            # Force full recalculation
            self.xlwings_app.calculate()
            logger.info("  ✓ Formulas recalculated via xlwings")
            return True
            
        except Exception as e:
            logger.error(f"  Formula calculation failed: {e}")
            return False
        
        finally:
            if need_close:
                self.close_xlwings()
    
    def get_calculated_value(self, sheet_name: str, cell_ref: str) -> Any:
        """
        Get the calculated value of a cell (not the formula).
        
        Uses xlwings to get the actual result after Excel calculates.
        """
        if XLWINGS_AVAILABLE:
            return self._get_value_xlwings(sheet_name, cell_ref)
        else:
            return self._get_value_openpyxl(sheet_name, cell_ref)
    
    def _get_value_xlwings(self, sheet_name: str, cell_ref: str) -> Any:
        """Get value using xlwings (accurate calculation)"""
        need_close = False
        if not self.xlwings_book:
            if not self.open_with_xlwings():
                return None
            need_close = True
        
        try:
            sheet = self.xlwings_book.sheets[sheet_name]
            value = sheet.range(cell_ref).value
            return value
            
        finally:
            if need_close:
                self.close_xlwings()
    
    def _get_value_openpyxl(self, sheet_name: str, cell_ref: str) -> Any:
        """Get value using openpyxl (may not have calculated values)"""
        import openpyxl
        
        wb = openpyxl.load_workbook(self.excel_path, data_only=True)
        ws = wb[sheet_name]
        value = ws[cell_ref].value
        wb.close()
        
        return value


# =============================================================================
# FACTORY
# =============================================================================

def create_excel_engine(excel_path: Path) -> ExcelEngine:
    """Factory function to create an ExcelEngine"""
    return ExcelEngine(excel_path)


def check_excel_engines() -> Dict[str, bool]:
    """Check which Excel engines are available"""
    return {
        'xlwings': XLWINGS_AVAILABLE,
        'calamine': CALAMINE_AVAILABLE,
        'openpyxl': OPENPYXL_AVAILABLE
    }

