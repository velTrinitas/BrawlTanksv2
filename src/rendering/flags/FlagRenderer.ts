/**
 * Flag rendering — FAZA 7
 *
 * Programmatic PIXI.Graphics rendering for the 4 profile flags.
 *
 * Per Constitution §7 (per-feature isolation):
 *  - All 4 flags share IDENTICAL render logic (rectangle stripe patterns)
 *  - Only colors and orientation differ
 *  - The isolation rule applies when render PATHS diverge (brawler vs enemy);
 *    here patterns are data-driven so one shared module is correct.
 *
 * Output: PIXI.Container at FLAG_RENDER_SIZE x FLAG_RENDER_SIZE,
 * baked once at boot into PROFILE_FLAG_TEX_CACHE via renderer.generateTexture.
 */
import * as PIXI from 'pixi.js';
import type { FlagId } from '../../types/Profile';
import { getFlag, type FlagConfig } from '../../config/flags';

/** Square flag texture size — large enough for crisp tank turret + picker UI rendering. */
export const FLAG_RENDER_SIZE = 256;

/** Subtle border around the flag for visual separation from underlying material. */
const BORDER_COLOR = 0x222222;
const BORDER_WIDTH = 2;

/**
 * Renders a flag by id. Returns a PIXI.Container ready to be baked into a Texture.
 * Caller is responsible for `.destroy({ children: true })` after texture bake.
 */
export function drawFlag(id: FlagId): PIXI.Container {
  const config = getFlag(id);
  const container = new PIXI.Container();
  const g = new PIXI.Graphics();

  switch (config.pattern) {
    case 'horizontal_2':
      drawHorizontal2(g, config);
      break;
    case 'horizontal_3':
      drawHorizontal3(g, config);
      break;
    case 'vertical_3':
      drawVertical3(g, config);
      break;
  }

  // Subtle outer border
  g.lineStyle(BORDER_WIDTH, BORDER_COLOR, 1, 0);
  g.drawRect(0, 0, FLAG_RENDER_SIZE, FLAG_RENDER_SIZE);

  container.addChild(g);
  return container;
}

/** Polska: biala gora, czerwony dol. */
function drawHorizontal2(g: PIXI.Graphics, c: FlagConfig): void {
  const half = FLAG_RENDER_SIZE / 2;
  g.beginFill(c.colors.primary);
  g.drawRect(0, 0, FLAG_RENDER_SIZE, half);
  g.endFill();
  g.beginFill(c.colors.secondary);
  g.drawRect(0, half, FLAG_RENDER_SIZE, half);
  g.endFill();
}

/** Niemcy: 3 pasy poziomo (czarny / czerwony / zlocisty). */
function drawHorizontal3(g: PIXI.Graphics, c: FlagConfig): void {
  const third = FLAG_RENDER_SIZE / 3;
  g.beginFill(c.colors.primary);
  g.drawRect(0, 0, FLAG_RENDER_SIZE, third);
  g.endFill();
  g.beginFill(c.colors.secondary);
  g.drawRect(0, third, FLAG_RENDER_SIZE, third);
  g.endFill();
  g.beginFill(c.colors.tertiary ?? c.colors.primary);
  g.drawRect(0, third * 2, FLAG_RENDER_SIZE, third);
  g.endFill();
}

/** Francja / Wlochy: 3 pasy pionowo. */
function drawVertical3(g: PIXI.Graphics, c: FlagConfig): void {
  const third = FLAG_RENDER_SIZE / 3;
  g.beginFill(c.colors.primary);
  g.drawRect(0, 0, third, FLAG_RENDER_SIZE);
  g.endFill();
  g.beginFill(c.colors.secondary);
  g.drawRect(third, 0, third, FLAG_RENDER_SIZE);
  g.endFill();
  g.beginFill(c.colors.tertiary ?? c.colors.primary);
  g.drawRect(third * 2, 0, third, FLAG_RENDER_SIZE);
  g.endFill();
}