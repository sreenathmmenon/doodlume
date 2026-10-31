import Phaser from "phaser";
import type { WorldDefinition } from "../../shared/world";

// Authored procedural scenery: the player's source artwork remains the foreground.
const themes = {
  grove: {
    sky: ["#071e27", "#234951", "#8b9d77"],
    light: "#f9d99b",
    ridge: ["#25454c", "#23464b", "#163b40"],
    trunk: "#102f35",
    leaf: "#315e57",
    spark: 0xffdf93,
  },
  moon: {
    sky: ["#11152f", "#353a66", "#8b85a2"],
    light: "#dfdeff",
    ridge: ["#42486c", "#323b61", "#232e50"],
    trunk: "#192340",
    leaf: "#4a537c",
    spark: 0xddd5ff,
  },
  sunset: {
    sky: ["#322535", "#9b5d62", "#e4aa7b"],
    light: "#ffe3ac",
    ridge: ["#9a6570", "#805563", "#573b4b"],
    trunk: "#3a2e40",
    leaf: "#8d6470",
    spark: 0xffdb9d,
  },
};

export function createAtmosphere(
  scene: Phaser.Scene,
  theme: WorldDefinition["theme"],
  reduced: boolean,
) {
  const p = themes[theme];
  let seed = 28371;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const canvasLayer = (
    key: string,
    depth: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
    scroll = 1,
  ) => {
    const t = scene.textures.createCanvas(key, 1440, 820)!;
    draw(t.context);
    t.refresh();
    return scene.add
      .image(720, 410, key)
      .setDepth(depth)
      .setScrollFactor(scroll, 1);
  };
  canvasLayer(
    "atmosphere-sky",
    -10,
    (ctx) => {
      const sky = ctx.createLinearGradient(0, 0, 0, 820);
      p.sky.forEach((c, i) => sky.addColorStop(i / 2, c));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 1440, 820);
      const glow = ctx.createRadialGradient(1030, 225, 5, 1030, 225, 570);
      glow.addColorStop(0, `${p.light}80`);
      glow.addColorStop(0.22, `${p.light}30`);
      glow.addColorStop(1, `${p.light}00`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 1440, 820);
      ctx.fillStyle = p.light;
      ctx.beginPath();
      ctx.arc(1030, 225, theme === "moon" ? 46 : 36, 0, Math.PI * 2);
      ctx.fill();
      // Fine scattered stars and dust are deterministic, with no per-frame noise.
      for (let i = 0; i < 160; i++) {
        ctx.globalAlpha = random() * (theme === "moon" ? 0.7 : 0.24);
        ctx.fillStyle = p.light;
        ctx.beginPath();
        ctx.arc(
          random() * 1440,
          random() * 510,
          0.5 + random() * 1.4,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    0.12,
  );
  for (let layer = 0; layer < 3; layer++) {
    canvasLayer(
      `atmosphere-ridge-${layer}`,
      -8 + layer,
      (ctx) => {
        const base = 425 + layer * 83;
        ctx.fillStyle = p.ridge[layer];
        ctx.beginPath();
        ctx.moveTo(-100, 900);
        for (let x = -100; x <= 1540; x += 12) {
          ctx.lineTo(
            x,
            base +
              Math.sin(x / (145 + layer * 53) + layer * 2) * (58 + layer * 9) +
              Math.sin(x / 61) * 14,
          );
        }
        ctx.lineTo(1540, 900);
        ctx.fill();
        // Each environment has its own silhouette language, at the same world scale.
        for (let i = 0; i < 9; i++) {
          const x = i * 191 + random() * 75;
          const y =
            base +
            Math.sin(x / (145 + layer * 53) + layer * 2) * (58 + layer * 9);
          const h = 80 + random() * (135 + layer * 25);
          if (theme === "sunset") {
            const w = 32 + random() * 50;
            ctx.beginPath();
            ctx.moveTo(x - w, y + 80);
            ctx.lineTo(x - w * 0.7, y - h * 0.7);
            ctx.lineTo(x - w * 0.3, y - h);
            ctx.lineTo(x + w * 0.65, y - h + 12);
            ctx.lineTo(x + w * 0.8, y - h * 0.45);
            ctx.lineTo(x + w, y + 80);
            ctx.fill();
            ctx.strokeStyle = p.sky[1];
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.3;
            for (let seam = 0; seam < 4; seam++) {
              const sy = y - h * 0.6 + seam * 25;
              ctx.beginPath();
              ctx.moveTo(x - w * 0.6, sy);
              ctx.lineTo(x + w * 0.65, sy - 6);
              ctx.stroke();
            }
            ctx.globalAlpha = 1;
            continue;
          }
          if (theme === "moon") {
            const w = 38 + random() * 26;
            ctx.fillRect(x - w / 2, y - h, w, h + 65);
            ctx.beginPath();
            ctx.arc(x, y - h, w / 2, Math.PI, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = p.light;
            ctx.globalAlpha = 0.2;
            ctx.fillRect(x - 3, y - h + 20, 6, 19);
            ctx.globalAlpha = 1;
            ctx.fillStyle = p.ridge[layer];
            ctx.strokeStyle = p.ridge[layer];
            ctx.lineWidth = 9;
            ctx.beginPath();
            ctx.arc(x + 70, y - 32, 48, Math.PI, Math.PI * 2);
            ctx.stroke();
            ctx.fillRect(x + 18, y - 32, 9, 100);
            ctx.fillRect(x + 113, y - 32, 9, 100);
            continue;
          }
          ctx.strokeStyle = p.ridge[layer];
          ctx.lineWidth = 8 + layer * 3;
          ctx.beginPath();
          ctx.moveTo(x, y + 50);
          ctx.quadraticCurveTo(x - 20, y - h / 2, x + 8, y - h);
          ctx.stroke();
          for (let b = 0; b < 7; b++) {
            const side = b % 2 ? 1 : -1,
              by = y - h + (b * h) / 8;
            ctx.beginPath();
            ctx.moveTo(x, by + 25);
            ctx.lineTo(x + side * (20 + b * 5), by - 10);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(
              x + side * (22 + b * 5),
              by - 12,
              26 + b * 2,
              13,
              side * 0.3,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        }
      },
      0.28 + layer * 0.22,
    );
  }
  canvasLayer(
    "atmosphere-light",
    -3,
    (ctx) => {
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 5; i++) {
        const x = 550 + i * 180;
        const ray = ctx.createLinearGradient(x, 0, x - 210, 820);
        ray.addColorStop(0, `${p.light}00`);
        ray.addColorStop(0.4, `${p.light}10`);
        ray.addColorStop(1, `${p.light}00`);
        ctx.fillStyle = ray;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 37, 0);
        ctx.lineTo(x - 190, 820);
        ctx.lineTo(x - 360, 820);
        ctx.fill();
      }
    },
    0.65,
  );
  canvasLayer("atmosphere-frame", 28, (ctx) => {
    const shade = ctx.createLinearGradient(0, 695, 0, 820);
    shade.addColorStop(0, `${p.trunk}00`);
    shade.addColorStop(1, `${p.trunk}ee`);
    ctx.fillStyle = shade;
    ctx.fillRect(0, 695, 1440, 125);
    // Edge foliage frames the stage without hiding the playable surfaces.
    for (const side of [0, 1440]) {
      for (let i = 0; i < 19; i++) {
        const x = side + (side ? -1 : 1) * random() * 95,
          y = 755 + random() * 75;
        ctx.strokeStyle = p.trunk;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 840);
        ctx.quadraticCurveTo(x + 10, y, x + 32, y - 35);
        ctx.stroke();
        ctx.fillStyle = i % 3 ? p.trunk : p.leaf;
        ctx.beginPath();
        ctx.ellipse(x + 20, y, 22, 7, -0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  canvasLayer("atmosphere-vignette", 29, (ctx) => {
    const vignette = ctx.createRadialGradient(720, 400, 280, 720, 400, 840);
    vignette.addColorStop(0, "#06162200");
    vignette.addColorStop(1, "#06162280");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, 1440, 820);
  }).setScrollFactor(0);
  if (!reduced)
    for (let i = 0; i < 22; i++) {
      const x = random() * 1440,
        y = 260 + random() * 420;
      const mote = scene.add
        .circle(x, y, 1.2 + random() * 1.7, p.spark, 0.4)
        .setDepth(6);
      scene.tweens.add({
        targets: mote,
        x: x + 25,
        y: y - 42,
        alpha: 0.05,
        duration: 3000 + random() * 4000,
        delay: random() * 2000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
}
