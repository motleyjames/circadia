"""
Finance Domain Module - Financial Modeling Tools

Provides DCF valuation, sensitivity analysis, Monte Carlo simulation,
and scenario planning capabilities.

Usage:
    from tools_core.domain.finance import DCFModel, SensitivityAnalyzer
    
    model = DCFModel("CompanyName")
    model.set_assumptions(...)
    result = model.calculate()
"""

from .dcf_model import DCFModel
from .sensitivity_analysis import SensitivityAnalyzer

__all__ = [
    'DCFModel',
    'SensitivityAnalyzer',
]
