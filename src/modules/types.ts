export interface WeatherData {
  location: string;
  current: {
    temp: number;
    feelsLike: number;
    condition: string;
    conditionEmoji: string;
    humidity: number;
    wind: { speed: number; direction: string };
  };
  forecast: Array<{
    date: string;
    high: number;
    low: number;
    condition: string;
    precipChance: number;
  }>;
  sunrise: string;
  sunset: string;
}

export interface CalendarData {
  events: Array<{
    title: string;
    start: string;
    end: string;
    location?: string;
    allDay: boolean;
    calendar: string;
  }>;
  totalCount: number;
}

export interface NewsData {
  feeds: Array<{
    name: string;
    items: Array<{
      title: string;
      link: string;
      date: string;
      summary: string;
    }>;
    error?: string;
  }>;
}

export interface RemindersData {
  lists: Array<{
    name: string;
    items: Array<{
      title: string;
      dueDate?: string;
      completed: boolean;
      priority: number;
    }>;
  }>;
  totalCount: number;
}

export interface BriefingResult {
  timestamp: string;
  weather?: WeatherData | { error: string };
  calendar?: CalendarData | { error: string };
  news?: NewsData | { error: string };
  reminders?: RemindersData | { error: string };
}

export interface ModuleError {
  error: string;
}

export function isModuleError(data: unknown): data is ModuleError {
  return typeof data === 'object' && data !== null && 'error' in data;
}
