import { profile } from "@/lib/profile";

export function AbilityMap() {
  return (
    <div className="ability-map" aria-label="以产品交付为中心的能力关系图">
      <div className="ability-orbit" aria-hidden="true" />
      <div className="ability-core">
        <span>赵建斌</span>
        <strong>产品交付</strong>
      </div>
      <ul>
        {profile.abilities.map((ability, index) => (
          <li key={ability} style={{ "--node-index": index } as React.CSSProperties}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {ability}
          </li>
        ))}
      </ul>
    </div>
  );
}
