import type { WorldEntity } from "../../shared/world";

export function ArtworkReview({ entities }: { entities: WorldEntity[] }) {
  const objects = entities.filter((e) => e.artMethod && e.art);
  if (!objects.length) return null;
  const precise = objects.filter((e) => e.artMethod === "sam").length;
  const paper = objects.length - precise;
  return (
    <details className="artwork-review" open>
      <summary>
        Your original artwork · {precise} precise{" "}
        {precise === 1 ? "cutout" : "cutouts"}
        {paper > 0 && ` · ${paper} paper ${paper === 1 ? "cutout" : "cutouts"}`}
      </summary>
      <p>
        Check that each character and object kept the outline you drew. The
        checkered area is transparent.
      </p>
      <ul className="artwork-cutouts">
        {objects.map((e) => (
          <li key={e.id}>
            <div className="artwork-checker">
              <img src={e.art} alt={`${e.label || e.kind} cutout`} />
            </div>
            <strong>{e.label || e.kind}</strong>
            <span>
              {e.artMethod === "sam" ? "Precise cutout" : "Paper cutout"}
            </span>
            <p>{e.artNote}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
