/* Icon-key vocabulary (rooms.icon / scenes.icon / palette) → lucide components.
 * One map, shared by sidebar, palette, and tiles. */

import {
  Activity,
  Bed,
  Briefcase,
  ChefHat,
  Cpu,
  DoorOpen,
  Film,
  Flower2,
  Home,
  Lamp,
  LayoutGrid,
  ListChecks,
  Moon,
  Settings,
  Sofa,
  Sparkles,
  Sun,
  Thermometer,
  Utensils,
  WashingMachine,
  Zap,
  type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  home: Home,
  sofa: Sofa,
  bed: Bed,
  briefcase: Briefcase,
  kitchen: ChefHat,
  dining: Utensils,
  laundry: WashingMachine,
  garden: Flower2,
  door: DoorOpen,
  lamp: Lamp,
  film: Film,
  moon: Moon,
  sun: Sun,
  zap: Zap,
  sparkles: Sparkles,
  thermometer: Thermometer,
  cpu: Cpu,
  activity: Activity,
  grid: LayoutGrid,
  list: ListChecks,
  settings: Settings,
};

export function iconFor(key: string | null | undefined, fallback: LucideIcon = Home): LucideIcon {
  return (key && icons[key]) || fallback;
}
