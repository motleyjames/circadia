---
name: Data Visualization with Plotly
description: Interactive scientific and statistical visualization - 40+ chart types, dashboards, and exports
domains: [visualization, charts, plotly, dashboards, data-science, reporting]
keywords: [scatter, line, bar, heatmap, 3d, choropleth, candlestick, histogram, box-plot, dashboard]
when_to_use: When creating charts, plots, dashboards, or any data visualization
priority: high
max_tokens: 8000
---

# Data Visualization with Plotly

> **Philosophy**: Visualization is COMMUNICATION, not decoration. Every chart answers a question; every axis tells a story; every color has meaning.

## Key Mental Models

1. **Charts are ARGUMENTS** → What claim does this visualization support?
2. **Interactivity is EXPLORATION** → Let users answer their own follow-up questions
3. **Choose chart by QUESTION, not data** → "Distribution?" → histogram. "Relationship?" → scatter.
4. **Color is a LANGUAGE** → Red=bad, green=good, blue=neutral (or break convention deliberately)
5. **Less is MORE** → Remove everything that doesn't help answer the question

## Elevated Thinking Prompts

Before ANY visualization, ask:

1. **What's the ONE question** this chart answers?
2. **What's the TAKEAWAY?** Can someone understand it in 5 seconds?
3. **Am I LYING with this chart?** (truncated axes, cherry-picked ranges, misleading colors)
4. **Is interactivity HELPING or distracting?**
5. **What would CHANGE the user's mind?** Show that scenario too.
6. **Could this be a TABLE instead?** Sometimes numbers are clearer.

---

## Quick Start Decision Tree

```
What do you want to show?
│
├─ Distribution → histogram, box, violin
├─ Relationship → scatter, line, heatmap
├─ Comparison → bar, grouped bar, radar
├─ Composition → pie, sunburst, treemap, sankey
├─ Change over time → line, area, candlestick
├─ Geographic → choropleth, scatter_geo
├─ Hierarchical → sunburst, treemap, icicle
└─ 3D data → surface, scatter3d, mesh3d
```

---

## Core Patterns

### 1. Plotly Express (Quick & Standard)

```python
import plotly.express as px
import pandas as pd

# One-liner visualizations
fig = px.scatter(df, x='x', y='y', color='category', size='value',
                 trendline='ols', title='Relationship Analysis')
fig.show()

# Faceted (small multiples)
fig = px.scatter(df, x='x', y='y', facet_col='category', facet_row='year')

# Animated
fig = px.scatter(df, x='gdp', y='life_exp', animation_frame='year',
                 size='pop', color='continent', hover_name='country')
```

### 2. Graph Objects (Full Control)

```python
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# Multi-panel dashboard
fig = make_subplots(rows=2, cols=2,
    subplot_titles=('Revenue', 'Costs', 'Margin', 'Growth'),
    specs=[[{'type': 'bar'}, {'type': 'bar'}],
           [{'type': 'scatter'}, {'type': 'indicator'}]])

fig.add_trace(go.Bar(x=dates, y=revenue, name='Revenue'), row=1, col=1)
fig.add_trace(go.Scatter(x=dates, y=margin, mode='lines+markers'), row=2, col=1)
fig.add_trace(go.Indicator(mode='gauge+number', value=growth_rate), row=2, col=2)

fig.update_layout(height=800, showlegend=False)
```

### 3. Financial Charts

```python
# Candlestick
fig = go.Figure(data=[go.Candlestick(
    x=df['date'],
    open=df['open'], high=df['high'],
    low=df['low'], close=df['close']
)])
fig.update_xaxes(rangeslider_visible=True)

# Waterfall (bridge charts)
fig = go.Figure(go.Waterfall(
    x=['Start', 'Revenue', 'Costs', 'Tax', 'End'],
    y=[100, 50, -30, -10, None],
    measure=['absolute', 'relative', 'relative', 'relative', 'total']
))
```

### 4. Statistical Distributions

```python
# Histogram with marginal box plot
fig = px.histogram(df, x='values', color='group',
                   marginal='box', nbins=50, barmode='overlay',
                   opacity=0.7)

# Violin plots (distribution + density)
fig = px.violin(df, x='category', y='value', box=True, points='all')

# 2D density (for large datasets)
fig = px.density_contour(df, x='x', y='y', marginal_x='histogram')
```

---

