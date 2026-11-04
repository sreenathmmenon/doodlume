import assert from "node:assert/strict";
import test from "node:test";
import { artworkRasterSize, artworkFootPadding, artworkFootOffset, carriedArtworkPosition, attachedPlayerArtwork } from "./artwork-raster.ts";
import {
  containArtwork,
  imageDirection,
  sourceColorField,
} from "./image-direction.ts";

test("SVG raster budgets preserve normal artwork and bound extreme display sizes without aspect distortion", () => {
  assert.deepEqual(artworkRasterSize(79, 95), { width: 237, height: 285 });
  for (const [width, height] of [
    [12020, 5020],
    [5020, 12020],
    [2048, 2048],
    [12020, 4],
    [4, 12020],
    [1440, 820],
  ]) {
    const raster = artworkRasterSize(width, height);
    assert.ok(raster.width >= 1 && raster.height >= 1);
    assert.ok(Math.max(raster.width, raster.height) <= 2048);
    assert.ok(raster.width * raster.height <= 2_000_000);
    assert.ok(raster.width <= width * 3 && raster.height <= height * 3);
    // Flooring at the budget can remove less than one raster pixel per axis.
    assert.ok(
      Math.abs(raster.width / width - raster.height / height) <
        1 / width + 1 / height,
    );
    assert.deepEqual(artworkRasterSize(height, width), {
      width: raster.height,
      height: raster.width,
    });
  }
  const wide = containArtwork(800, 200, 110, 88);
  const tall = containArtwork(200, 800, 72, 88);
  assert.ok(
    Math.abs(wide.width - 110) < 1e-9 && Math.abs(wide.height - 27.5) < 1e-9,
  );
  assert.ok(
    Math.abs(tall.width - 22) < 1e-9 && Math.abs(tall.height - 88) < 1e-9,
  );
  const bright = imageDirection(
    new Uint8ClampedArray([255, 255, 255, 255, 10, 100, 180, 255]),
  );
  const dark = imageDirection(
    new Uint8ClampedArray([0, 0, 0, 255, 10, 100, 180, 255]),
  );
  assert.equal(
    bright.accent,
    dark.accent,
    "source accent survives bright or dark neutral backgrounds",
  );
  assert.equal(bright.lightSource, true);
  assert.equal(dark.lightSource, false);
  assert.equal(
    imageDirection([255, 0, 0, 0]).accent,
    imageDirection([]).accent,
    "transparent colors do not invent a palette",
  );
  assert.notEqual(
    imageDirection([210, 50, 30, 255]).accent,
    bright.accent,
    "palette follows source pixels rather than file names or themes",
  );
  const checker = new Uint8ClampedArray(6 * 4 * 4);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 6; x++) {
      const i = (y * 6 + x) * 4;
      checker[i] = (x + y) % 2 ? 255 : 0;
      checker[i + 1] = (x + y) % 2 ? 0 : 255;
      checker[i + 3] = 255;
    }
  const unchanged = [...checker];
  assert.deepEqual(
    sourceColorField(checker, 6, 4),
    Array(6).fill(0x808000),
    "platform atmosphere retains only six mean colors, discarding fine source detail",
  );
  assert.deepEqual(
    [...checker],
    unchanged,
    "the original source pixels remain unchanged",
  );
});


test("platform visual feet ignore transparent padding without cropping artwork or changing roam anchors",()=>{
  const pixels=new Uint8ClampedArray(6*10*4);
  // A body with a faint, lower appendage: retain even that visible alpha.
  for(let y=1;y<=5;y++)for(let x=1;x<=4;x++)pixels[(y*6+x)*4+3]=255;
  pixels[(6*6+2)*4+3]=1;
  const before=Uint8ClampedArray.from(pixels);
  const padding=artworkFootPadding(pixels,6,10);
  assert.equal(padding,.3);
  const height=80,baseline=200,offset=artworkFootOffset(padding,height,"platform");
  assert.equal(offset,24);
  assert.equal(baseline+offset-padding*height,baseline,"Lowest visible edge meets the original collision baseline");
  assert.equal(artworkFootOffset(padding,height,"roam"),0);
  assert.equal(artworkFootOffset(padding,height,"discover"),0);
  assert.deepEqual(pixels,before,"Full pixels, including appendages, remain unchanged");
  const opaque=new Uint8ClampedArray(6*10*4).fill(255);
  assert.equal(artworkFootPadding(opaque,6,10),0);
  assert.equal(artworkFootPadding(new Uint8ClampedArray(6*10*4),6,10),0);
  assert.equal(artworkFootPadding([],6,10),0);
});


test("carried artwork stays beside differently sized heroes without changing its aspect",()=>{
  for(const hero of [{x:100,y:100,width:40,height:160},{x:100,y:100,width:180,height:60}])
    for(const held of [{width:86,height:20},{width:20,height:86}])for(const facingLeft of [false,true]){
      const before={...held},at=carriedArtworkPosition(hero,held,facingLeft);
      assert.ok(facingLeft?at.x+held.width/2<hero.x:at.x-held.width/2>hero.x+hero.width);
      assert.ok(at.y>hero.y+hero.height/2&&at.y<hero.y+hero.height,"Carry near the lower middle, not above the head");
      assert.deepEqual(held,before);
    }
});


test("player attachments mount at the lower outside edge while preserving source aspect",()=>{
  for(const hero of [{x:100,y:80,width:100,height:160},{x:100,y:80,width:180,height:60}])
    for(const source of [{width:58,height:77},{width:100,height:20}])for(const left of [false,true]){
      const baseline=hero.y+hero.height-12;
      const mount=attachedPlayerArtwork(hero,source,baseline,left);
      assert.ok(Math.abs(mount.width/mount.height-source.width/source.height)<1e-9);
      assert.equal(mount.y+mount.height/2,baseline);
      assert.ok(mount.height<=hero.height*.35&&mount.width<=hero.width*.65);
      const overlap=left?mount.x+mount.width/2-hero.x:hero.x+hero.width-(mount.x-mount.width/2);
      assert.ok(overlap>0&&overlap<=Math.min(hero.width,mount.width)*.081,"Small contact edge, rather than a torso overlay");
      assert.ok(mount.y-mount.height/2>hero.y+hero.height*.4,"Upper identity remains clear");
    }
});
