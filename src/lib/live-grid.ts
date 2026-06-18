import { fmt } from "argc/terminal";

/**
 * Multi-line live progress grid. One row per task; spinner + stage label tick
 * in place. Renders to stderr (so stdout stays a clean summary stream).
 *
 * Falls back to a single status line per row when `enabled` is false (no TTY,
 * `CI=1`, `NO_COLOR`, `--no-progress`). The fallback writes one line per
 * completion to keep CI logs readable.
 */
export type GridStage =
  | { kind: "queued" }
  | { kind: "running"; label: string }
  | { kind: "done"; label: string }
  | { kind: "error"; label: string };

export type LiveGridRow = {
  id: string;
  title: string;
};

export type LiveGridOptions = {
  rows: LiveGridRow[];
  stream?: NodeJS.WritableStream & { isTTY?: boolean; columns?: number };
  enabled?: boolean;
  intervalMs?: number;
};

export type LiveGrid = {
  set(id: string, stage: GridStage): void;
  stop(): void;
};

const UNICODE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ASCII_FRAMES = ["|", "/", "-", "\\"];

const ANSI = {
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  // CPL N: move to column 1 of N lines up.
  cpl: (n: number) => (n > 0 ? `\x1b[${n}F` : "\r"),
  // ED 0: clear from cursor to end of screen.
  eraseDown: "\x1b[J",
};

export function createLiveGrid(options: LiveGridOptions): LiveGrid {
  const stream = options.stream ?? process.stderr;
  const enabled =
    options.enabled ?? (Boolean(stream.isTTY) && !process.env.CI && !process.env.NO_COLOR);
  const interval = options.intervalMs ?? 80;
  const useUnicode = isUnicode();
  const frames = useUnicode ? UNICODE_FRAMES : ASCII_FRAMES;
  const stages = new Map<string, GridStage>();
  for (const row of options.rows) {
    stages.set(row.id, { kind: "queued" });
  }

  if (!enabled) {
    return createFallbackGrid(stream, stages, options.rows);
  }

  let frame = 0;
  let lastLineCount = 0;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const onSigint = () => {
    cleanup();
    process.exit(130);
  };

  function render(): void {
    if (stopped) {
      return;
    }
    const lines = options.rows.map((row) => formatLine(row, stages.get(row.id)!, frames[frame]!));
    const erase = lastLineCount > 0 ? ANSI.cpl(lastLineCount) + ANSI.eraseDown : "";
    stream.write(erase + lines.join("\n") + "\n");
    lastLineCount = lines.length;
    frame = (frame + 1) % frames.length;
  }

  function cleanup(): void {
    if (stopped) {
      return;
    }
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (lastLineCount > 0) {
      stream.write(ANSI.cpl(lastLineCount) + ANSI.eraseDown);
    }
    stream.write(ANSI.showCursor);
    process.removeListener("SIGINT", onSigint);
  }

  stream.write(ANSI.hideCursor);
  process.once("SIGINT", onSigint);
  render();
  timer = setInterval(render, interval);

  return {
    set(id, stage) {
      stages.set(id, stage);
    },
    stop: cleanup,
  };
}

function createFallbackGrid(
  stream: NodeJS.WritableStream,
  stages: Map<string, GridStage>,
  rows: LiveGridRow[],
): LiveGrid {
  const titles = new Map(rows.map((row) => [row.id, row.title] as const));
  return {
    set(id, stage) {
      const previous = stages.get(id);
      stages.set(id, stage);
      const title = titles.get(id) ?? id;
      // Only emit on terminal transitions to avoid spamming non-TTY consumers.
      if (stage.kind !== "done" && stage.kind !== "error") {
        return;
      }
      if (previous?.kind === stage.kind) {
        return;
      }
      const symbol = stage.kind === "done" ? fmt.success("done") : fmt.error("fail");
      stream.write(`${symbol} ${title} — ${stage.label}\n`);
    },
    stop() {
      // No-op in fallback mode.
    },
  };
}

function formatLine(row: LiveGridRow, stage: GridStage, spinnerFrame: string): string {
  const indicator = stageIndicator(stage, spinnerFrame);
  const title = stage.kind === "queued" ? fmt.dim(row.title) : row.title;
  const label = stageLabel(stage);
  return `${indicator} ${title}${label ? `  ${label}` : ""}`;
}

function stageIndicator(stage: GridStage, spinnerFrame: string): string {
  switch (stage.kind) {
    case "queued":
      return fmt.dim("·");
    case "running":
      return fmt.cyan(spinnerFrame);
    case "done":
      return fmt.green(isUnicode() ? "✓" : "OK");
    case "error":
      return fmt.red(isUnicode() ? "✗" : "ER");
  }
}

function stageLabel(stage: GridStage): string {
  switch (stage.kind) {
    case "queued":
      return fmt.dim("queued");
    case "running":
      return fmt.dim(stage.label);
    case "done":
      return fmt.dim(stage.label);
    case "error":
      return fmt.red(stage.label);
  }
}

function isUnicode(): boolean {
  // Mirrors @clack/prompts' check: Windows console / `TERM=linux` are the
  // common ASCII-only suspects; everything modern advertises UTF-8.
  if (process.platform === "win32") {
    return Boolean(process.env.WT_SESSION) || process.env.TERM_PROGRAM === "vscode";
  }
  return process.env.TERM !== "linux";
}
