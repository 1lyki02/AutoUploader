import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fileName = (filePath: string) => filePath.split(/[\\/]/).pop() ?? filePath;
export const titleFromPath = (filePath: string) => fileName(filePath).replace(/\.[^.]+$/, "");
