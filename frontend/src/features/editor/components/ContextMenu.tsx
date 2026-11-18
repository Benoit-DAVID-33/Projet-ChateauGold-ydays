import clsx from "clsx";
import { Crosshair, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import type { Point } from "../model/types";
import { useEditorStore } from "../store/editorStore";
import styles from "./ContextMenu.module.css";

interface ContextMenuProps {
  position: Point;
  elementId: string;
  /** « Motion Tracking » n'a de sens que pour une vidéo. */
  showMotionTracking: boolean;
  onClose: () => void;
}

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"]';

/**
 * Menu contextuel d'un élément : « Faire tourner » (3D), « Motion Tracking »
 * (avec son état), « Supprimer ». Navigable au clavier (flèches, Origine, Fin,
 * Échap), fermé par un clic extérieur, un redimensionnement ou la perte de focus.
 */
export function ContextMenu({
  position,
  elementId,
  showMotionTracking,
  onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const element = useEditorStore((s) => s.elements.find((el) => el.id === elementId) ?? null);
  const armRotation = useEditorStore((s) => s.armRotation);
  const toggleMotionTracking = useEditorStore((s) => s.toggleMotionTracking);
  const deleteElement = useEditorStore((s) => s.deleteElement);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !ref.current?.contains(e.target)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const run = (action: () => void) => {
    action();
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    const index = items.findIndex((item) => item === document.activeElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        focusAt(index + 1);
        break;
      case "ArrowUp":
        focusAt(index - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(items.length - 1);
        break;
      case "Escape":
      case "Tab":
        onClose();
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  if (!element) return null;
  const style = { "--menu-x": `${position.x}px`, "--menu-y": `${position.y}px` } as CSSProperties;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Actions de l'élément"
      className={styles.menu}
      style={style}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {element.type === "shape3d" && (
        <button
          type="button"
          role="menuitem"
          className={styles.item}
          onClick={() => run(() => armRotation(element.id))}
        >
          <RotateCw aria-hidden />
          Faire tourner
        </button>
      )}
      {showMotionTracking && (
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={element.motionTracking}
          className={styles.item}
          onClick={() => run(() => toggleMotionTracking(element.id))}
        >
          <Crosshair aria-hidden />
          Motion Tracking
          <span className={clsx(styles.state, element.motionTracking && styles.on)}>
            {element.motionTracking ? "Activé" : "Désactivé"}
          </span>
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className={clsx(styles.item, styles.danger)}
        onClick={() => run(() => deleteElement(element.id))}
      >
        <Trash2 aria-hidden />
        Supprimer
      </button>
    </div>,
    document.body,
  );
}
