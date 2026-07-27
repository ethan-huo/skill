import type { SkillSelector } from "../types";

const RESERVED_CHARACTER = /[,{}\\/\s]/;

export function parseSkillSelectors(expression: string): SkillSelector[] {
  const source = expression.trim();
  if (!source) {
    return [];
  }

  const selectors = splitTopLevel(source).flatMap(parseTerm);
  const seen = new Map<string, SkillSelector>();
  for (const selector of selectors) {
    const current = seen.get(selector.skill);
    if (current) {
      throw new Error(
        `Skill "${selector.skill}" is selected more than once (${formatSkillSelector(current)}, ${formatSkillSelector(selector)}). Select exactly one variant per skill.`,
      );
    }
    seen.set(selector.skill, selector);
  }

  return selectors;
}

export function formatSkillSelector(selector: SkillSelector): string {
  return selector.variant ? `${selector.variant}/${selector.skill}` : selector.skill;
}

function splitTopLevel(source: string): string[] {
  const terms: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === "{") {
      depth += 1;
      if (depth > 1) {
        throw invalidExpression(source, "nested groups are not supported");
      }
      continue;
    }
    if (character === "}") {
      depth -= 1;
      if (depth < 0) {
        throw invalidExpression(source, "found an unmatched closing brace");
      }
      continue;
    }
    if (character === "," && depth === 0) {
      terms.push(source.slice(start, index));
      start = index + 1;
    }
  }

  if (depth !== 0) {
    throw invalidExpression(source, "found an unclosed group");
  }

  terms.push(source.slice(start));
  if (terms.some((term) => term.trim().length === 0)) {
    throw invalidExpression(source, "empty selectors are not allowed");
  }
  return terms;
}

function parseTerm(rawTerm: string): SkillSelector[] {
  const term = rawTerm.trim();
  const group = /^([^/{},\s]+)\/\{([^{}]+)\}$/.exec(term);
  if (group) {
    const variant = validateSkillSelectorName(group[1]!, "variant");
    const skills = group[2]!
      .split(",")
      .map((value) => validateSkillSelectorName(value.trim(), "skill"));
    if (skills.length === 0) {
      throw invalidExpression(term, "variant groups must contain at least one skill");
    }
    return skills.map((skill) => ({ skill, variant }));
  }

  if (term.includes("{") || term.includes("}")) {
    throw invalidExpression(term, "groups must use variant/{skill,...}");
  }

  const segments = term.split("/");
  if (segments.length === 1) {
    return [{ skill: validateSkillSelectorName(segments[0]!, "skill") }];
  }
  if (segments.length === 2) {
    return [
      {
        variant: validateSkillSelectorName(segments[0]!, "variant"),
        skill: validateSkillSelectorName(segments[1]!, "skill"),
      },
    ];
  }

  throw invalidExpression(term, "selectors must use skill, variant/skill, or variant/{skill,...}");
}

export function validateSkillSelectorName(value: string, kind: "skill" | "variant"): string {
  if (!value || RESERVED_CHARACTER.test(value)) {
    throw new Error(
      `Invalid ${kind} name "${value}". Names cannot contain whitespace or any of: , { } / \\.`,
    );
  }
  return value;
}

function invalidExpression(expression: string, detail: string): Error {
  return new Error(`Invalid --skills expression "${expression}": ${detail}.`);
}
