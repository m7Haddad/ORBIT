"use client";

/* Weather widget — backend-cached Open-Meteo snapshot (kind: "weather"). */

import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Sun,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { WidgetProps } from "@/config/widgets.config";
import { useWeather } from "@/lib/hooks";

const conditionIcons: Record<string, LucideIcon> = {
  clear: Sun,
  partly_cloudy: Cloud,
  overcast: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  rain_showers: CloudRain,
  snow: CloudSnow,
  snow_showers: CloudSnow,
  thunderstorm: CloudLightning,
};

function conditionLabel(condition: string): string {
  return condition.replace(/_/g, " ");
}

export default function WeatherWidget(props: WidgetProps) {
  const weather = useWeather();

  if (weather.isLoading || !weather.data) {
    return (
      <div className="flex h-full flex-col justify-between">
        <div className="skeleton h-9 w-24" />
        <div className="skeleton h-4 w-32" />
      </div>
    );
  }

  const { current, forecast } = weather.data;
  const Icon = conditionIcons[current.condition] ?? Cloud;
  const showForecast = props.size === "2x2";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between">
        <div>
          <p className="tabular-nums text-3xl font-semibold tracking-tight text-primary">
            {Math.round(current.temperature_c)}
            <span className="ml-0.5 text-base font-normal text-secondary">°C</span>
          </p>
          <p className="mt-0.5 text-[11px] capitalize text-tertiary">
            {conditionLabel(current.condition)}
          </p>
        </div>
        <Icon size={30} strokeWidth={1.5} className="text-accent" />
      </div>

      <div className="mt-auto flex items-center gap-3 text-[11px] text-secondary">
        <span className="flex items-center gap-1">
          <Wind size={11} /> {Math.round(current.wind_kph)} km/h
        </span>
        <span>{Math.round(current.humidity_percent)}% rh</span>
      </div>

      {showForecast && (
        <div className="mt-3 grid grid-cols-5 gap-1 border-t border-subtle pt-3">
          {forecast.slice(0, 5).map((day) => {
            const DayIcon = conditionIcons[day.condition] ?? Cloud;
            return (
              <div key={day.date} className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-tertiary">
                  {new Date(day.date).toLocaleDateString(undefined, {
                    weekday: "short",
                  })}
                </span>
                <DayIcon size={14} className="text-secondary" />
                <span className="text-[10px] tabular-nums text-secondary">
                  {Math.round(day.max_c)}°
                  <span className="text-tertiary"> {Math.round(day.min_c)}°</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
