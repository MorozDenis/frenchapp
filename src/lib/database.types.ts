/**
 * Hand-maintained mirror of supabase/migrations. Regenerate with
 * `supabase gen types typescript --linked > src/lib/database.types.ts` once the
 * project is linked; until then, keep this in step with the migrations by hand.
 */

import type {
  CefrBand,
  DrillMode,
  ErrorCategory,
  ExpressionType,
  LatencyBand,
  Register,
  ReviewStateName,
  RhetoricalFunction,
  TargetUsage,
  TaskType,
} from "@/lib/taxonomy";

export type ExpressionRow = {
  id: string;
  user_id: string;
  text: string;
  type: ExpressionType;
  register: Register;
  cefr: CefrBand;
  gloss_en: string | null;
  model_sentence: string | null;
  error_note: string | null;
  theme: string | null;
  rhetorical_function: RhetoricalFunction | null;
  source: "user" | "generated";
  archived_at: string | null;
  created_at: string;
}

export type PromptRow = {
  id: string;
  user_id: string;
  theme: string | null;
  task_type: TaskType;
  statement_fr: string;
  expression_ids: string[];
  exposure_count: number;
  created_at: string;
}

export type SessionRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  mode: DrillMode;
  item_count: number;
}

export type AttemptRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  prompt_id: string | null;
  expression_ids: string[];
  mode: DrillMode;
  raw_input: string | null;
  transcript: string | null;
  audio_url: string | null;
  audio_expires_at: string | null;
  latency_ms: number | null;
  speaking_ms: number | null;
  target_usage: Record<string, TargetUsage>;
  collocation_score: number | null;
  grammar_score: number | null;
  latency_band: LatencyBand | null;
  corrected_text: string | null;
  key_fix: string | null;
  error_tags: ErrorCategory[];
  missing_accents: boolean;
  hesitation_count: number | null;
  scoring_status: "pending" | "scored" | "failed";
  scoring_error: string | null;
  transcript_flagged: boolean;
  created_at: string;
}

export type ReviewStateRow = {
  expression_id: string;
  user_id: string;
  ease: number;
  interval_days: number;
  due_at: string;
  consecutive_fast_correct: number;
  state: ReviewStateName;
  last_attempt_id: string | null;
  last_fast_session_id: string | null;
  last_fast_prompt_id: string | null;
  updated_at: string;
}

export type StateSnapshotRow = {
  user_id: string;
  day: string;
  new: number;
  learning: number;
  active: number;
}

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      expression: Table<
        ExpressionRow,
        Omit<ExpressionRow, "id" | "created_at" | "archived_at"> &
          Partial<Pick<ExpressionRow, "id" | "created_at" | "archived_at">>
      >;
      prompt: Table<
        PromptRow,
        Omit<PromptRow, "id" | "created_at" | "exposure_count"> &
          Partial<Pick<PromptRow, "id" | "created_at" | "exposure_count">>
      >;
      session: Table<
        SessionRow,
        Omit<SessionRow, "id" | "started_at" | "ended_at" | "item_count"> &
          Partial<Pick<SessionRow, "id" | "started_at" | "ended_at" | "item_count">>
      >;
      attempt: Table<
        AttemptRow,
        Pick<AttemptRow, "user_id" | "mode"> & Partial<AttemptRow>
      >;
      review_state: Table<
        ReviewStateRow,
        Pick<ReviewStateRow, "expression_id" | "user_id"> & Partial<ReviewStateRow>
      >;
      state_snapshot: Table<StateSnapshotRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      snapshot_states: { Args: { p_user_id: string }; Returns: undefined };
      purge_expired_audio: { Args: Record<never, never>; Returns: number };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
