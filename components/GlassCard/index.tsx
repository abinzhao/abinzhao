import type { ComponentPropsWithoutRef } from "react";

type GlassCardProps = ComponentPropsWithoutRef<"div">;

export function GlassCard({ className = "", ...props }: GlassCardProps) {
  return <div className={`glass-card ${className}`.trim()} {...props} />;
}
