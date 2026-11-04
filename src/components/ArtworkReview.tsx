import type { WorldEntity } from "../../shared/world";

export function ArtworkReview({ entities }: { entities: WorldEntity[] }) {
  const objects = entities.filter((e) => e.artMethod && e.art);
  if (!objects.length) return null;
  const precise = objects.filter((e) => e.artMethod === "sam").length;
  return (
    <details className="artwork-review">
      <summary>
        Original artwork · {objects.length} objects · {precise} precise cutouts
      </summary>
      <ul className="artwork-cutouts">
        {objects.map((e) => (
          <li key={e.id}>
            <div className="artwork-checker">
              <img src={e.art} alt={`${e.label || e.kind} cutout`} />
            </div>
            <strong>{e.label || e.kind}</strong>
            <span>
              {e.artMethod === "outline"
                ? "Outline confirmed by you"
                : e.artMethod === "sam"
                ? "Precise cutout"
                : e.artMethod === "crop"
                  ? e.artShape === "ellipse"
                    ? "Oval crop · chosen by you"
                    : "Picture crop · background included"
                  : "Paper cutout"}
            </span>
            <p>{e.artNote}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
