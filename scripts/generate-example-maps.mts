import { readFile, writeFile } from "node:fs/promises";
import { EXAMPLES } from "../src/lib/examples.ts";
import type { WorldEntity } from "../shared/world.ts";

const escape = (text: string) =>
  text.replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!,
  );
for (const world of EXAMPLES) {
  const colors =
    world.theme === "moon"
      ? ["#e9e4f1", "#776989", "#b5a4cb"]
      : world.theme === "sunset"
        ? ["#f4e5d7", "#8c6250", "#d4ae8c"]
        : ["#e5ebd7", "#5b7152", "#abc28c"];
  const shapes: string[] = [];
  async function entity(e: WorldEntity) {
    if (e.art) {
      const svg = await readFile(
        new URL(`../public${e.art}`, import.meta.url),
        "utf8",
      );
      const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 100 100";
      const contents = svg
        .replace(/^.*?<svg[^>]*>/s, "")
        .replace(/<\/svg>\s*$/, "");
      shapes.push(
        `<svg x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" viewBox="${viewBox}">${contents}</svg>`,
      );
    } else if (e.kind === "terrain" || e.kind === "bridge") {
      shapes.push(
        `<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="3" fill="${e.kind === "bridge" ? "#d7ba91" : colors[0]}" stroke="${colors[1]}" stroke-width="3"/>`,
      );
      if (e.kind === "bridge")
        for (let x = e.x + 12; x < e.x + e.width; x += 20)
          shapes.push(`<path d="M${x} ${e.y}v${e.height}" stroke="#8c7157"/>`);
    } else if (e.kind === "gate") {
      shapes.push(
        `<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="8" fill="${colors[2]}" fill-opacity=".65" stroke="${colors[1]}" stroke-width="3"/>`,
      );
    } else if (e.kind === "lever") {
      shapes.push(
        `<path d="M${e.x} ${e.y + e.height}h${e.width}M${e.x + e.width / 2} ${e.y + e.height}L${e.x + 8} ${e.y + 12}" stroke="${colors[1]}" stroke-width="6" fill="none"/><circle cx="${e.x + 8}" cy="${e.y + 12}" r="8" fill="#d9b77d"/>`,
      );
      const target = world.entities.find((item) => item.id === e.targetId)!;
      shapes.push(
        `<path d="M${e.x + e.width / 2} ${e.y - 14}Q${(e.x + target.x) / 2} ${Math.min(e.y, target.y) - 60} ${target.x + target.width / 2} ${target.y - 9}" stroke="${colors[1]}" stroke-width="2" stroke-dasharray="6 6" fill="none" marker-end="url(#arrow)"/>`,
      );
    }
    if (
      ["lever", "gate", "goal"].includes(e.kind) ||
      world.goalRules?.requiredCollectedIds.includes(e.id)
    ) {
      shapes.push(
        `<text x="${e.x + e.width / 2}" y="${e.y - 15}" text-anchor="middle" font-size="16" fill="#39483d">${escape(e.label ?? e.kind)}</text>`,
      );
    }
  }
  for (const e of world.entities) await entity(e);
  const extras =
    world.id === "willow-grove"
      ? '<text x="1000" y="270" text-anchor="middle" font-size="22" fill="#607052">Optional upper garden</text>'
      : world.id === "moon-mail"
        ? '<text x="850" y="250" text-anchor="middle" font-size="22" fill="#756586">High switch opens the ground route</text>'
        : '<path d="M450 684H1000" stroke="#a36d4c" stroke-width="4" stroke-dasharray="14 12"/><text x="725" y="650" text-anchor="middle" font-size="21" fill="#805d48">Suggested edit: add a bridge here</text><path d="M505 775V940M530 930l-25 24-25-24" fill="none" stroke="#9a735b" stroke-width="3"/><text x="625" y="870" text-anchor="middle" font-size="21" fill="#805d48">Existing lower trail →</text>';
  const lines: string[] = [""];
  for (const word of world.description.split(" ")) {
    const last = lines.length - 1;
    if (lines[last].length + word.length > 112) lines.push(word);
    else lines[last] += `${lines[last] ? " " : ""}${word}`;
  }
  const description = lines
    .map(
      (line, index) =>
        `<text x="55" y="${103 + index * 25}" font-size="19" fill="#4e6050">${escape(line)}</text>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${world.width} ${world.height}"><title>${escape(world.name)} — authored challenge map</title><desc>Authored example schematic matching this world. Original character, collectible and destination artwork is reused unchanged. Dashed bridge in the canyon is a suggested edit, not an existing object. This is not a model interpretation.</desc><rect width="100%" height="100%" fill="#fffdf5"/><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3 0 6" fill="none" stroke="${colors[1]}" stroke-width="1.5"/></marker></defs><g font-family="system-ui,sans-serif"><text x="55" y="65" font-size="36" font-weight="650" fill="#35473a">${escape(world.name)}</text>${description}<text x="55" y="${138 + (lines.length - 1) * 25}" font-size="15" fill="#64705e">Authored challenge map · example, not an AI interpretation</text>${extras}${shapes.join("")}</g></svg>\n`;
  await writeFile(
    new URL(`../public${world.sourceImage}`, import.meta.url),
    svg,
  );
}
