import { dlopen, ptr } from "bun:ffi";
import { resolve } from "node:path";

// A directory cannot replace a non-empty directory with ordinary rename. Exchange
// keeps the stable path readable without introducing versioned targets:
// https://man7.org/linux/man-pages/man2/rename.2.html (RENAME_EXCHANGE)
// macOS renamex_np(2) provides the equivalent RENAME_SWAP operation.
export function exchangePaths(first: string, second: string): void {
  const from = Buffer.from(`${resolve(first)}\0`);
  const to = Buffer.from(`${resolve(second)}\0`);
  if (process.platform === "darwin") {
    const library = dlopen("/usr/lib/libSystem.B.dylib", {
      renamex_np: { args: ["ptr", "ptr", "u32"], returns: "i32" },
    });
    try {
      if (library.symbols.renamex_np(ptr(from), ptr(to), 2) !== 0) {
        throw new Error(`Atomic directory exchange failed: ${first} -> ${second}`);
      }
    } finally {
      library.close();
    }
    return;
  }
  if (process.platform === "linux") {
    const library = dlopen("libc.so.6", {
      renameat2: { args: ["i32", "ptr", "i32", "ptr", "u32"], returns: "i32" },
    });
    try {
      if (library.symbols.renameat2(-100, ptr(from), -100, ptr(to), 2) !== 0) {
        throw new Error(`Atomic directory exchange failed: ${first} -> ${second}`);
      }
    } finally {
      library.close();
    }
    return;
  }
  throw new Error(`Atomic skill updates are unsupported on ${process.platform}.`);
}
