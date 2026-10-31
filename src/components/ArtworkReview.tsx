import type { WorldEntity } from "../../shared/world";

export function ArtworkReview({ entities }: { entities: WorldEntity[] }) {
  const objects = entities.filter((e) => e.artMethod && e.art);
  if (!objects.length) return null;
  const precise = objects.filter((e) => e.artMethod === "sam").length;
  const paper = objects.filter((e) => e.artMethod === "paper").length;
  const crops = objects.filter((e) => e.artMethod === "crop").length;
  return (
    <details className="artwork-review" open>
      <summary>
        Your original artwork · {precise} precise{" "}
        {precise === 1 ? "cutout" : "cutouts"}
        {paper > 0 && ` · ${paper} paper ${paper === 1 ? "cutout" : "cutouts"}`}
        {crops > 0 && ` · ${crops} picture ${crops === 1 ? "crop" : "crops"}`}
      </summary>
      <p>
        Check each character and object. The checkered area is transparent;
        picture crops may still include their background.
      </p>
      <ul className="artwork-cutouts">
        {objects.map((e) => (
          <li key={e.id}>
            <div className="artwork-checker">
              <img src={e.art} alt={`${e.label || e.kind} cutout`} />
            </div>
            <strong>{e.label || e.kind}</strong>
            <span>
              {e.artMethod === "sam"
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
