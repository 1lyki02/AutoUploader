import { useEffect, useState } from "react";

export interface AppPreferences {
  notifyOnDone: boolean;
  notifyOnFailed: boolean;
  openQueueOnStart: boolean;
}

const STORAGE_KEY = "autouploader.preferences";

const defaults: AppPreferences = {
  notifyOnDone: true,
  notifyOnFailed: true,
  openQueueOnStart: true,
};

export function loadPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) as Partial<AppPreferences> };
  } catch {
    return defaults;
  }
}

export function savePreferences(next: AppPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<AppPreferences>(defaults);

  useEffect(() => {
    setPreferences(loadPreferences());
  }, []);

  const update = (patch: Partial<AppPreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      savePreferences(next);
      return next;
    });
  };

  return { preferences, update };
}
