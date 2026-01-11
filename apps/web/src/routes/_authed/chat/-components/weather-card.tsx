import { Cloud, CloudRain, Sun, CloudSun, Snowflake, Wind, Droplets, Thermometer, Eye } from "lucide-react";
import type { WeatherData } from "./generative-ui/weather";

// Re-export for convenience
export type { WeatherData } from "./generative-ui/weather";

function getWeatherIcon(condition: string) {
  const lower = condition.toLowerCase();
  
  if (lower.includes("rain") || lower.includes("drizzle") || lower.includes("shower")) {
    return <CloudRain className="h-12 w-12 text-blue-400" />;
  }
  if (lower.includes("snow") || lower.includes("sleet") || lower.includes("ice")) {
    return <Snowflake className="h-12 w-12 text-blue-200" />;
  }
  if (lower.includes("clear") || lower.includes("sunny")) {
    return <Sun className="h-12 w-12 text-yellow-400" />;
  }
  if (lower.includes("partly") || (lower.includes("cloudy") && lower.includes("sun"))) {
    return <CloudSun className="h-12 w-12 text-gray-300" />;
  }
  if (lower.includes("overcast") || lower.includes("cloud")) {
    return <Cloud className="h-12 w-12 text-gray-400" />;
  }
  
  return <Cloud className="h-12 w-12 text-gray-400" />;
}

export function WeatherCard({ data }: { data: WeatherData }) {
  const windUnit = data.unit === "F" ? "mph" : "km/h";
  const visUnit = data.unit === "F" ? "mi" : "km";
  
  return (
    <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 p-4 my-2 max-w-sm">
      {/* Header with location and main temp */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg">{data.location}</h3>
          <p className="text-muted-foreground text-sm">{data.condition}</p>
        </div>
        {getWeatherIcon(data.condition)}
      </div>
      
      {/* Main temperature */}
      <div className="flex items-baseline gap-1 mb-4">
        <span className="text-4xl font-bold">{data.temperature}°</span>
        <span className="text-xl text-muted-foreground">{data.unit}</span>
      </div>
      
      {/* Details grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <Thermometer className="h-4 w-4 text-orange-400" />
          <span className="text-muted-foreground">Feels like</span>
          <span className="ml-auto font-medium">{data.feelsLike}°</span>
        </div>
        
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4 text-blue-400" />
          <span className="text-muted-foreground">Humidity</span>
          <span className="ml-auto font-medium">{data.humidity}%</span>
        </div>
        
        <div className="flex items-center gap-2">
          <Wind className="h-4 w-4 text-teal-400" />
          <span className="text-muted-foreground">Wind</span>
          <span className="ml-auto font-medium">{data.windSpeed} {windUnit} {data.windDirection}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-gray-400" />
          <span className="text-muted-foreground">Visibility</span>
          <span className="ml-auto font-medium">{data.visibility} {visUnit}</span>
        </div>
      </div>
      
      {/* UV Index badge if notable */}
      {data.uvIndex > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center gap-2 text-sm">
            <Sun className="h-4 w-4 text-yellow-500" />
            <span className="text-muted-foreground">UV Index</span>
            <span className={`ml-auto font-medium ${
              data.uvIndex <= 2 ? "text-green-500" :
              data.uvIndex <= 5 ? "text-yellow-500" :
              data.uvIndex <= 7 ? "text-orange-500" :
              "text-red-500"
            }`}>
              {data.uvIndex} ({
                data.uvIndex <= 2 ? "Low" :
                data.uvIndex <= 5 ? "Moderate" :
                data.uvIndex <= 7 ? "High" :
                "Very High"
              })
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
