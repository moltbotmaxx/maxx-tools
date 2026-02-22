import json
import os
import subprocess
from datetime import datetime

# Config
WORKSPACE = "/Users/maxx/.openclaw/workspace"
PROJECT_DIR = os.path.join(WORKSPACE, "projects", "maxx-tools", "smart-frame")
DATA_FILE = os.path.join(PROJECT_DIR, "data.json")
HTML_FILE = os.path.join(PROJECT_DIR, "index.html")
FTP_HOST = "192.168.100.12"
FTP_PORT = "2221"

# Weather code to emoji mapping
WEATHER_CODES = {
    0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
    45: "🌫️", 48: "🌫️",
    51: "🌦️", 53: "🌦️", 55: "🌧️",
    61: "🌧️", 63: "🌧️", 65: "🌧️",
    71: "❄️", 73: "❄️", 75: "❄️",
    80: "🌦️", 81: "🌧️", 82: "🌧️",
    95: "⛈️", 96: "⛈️", 99: "⛈️",
}

def code_to_icon(code):
    return WEATHER_CODES.get(code, "🌤️")

def code_to_condition(code):
    if code == 0: return "Cielo Despejado"
    elif code <= 3: return "Parcialmente Nublado"
    elif code <= 48: return "Niebla"
    elif code <= 55: return "Llovizna"
    elif code <= 65: return "Lluvia"
    elif code <= 75: return "Nieve"
    elif code <= 82: return "Chubascos"
    elif code >= 95: return "Tormenta"
    return "Variable"

def update():
    now = datetime.now().strftime("%H:%M")
    print(f"[{now}] Starting sync...")

    try:
        # Fetch weather with hourly data
        api_url = (
            'https://api.open-meteo.com/v1/forecast'
            '?latitude=10.0163&longitude=-84.2116'
            '&current=temperature_2m,wind_speed_10m,weather_code'
            '&hourly=temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m'
            '&daily=temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max'
            '&timezone=America/Costa_Rica'
            '&forecast_days=1'
        )
        res = subprocess.check_output(['curl', '-s', api_url], text=True)
        api = json.loads(res)
        
        # New API structure
        c = api['current']
        w = c # mapping for legacy code below if needed, or update below
        
        with open(DATA_FILE, 'r') as f:
            data = json.load(f)

        # Current weather
        data['weather']['temp_c'] = str(round(c['temperature_2m']))
        data['weather']['wind_kmh'] = str(round(c['wind_speed_10m']))
        data['weather']['condition'] = code_to_condition(c.get('weather_code', 0))

        # Daily data
        if 'daily' in api:
            daily = api['daily']
            data['weather']['max_temp_c'] = str(round(daily['temperature_2m_max'][0]))
            data['weather']['min_temp_c'] = str(round(daily['temperature_2m_min'][0]))
            data['weather']['uv_index'] = str(round(daily['uv_index_max'][0]))
            data['weather']['prob_rain'] = str(round(daily['precipitation_probability_max'][0]))

        # Feels like (apparent temperature at current hour)
        current_hour = datetime.now().hour
        if 'hourly' in api and 'apparent_temperature' in api['hourly']:
            feels = api['hourly']['apparent_temperature']
            if current_hour < len(feels):
                data['weather']['feels_like_c'] = str(round(feels[current_hour]))

        # Humidity from hourly
        if 'hourly' in api and 'relative_humidity_2m' in api['hourly']:
            hum = api['hourly']['relative_humidity_2m']
            if current_hour < len(hum):
                data['weather']['humidity'] = str(round(hum[current_hour]))

        # Hourly forecast (next 3 slots: +3h, +6h, +9h from now)
        if 'hourly' in api:
            hourly_temps = api['hourly'].get('temperature_2m', [])
            hourly_codes = api['hourly'].get('weather_code', [])
            hourly_times = api['hourly'].get('time', [])
            forecast = []
            for offset in [3, 6, 9]:
                idx = current_hour + offset
                if idx < len(hourly_temps) and idx < len(hourly_codes):
                    t = datetime.fromisoformat(hourly_times[idx])
                    forecast.append({
                        "time": t.strftime("%-I%p"),
                        "icon": code_to_icon(hourly_codes[idx]),
                        "temp": str(round(hourly_temps[idx]))
                    })
            if forecast:
                data['weather']['hourly_forecast'] = forecast

        # Update date and last update time
        data['maxx_status']['date'] = datetime.now().strftime("%A, %d %b").capitalize()
        data['maxx_status']['last_update_time'] = now

        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, indent=2)

        # Update HTML "last update" text
        with open(HTML_FILE, 'r') as f:
            content = f.read()

        import re
        content = re.sub(r'Last update: [\d:]+', f'Last update: {now}', content)
        # Update hardcoded temp for reliable screenshot
        content = re.sub(r'id="w-temp">[\d]+', f'id="w-temp">{data["weather"]["temp_c"]}', content)

        with open(HTML_FILE, 'w') as f:
            f.write(content)

    except Exception as e:
        print(f"Error updating data: {e}")

    print("Local files updated. Ready for screenshot and upload.")

if __name__ == "__main__":
    update()