## Export Patterns

```python
# Interactive HTML (self-contained)
fig.write_html('chart.html')

# Static images (requires kaleido)
fig.write_image('chart.png', scale=2)  # 2x resolution
fig.write_image('chart.pdf')  # Vector
fig.write_image('chart.svg')  # Editable vector

# Embed in reports
html_div = fig.to_html(full_html=False, include_plotlyjs='cdn')
```

---

## Novel Applications (2030 Thinking)

### 1. Charts That ARGUE Back
```python
# Highlight what challenges the user's assumption
fig.add_annotation(
    x=outlier_x, y=outlier_y,
    text="⚠️ This point contradicts your hypothesis",
    showarrow=True
)
```

### 2. Confidence Visualization
```python
# Show uncertainty, not just point estimates
fig.add_trace(go.Scatter(
    x=dates, y=forecast,
    mode='lines', name='Forecast'
))
fig.add_trace(go.Scatter(
    x=dates + dates[::-1],
    y=upper_bound + lower_bound[::-1],
    fill='toself', name='90% CI',
    fillcolor='rgba(0,100,200,0.2)'
))
```

### 3. Progressive Disclosure
```python
# Start simple, let user drill down
fig.update_layout(
    updatemenus=[{
        'buttons': [
            {'label': 'Summary', 'method': 'update', 'args': [{'visible': [True, False, False]}]},
            {'label': 'Details', 'method': 'update', 'args': [{'visible': [True, True, False]}]},
            {'label': 'Raw Data', 'method': 'update', 'args': [{'visible': [True, True, True]}]}
        ]
    }]
)
```

### 4. Auto-Generated Insights
```python
# Let the chart tell you what's interesting
insights = analyze_chart_data(df)
for insight in insights:
    fig.add_annotation(text=insight.text, x=insight.x, y=insight.y)
# "📈 Revenue grew 23% YoY"
# "⚠️ Margin declining for 3 consecutive quarters"
```

---

## Chart Type Quick Reference

| Question | Chart Type | Plotly Express |
|----------|------------|----------------|
| How is X distributed? | Histogram | `px.histogram(df, x='x')` |
| How do X and Y relate? | Scatter | `px.scatter(df, x='x', y='y')` |
| How does X change over time? | Line | `px.line(df, x='date', y='value')` |
| How do categories compare? | Bar | `px.bar(df, x='category', y='value')` |
| What's the composition? | Pie/Sunburst | `px.sunburst(df, path=['a','b'], values='v')` |
| How do things flow? | Sankey | `go.Sankey(node=..., link=...)` |
| What's the geographic pattern? | Choropleth | `px.choropleth(df, locations='iso', color='value')` |
| What's the 3D surface? | Surface | `go.Surface(z=matrix)` |

---

## Styling Templates

```python
# Built-in themes
fig.update_layout(template='plotly_dark')  # Dark mode
fig.update_layout(template='plotly_white')  # Clean white
fig.update_layout(template='ggplot2')       # R-style
fig.update_layout(template='seaborn')       # Seaborn-style

# Custom brand colors
fig.update_layout(
    colorway=['#1f77b4', '#ff7f0e', '#2ca02c'],  # Your brand palette
    font=dict(family='Inter', size=14),
    title_font_size=24
)
```

---

## Integration with Dash (Web Apps)

```python
import dash
from dash import dcc, html, callback, Input, Output

app = dash.Dash(__name__)

app.layout = html.Div([
    dcc.Dropdown(id='metric', options=['Revenue', 'Profit', 'Growth']),
    dcc.Graph(id='chart')
])

@callback(Output('chart', 'figure'), Input('metric', 'value'))
def update_chart(metric):
    return px.line(df, x='date', y=metric)

app.run_server(debug=True)
```

---

## Tool Composability

| Need | Tool | Integration |
|------|------|-------------|
| Data wrangling | pandas | `fig = px.scatter(df, ...)` |
| Statistical tests | scipy | Add p-values as annotations |
| ML predictions | scikit-learn | Plot predictions with confidence |
| Geographic data | geopandas | `px.choropleth_mapbox(gdf, ...)` |
| Export to PDF | reportlab | Embed `fig.to_image()` |
| Animate | ffmpeg | `fig.write_html()` → record |

---

*"The purpose of visualization is insight, not pictures." — Ben Shneiderman* 🔵
