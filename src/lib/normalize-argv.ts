type VariadicCommand = {
  field: "ids" | "repo";
  valueFlags: ReadonlySet<string>;
};

const VARIADIC_COMMANDS: Readonly<Record<string, VariadicCommand>> = {
  "favorite.add": { field: "ids", valueFlags: new Set() },
  "favorite.install": { field: "ids", valueFlags: new Set() },
  "favorite.remove": { field: "ids", valueFlags: new Set() },
  install: { field: "repo", valueFlags: new Set(["skills"]) },
  remove: { field: "repo", valueFlags: new Set() },
};

export function normalizeArgv(argv: string[]): string[] {
  const normalized = normalizeAliases(argv);
  const withCommandPath = normalizeCommandPath(normalized);
  return normalizeVariadicPositionals(withCommandPath);
}

function normalizeAliases(argv: string[]): string[] {
  return argv.map((arg) => {
    if (arg === "-g") {
      return "--global";
    }
    if (arg === "--no-progress") {
      return "--progress=false";
    }
    return arg;
  });
}

function normalizeCommandPath(argv: string[]): string[] {
  if (argv[0] !== "favorite" || argv.length < 2) {
    return argv;
  }

  return [`favorite.${argv[1]}`, ...argv.slice(2)];
}

function normalizeVariadicPositionals(argv: string[]): string[] {
  const command = argv[0];
  const spec = command ? VARIADIC_COMMANDS[command] : undefined;
  if (!command || !spec || usesWholeInput(argv[1])) {
    return argv;
  }

  const result = [command];
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      result.push(`--${spec.field}`, token);
      continue;
    }

    result.push(token);
    const flagName = token.slice(2).split("=", 1)[0]!;
    if (
      !token.includes("=") &&
      (flagName === spec.field || spec.valueFlags.has(flagName)) &&
      index + 1 < argv.length
    ) {
      result.push(argv[++index]!);
    }
  }
  return result;
}

function usesWholeInput(token: string | undefined): boolean {
  return token === "-" || token?.startsWith("{") === true || token?.startsWith("@") === true;
}
