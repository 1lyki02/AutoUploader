import { cn } from "@/lib/utils";
import roadIcon from "@/assets/road-icon.png";

/** Compact ROAD mark for sidebar, activation, and header. */
export function RoadMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <img
      src={roadIcon}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={cn("shrink-0 rounded-[22%] object-cover", className)}
    />
  );
}
