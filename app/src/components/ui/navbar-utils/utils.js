import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn's class-name helper: join conditional classes and let later Tailwind classes win. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
