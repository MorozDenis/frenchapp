import { body, fail, route } from "@/lib/api";
import { generatePrompt } from "@/lib/llm/prompt";
import { TASK_TYPES, type TaskType } from "@/lib/taxonomy";

/**
 * These routes wait on a language model. The platform default cuts a function
 * off long before one returns, and a killed function loses the attempt — so the
 * ceiling is raised to the maximum the plan allows.
 */
export const maxDuration = 60;


/**
 * FR-2 — the prompt for one drill item.
 *
 * FR-2.4 wants repeat exposure to a set to vary its wording, so prompts are
 * cached per expression-set and retired once they have been shown a few times.
 * Retired prompts stay in the table: attempts point at them, and the wording
 * the user actually answered has to remain readable.
 */

const REGENERATE_AFTER_EXPOSURES = 3;
const AVOID_SAMPLE = 4;

export const POST = route(async ({ supabase, user, request }) => {
  const { expressionIds, taskType, theme } = await body<{
    expressionIds?: string[];
    taskType?: TaskType;
    theme?: string | null;
  }>(request);

  if (!expressionIds?.length) return fail("No expressions given");
  if (expressionIds.length > 4) return fail("An item takes at most four expressions");

  const resolvedTask: TaskType = TASK_TYPES.includes(taskType as TaskType)
    ? (taskType as TaskType)
    : "phrase";

  const { data: targets, error: targetError } = await supabase
    .from("expression")
    .select("id, text, register, theme, gloss_en")
    .in("id", expressionIds);
  if (targetError) throw new Error(targetError.message);
  if (!targets?.length || targets.length !== expressionIds.length) {
    return fail("Some of those expressions are not in the bank", 404);
  }

  // Stored sorted so a set always has one canonical key, whatever order the
  // planner happened to emit.
  const key = [...expressionIds].sort();

  const { data: cached, error: cacheError } = await supabase
    .from("prompt")
    .select("*")
    .eq("task_type", resolvedTask)
    .contains("expression_ids", key)
    .order("exposure_count", { ascending: true });
  if (cacheError) throw new Error(cacheError.message);

  // `contains` is a superset test, so the exact-set check happens here.
  const exact = (cached ?? []).filter(
    (p) => p.expression_ids.length === key.length,
  );
  const reusable = exact.find((p) => p.exposure_count < REGENERATE_AFTER_EXPOSURES);

  if (reusable) {
    await supabase
      .from("prompt")
      .update({ exposure_count: reusable.exposure_count + 1 })
      .eq("id", reusable.id);

    return {
      promptId: reusable.id,
      statementFr: reusable.statement_fr,
      taskType: resolvedTask,
      targets: publicTargets(targets),
      reused: true,
    };
  }

  const resolvedTheme =
    theme ?? targets.find((t) => t.theme)?.theme ?? null;

  const statementFr = await generatePrompt({
    expressions: targets.map((t) => t.text),
    taskType: resolvedTask,
    theme: resolvedTheme,
    avoid: exact.slice(-AVOID_SAMPLE).map((p) => p.statement_fr),
  });

  const { data: created, error: createError } = await supabase
    .from("prompt")
    .insert({
      user_id: user.id,
      theme: resolvedTheme,
      task_type: resolvedTask,
      statement_fr: statementFr,
      expression_ids: key,
      exposure_count: 1,
    })
    .select("id, statement_fr")
    .single();
  if (createError) throw new Error(createError.message);

  return {
    promptId: created.id,
    statementFr: created.statement_fr,
    taskType: resolvedTask,
    targets: publicTargets(targets),
    reused: false,
  };
});

/**
 * What the drill screen is allowed to see before the answer is submitted.
 * The model sentence and the error note are deliberately withheld — showing
 * either would turn a production task into a copying task.
 */
function publicTargets(
  targets: { id: string; text: string; register: string; gloss_en: string | null }[],
) {
  return targets.map((t) => ({
    id: t.id,
    text: t.text,
    register: t.register,
    gloss_en: t.gloss_en,
  }));
}
