---
name: Financial Modeling - DCF, Monte Carlo, Sensitivity Analysis
description: Investment analysis, valuation, and risk assessment using industry-standard methodologies
domains: [finance, valuation, dcf, monte-carlo, investment, modeling]
keywords: [dcf, wacc, npv, irr, sensitivity, scenario, lbo, m&a, valuation, cash-flow]
when_to_use: When building financial models, valuations, investment analysis, or risk assessments
priority: high
max_tokens: 6000
---

# Financial Modeling Suite

> **Philosophy**: Financial models are HYPOTHESIS GENERATORS. Every assumption is testable; every output has confidence intervals; every model should answer "what could go wrong?"

## Key Mental Models

1. **DCF is a CONFIDENCE INTERVAL, not a number** → Always report ranges, never point estimates
2. **Assumptions are HYPOTHESES** → Track them, test them, version them
3. **Monte Carlo reveals CORRELATION risk** → Uncorrelated inputs become correlated outputs under stress
4. **Sensitivity analysis finds CLIFFS** → Where small changes cause catastrophic outcomes
5. **Every model is WRONG** → The question is "how wrong?" and "does it matter?"

## Elevated Thinking Prompts

Before ANY financial analysis, ask:

1. **What's the BIGGEST assumption?** Test it with 3x and 0.3x scenarios.
2. **Where's the CLIFF?** At what input value does the decision flip?
3. **What would KILL this deal?** Model the death scenarios explicitly.
4. **Is my WACC defensible?** Can I justify every component?
5. **What's NOT in the model?** Regulatory risk? Key person risk? Technology obsolescence?
6. **Who benefits from which assumptions?** Watch for motivated reasoning.

---

## Core Capabilities

### 1. Discounted Cash Flow (DCF) Analysis

```python
from tools_core.domain.finance.dcf_model import DCFModel

model = DCFModel(
    revenue_growth=[0.15, 0.12, 0.10, 0.08, 0.05],  # 5-year forecast
    ebitda_margin=0.25,
    capex_percent=0.05,
    nwc_percent=0.10,
    tax_rate=0.25,
    wacc=0.10,
    terminal_growth=0.025
)

result = model.calculate()
print(f"Enterprise Value: ${result.enterprise_value:,.0f}")
print(f"Implied EV/EBITDA: {result.ev_ebitda:.1f}x")
```

**Output includes:**
- Free cash flow projections
- Terminal value (both perpetuity growth and exit multiple)
- Enterprise value bridge
- Sensitivity to WACC and terminal growth

### 2. Sensitivity Analysis

```python
from tools_core.domain.finance.sensitivity_analysis import SensitivityAnalyzer

analyzer = SensitivityAnalyzer(base_model)

# Two-way sensitivity table
table = analyzer.two_way(
    var1=("wacc", [0.08, 0.09, 0.10, 0.11, 0.12]),
    var2=("terminal_growth", [0.01, 0.02, 0.025, 0.03, 0.035]),
    output="enterprise_value"
)

# Tornado chart - find the biggest drivers
tornado = analyzer.tornado(
    variables=["revenue_growth", "ebitda_margin", "wacc", "terminal_growth"],
    swing_percent=0.20  # +/- 20% each variable
)
```

### 3. Monte Carlo Simulation

```python
from tools_core.domain.finance.dcf_model import monte_carlo_dcf

results = monte_carlo_dcf(
    base_model=model,
    distributions={
        "revenue_growth": ("normal", 0.10, 0.03),  # mean, std
        "ebitda_margin": ("triangular", 0.20, 0.25, 0.30),  # min, mode, max
        "wacc": ("uniform", 0.08, 0.12),  # min, max
    },
    iterations=10000,
    correlation_matrix=correlation_matrix  # Optional
)

print(f"Mean EV: ${results.mean:,.0f}")
print(f"5th percentile: ${results.percentile(5):,.0f}")
print(f"95th percentile: ${results.percentile(95):,.0f}")
print(f"Probability EV > $100M: {results.prob_above(100_000_000):.1%}")
```

### 4. Scenario Planning

```python
scenarios = {
    "bull": {"revenue_growth": 0.20, "ebitda_margin": 0.30, "probability": 0.25},
    "base": {"revenue_growth": 0.12, "ebitda_margin": 0.25, "probability": 0.50},
    "bear": {"revenue_growth": 0.05, "ebitda_margin": 0.18, "probability": 0.20},
    "disaster": {"revenue_growth": -0.10, "ebitda_margin": 0.10, "probability": 0.05}
}

expected_value = sum(
    calc_ev(s) * s["probability"] for s in scenarios.values()
)
```

---

## Model Types Supported

| Model Type | Use Case | Key Outputs |
|------------|----------|-------------|
| Corporate DCF | Mature companies | EV, equity value, implied multiples |
| Growth DCF | High-growth startups | When profitable, implied exit multiple |
| LBO | Private equity | IRR, MOIC, debt paydown schedule |
| M&A | Acquisitions | Accretion/dilution, synergy value |
| Project Finance | Infrastructure | Project IRR, DSCR, payback period |

---

## Novel Applications (2030 Thinking)

### 1. Model Versioning as Git
```bash
# Every assumption change is a commit
git diff models/deal_v1.json models/deal_v2.json
# "Changed revenue growth from 15% to 12% based on Q3 actuals"
```

### 2. Assumption Provenance Tracking
```json
{
  "wacc": {
    "value": 0.10,
    "source": "Bloomberg WACC estimate as of 2026-01-15",
    "confidence": 0.85,
    "last_verified": "2026-01-15",
    "decay_model": "stable"
  }
}
```

### 3. Automated Stress Testing
```python
# Run regulatory stress scenarios automatically
stress_scenarios = load_fed_stress_test_scenarios()
for scenario in stress_scenarios:
    result = model.run_with_scenario(scenario)
    if result.equity_value < 0:
        alert(f"FAILS {scenario.name}")
```

### 4. Model ↔ Reality Feedback Loop
```python
# Track forecast accuracy over time
model.compare_to_actuals(actual_revenue_2025)
# "Model predicted $50M, actual was $47M (-6%)"
# Auto-adjust confidence in similar future forecasts
```

---

## Tool Integration

| Task | Tool | Example |
|------|------|---------|
| Financial data | yfinance | `yf.Ticker("AAPL").financials` |
| Spreadsheet output | openpyxl | `model.export_excel("dcf.xlsx")` |
| Visualization | plotly | `analyzer.tornado_chart().show()` |
| PDF report | reportlab | `model.generate_report("memo.pdf")` |

---

## Quality Checks (Auto-Performed)

1. ✅ Balance sheet balances
2. ✅ Cash flow reconciles to balance sheet changes
3. ✅ Circular references resolved (debt interest → cash → debt paydown)
4. ✅ Terminal value sanity check (not > 80% of total value)
5. ✅ WACC components sum correctly
6. ✅ Growth rate < WACC for terminal value (perpetuity)

---

## Limitations & Disclaimers

- Models are only as good as their assumptions
- Past performance doesn't guarantee future results
- Market conditions can change rapidly
- **NOT a substitute for professional financial advice**
- Professional judgment required for interpretation

---

*"All models are wrong, but some are useful." — George Box* 🔵
