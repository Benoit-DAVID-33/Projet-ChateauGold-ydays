/**
 * Constantes de l'éditeur, reprises de la version d'origine.
 *
 * Les valeurs de `UI_PX` sont exprimées en pixels ÉCRAN (CSS) : elles sont
 * converties en pixels natifs du média au moment de l'usage, via l'échelle
 * d'affichage courante (zoom compris). Ainsi une forme créée mesure 100 px à
 * l'écran comme avant, tout en étant stockée en coordonnées natives.
 */
export const UI_PX = {
  /** Rayon des poignées dessinées. */
  handleRadius: 8,
  /** Tolérance de saisie d'une poignée. */
  handleHit: 12,
  /** Tolérance de saisie d'une ligne / d'un tracé. */
  lineHit: 15,
  /** Tolérance de saisie autour d'une forme ou d'un texte. */
  elementHit: 4,
  /** Taille minimale d'une forme lors d'un redimensionnement. */
  minSize: 20,
  /** Taille par défaut d'une forme 2D (carré centré). */
  shapeSize: 100,
  /** Taille par défaut d'un objet 3D (70 pour l'hexagone 3D). */
  shape3dSize: 80,
  hexagon3dSize: 70,
  /** Demi-longueur d'une ligne par défaut (ligne horizontale de 160 px). */
  lineHalfLength: 80,
  /** Épaisseurs de trait d'origine. */
  shapeStroke: 3,
  lineStroke: 3,
  shape3dStroke: 2,
  textOutline: 2,
  /** Contour des poignées. */
  handleStroke: 2,
  /** Rayon du badge « Motion Tracking » (affichage écran uniquement). */
  motionBadge: 9,
  /** Distance minimale entre deux points d'un tracé libre. */
  strokeStep: 1.5,
} as const;

export const FONT_SIZE = { min: 12, max: 72, default: 24 } as const;
export const BRUSH_SIZE = { min: 1, max: 20, default: 5 } as const;
export const ZOOM = { min: 0.5, max: 5, step: 0.25 } as const;
export const WHEEL_FACTOR = { grow: 1.1, shrink: 0.9 } as const;

/** Sensibilité de la rotation 3D (radians par pixel écran). */
export const ROTATION_SENSITIVITY = 0.012;

/** Opacités d'origine. */
export const SHAPE_FILL_ALPHA = 0.55;
export const MARKER_ALPHA = 0.3;

/** Poignées de sélection (bleu d'origine, contour blanc). */
export const HANDLE_FILL = "#4a90e2";
export const HANDLE_STROKE = "#ffffff";
export const TEXT_OUTLINE_COLOR = "#000000";

/** Nombre maximal d'états conservés pour annuler / rétablir. */
export const HISTORY_LIMIT = 50;

/**
 * Géométrie des lignes proportionnelle à l'épaisseur (3 px à la création) :
 * tête de flèche 15 px, amplitude du zigzag 10 px, pas du zigzag 20 px.
 * Rapporter ces longueurs à l'épaisseur garantit un export cohérent à toute
 * résolution (l'original ne mettait à l'échelle qu'une partie des tracés).
 */
export const LINE_GEOMETRY = {
  arrowHeadPerWidth: 5,
  arrowHalfAngle: Math.PI / 6,
  zigzagAmplitudePerWidth: 10 / 3,
  zigzagSegmentPerWidth: 20 / 3,
  curveOffset: 0.3,
} as const;
