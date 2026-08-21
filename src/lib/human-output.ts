const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const MAGENTA = "\x1b[35m";

const ANSI_PATTERN = /\x1b\[[0-9;]*m/;
const KEY_PATTERN = /^(\s*(?:-\s+)?)([A-Za-z_$][A-Za-z0-9_$-]*:)(.*)$/;
const LIST_PATTERN = /^(\s*)(-\s+)(.*)$/;
const SCALAR_PATTERN = /^(\s*)([|>&])\s*$/;

function colorizeScalar(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#")) return value;
  if (/^(true|false|null|~)$/.test(trimmed)) return `${MAGENTA}${value}${RESET}`;
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return `${CYAN}${value}${RESET}`;
  if (/^["'].*["']$/.test(trimmed)) return `${GREEN}${value}${RESET}`;
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return `${YELLOW}${value}${RESET}`;
  return value;
}

function colorizeYamlLine(line: string): string {
  if (ANSI_PATTERN.test(line) || line.trim() === "") return line;
  if (SCALAR_PATTERN.test(line)) return `${DIM}${line}${RESET}`;

  const key = KEY_PATTERN.exec(line);
  if (key) {
    return `${key[1]}${DIM}${key[2]}${RESET}${colorizeScalar(key[3]!)}`;
  }

  const list = LIST_PATTERN.exec(line);
  if (list) {
    return `${list[1]}${DIM}${list[2]}${RESET}${colorizeScalar(list[3]!)}`;
  }

  return colorizeScalar(line);
}

export function colorizeYaml(source: string): string {
  return source.split("\n").map(colorizeYamlLine).join("\n");
}

function supportsColor(): boolean {
  return Boolean(
    process.stdout.isTTY &&
    !process.env.NO_COLOR &&
    !process.argv.includes("--no-color") &&
    process.env.TERM !== "dumb",
  );
}

function shouldColorize(source: string): boolean {
  const trimmed = source.trimStart();
  // JSON and already-rendered markup are machine/API or argc-owned output.
  return (
    Boolean(trimmed) &&
    !trimmed.startsWith("{") &&
    !trimmed.startsWith("[") &&
    !ANSI_PATTERN.test(source)
  );
}

/**
 * argc owns final serialization, so wrapping stdout is the only app-level seam
 * that covers every command without changing each handler's structured contract.
 */
export function installHumanOutput(): void {
  if (!supportsColor()) return;

  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((...args: Parameters<typeof process.stdout.write>) => {
    const [chunk, ...rest] = args;
    if (typeof chunk !== "string" || !shouldColorize(chunk)) {
      return write(chunk, ...rest);
    }
    return write(colorizeYaml(chunk), ...rest);
  }) as typeof process.stdout.write;
}
