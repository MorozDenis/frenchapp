/**
 * The closed vocabularies the app grades against.
 *
 * FR-5.1: the error taxonomy is fixed. The LLM may not invent categories,
 * because the trend charts compare month against month and a label that only
 * exists in March silently breaks the comparison. Anything the model returns
 * outside these lists is dropped at the parse boundary, not stored.
 */

export const ERROR_CATEGORIES = [
  "article",
  "accord_genre_nombre",
  "accord_sujet_verbe",
  "que_qui",
  "subjonctif",
  "temps_verbal",
  "preposition",
  "negation",
  "ordre_des_mots",
  "orthographe",
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export const ERROR_CATEGORY_LABEL: Record<ErrorCategory, string> = {
  article: "Articles",
  accord_genre_nombre: "Accord genre / nombre",
  accord_sujet_verbe: "Accord sujet-verbe",
  que_qui: "que / qui",
  subjonctif: "Subjonctif",
  temps_verbal: "Temps verbal",
  preposition: "Prépositions",
  negation: "Négation",
  ordre_des_mots: "Ordre des mots",
  orthographe: "Orthographe",
};

export const EXPRESSION_TYPES = [
  "connector",
  "collocation",
  "verb_pattern",
  "topical_lexis",
] as const;
export type ExpressionType = (typeof EXPRESSION_TYPES)[number];

export const EXPRESSION_TYPE_LABEL: Record<ExpressionType, string> = {
  connector: "Connecteur",
  collocation: "Collocation",
  verb_pattern: "Construction verbale",
  topical_lexis: "Lexique thématique",
};

export const REGISTERS = ["formal", "neutral", "informal"] as const;
export type Register = (typeof REGISTERS)[number];

export const CEFR_BANDS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrBand = (typeof CEFR_BANDS)[number];

/** FR-7.1 — cheat sheet grouping. */
export const RHETORICAL_FUNCTIONS = [
  "annoncer",
  "ajouter",
  "nuancer_opposer",
  "illustrer",
  "conclure",
  "formules_de_politesse",
] as const;
export type RhetoricalFunction = (typeof RHETORICAL_FUNCTIONS)[number];

export const RHETORICAL_FUNCTION_LABEL: Record<RhetoricalFunction, string> = {
  annoncer: "Annoncer",
  ajouter: "Ajouter",
  nuancer_opposer: "Nuancer / opposer",
  illustrer: "Illustrer",
  conclure: "Conclure",
  formules_de_politesse: "Formules de politesse",
};

/** FR-1.3 — the TCF themes packs are generated from. */
export const THEMES = [
  "environnement",
  "technologie",
  "travail",
  "éducation",
  "santé",
  "médias",
  "ville/campagne",
  "immigration",
  "culture",
  "consommation",
] as const;
export type Theme = (typeof THEMES)[number];

export const TASK_TYPES = ["phrase", "paragraphe", "argument"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  phrase: "Une phrase",
  paragraphe: "3–4 phrases",
  argument: "Paragraphe argumenté",
};

export const TARGET_USAGE_VALUES = [
  "absent",
  "present_misused",
  "present_correct",
] as const;
export type TargetUsage = (typeof TARGET_USAGE_VALUES)[number];

export const LATENCY_BANDS = ["rapide", "correct", "lent"] as const;
export type LatencyBand = (typeof LATENCY_BANDS)[number];

export const REVIEW_STATES = ["new", "learning", "active"] as const;
export type ReviewStateName = (typeof REVIEW_STATES)[number];

export type DrillMode = "text" | "voice";
