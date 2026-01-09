---
summary: "Get weather information using wttr.in"
tags: [weather, utilities]
---

# Weather Skill

Get current weather conditions and forecasts using wttr.in.

## Usage

### Current Weather (Simple)
```bash
curl -m 5 -s "https://wttr.in/Pittsburgh?format=3"
```

### Current Weather (Detailed)
```bash
curl -m 5 -s "https://wttr.in/Pittsburgh?format=%l:+%C+%t+(feels+like+%f),+%w+wind,+%h+humidity"
```

### Short Forecast
```bash
curl -m 5 -s "https://wttr.in/Pittsburgh?format=1"
```

### Full Report
```bash
curl -m 5 -s "https://wttr.in/Pittsburgh?0"
```

## Format Codes

- `%l` - Location name
- `%C` - Weather condition
- `%t` - Temperature
- `%f` - Feels like temperature
- `%w` - Wind speed and direction
- `%h` - Humidity
- `%m` - Moon phase
- `%p` - Precipitation

## Tips

- Always use `-m 5` timeout (wttr.in can be slow)
- Use `-s` for silent mode (no progress bars)
- Default location is auto-detected by IP
- Can specify city: `Pittsburgh`, `New+York`, etc.
- Add `?0` for no ANSI colors in terminal output

## Examples

```bash
# Quick check
curl -m 5 -s "https://wttr.in/Pittsburgh?format=3"

# Detailed one-liner
curl -m 5 -s "https://wttr.in/Pittsburgh?format=%C+%t,+wind+%w"

# 3-day forecast
curl -m 5 -s "https://wttr.in/Pittsburgh?format=1"
```
