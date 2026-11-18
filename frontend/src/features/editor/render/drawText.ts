/** Texte : Arial gras à la taille DE L'ÉLÉMENT (l'original utilisait la taille globale). */
import { TEXT_OUTLINE_COLOR } from "../model/constants";
import { textFont } from "../model/text";
import type { TextElement } from "../model/types";
import { resetDrawingState, type Ctx2D } from "./context";

export function drawText(ctx: Ctx2D, el: TextElement): void {
  ctx.save();
  resetDrawingState(ctx);
  ctx.font = textFont(el.fontSize);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineWidth = el.strokeWidth;
  ctx.strokeStyle = TEXT_OUTLINE_COLOR;
  ctx.fillStyle = el.color;
  ctx.strokeText(el.text, el.x, el.y);
  ctx.fillText(el.text, el.x, el.y);
  ctx.restore();
}
