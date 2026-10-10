import type { EmailRule, RuleAction, RuleCondition } from "../db/schema";

export type RuleFacts = {
  from: string;
  to: string;
  subject: string;
  body: string;
  hasAttachment: boolean;
  listId: string;
};

function test(cond: RuleCondition, facts: RuleFacts): boolean {
  if (cond.field === "has_attachment") return facts.hasAttachment === (cond.value !== "false");
  const haystack = (facts[cond.field === "list_id" ? "listId" : cond.field] ?? "").toLowerCase();
  const needle = cond.value.trim().toLowerCase();
  switch (cond.op) {
    case "contains":
      return needle.length > 0 && haystack.includes(needle);
    case "not_contains":
      return !haystack.includes(needle);
    case "equals":
      return haystack === needle || haystack.split(/[\s,]+/).includes(needle);
    case "ends_with":
      return haystack.split(/[\s,]+/).some((part) => part.endsWith(needle));
    case "is_true":
      return haystack.length > 0;
    default:
      return false;
  }
}

export function ruleMatches(rule: Pick<EmailRule, "match" | "conditions">, facts: RuleFacts): boolean {
  if (rule.conditions.length === 0) return false;
  return rule.match === "any" ? rule.conditions.some((c) => test(c, facts)) : rule.conditions.every((c) => test(c, facts));
}

/** Collects actions of all enabled matching rules, in order, honouring stopProcessing. */
export function evaluateRules(rules: EmailRule[], facts: RuleFacts): { actions: RuleAction[]; matched: string[] } {
  const actions: RuleAction[] = [];
  const matched: string[] = [];
  for (const rule of [...rules].sort((a, b) => a.position - b.position)) {
    if (!rule.enabled) continue;
    if (!ruleMatches(rule, facts)) continue;
    matched.push(rule.id);
    actions.push(...rule.actions);
    if (rule.stopProcessing) break;
  }
  return { actions, matched };
}
