type SkillTokenSource = {
  name: string;
  description: string;
};

export function estimateSkillListTokens(skills: SkillTokenSource[]): number {
  return skills.reduce(
    (total, skill) =>
      total + estimateTextTokens(skill.name) + estimateTextTokens(skill.description),
    0,
  );
}

export function estimateTextTokens(value: string): number {
  const text = value.trim();
  if (text.length === 0) {
    return 0;
  }

  let cjkCharacters = 0;
  let asciiCharacters = 0;
  let otherCharacters = 0;

  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }

    if (isCjkCodePoint(codePoint)) {
      cjkCharacters += 1;
    } else if (codePoint <= 0x7f) {
      asciiCharacters += 1;
    } else {
      otherCharacters += 1;
    }
  }

  // This keeps the estimate dependency-free while avoiding the worst ASCII/CJK skew.
  return Math.ceil(asciiCharacters / 4 + otherCharacters / 2 + cjkCharacters);
}

function isCjkCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x20000 && codePoint <= 0x2ebef)
  );
}
