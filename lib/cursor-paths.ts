import path from "node:path"

export type CursorPaths = {
  chatDb: string
  workspaceStorage: string
  cachedData: string
  cache: string
  blobStorage: string
}

/**
 * Where Cursor keeps its data, per platform.
 *
 * Windows is verified (measured 2026-08-23). macOS and Linux are the
 * conventional Electron locations and are ASSUMPTIONS — if they are wrong the
 * caller must surface "not found", never a healthy-looking zero.
 */
export function cursorPaths(
  platform: NodeJS.Platform,
  home: string,
  appData?: string,
): CursorPaths {
  // Explicit win32/posix flavours so paths for one OS can be built (and
  // asserted) from a host running another.
  const p = platform === "win32" ? path.win32 : path.posix

  let root: string
  if (platform === "win32") {
    root = p.join(appData ?? p.join(home, "AppData", "Roaming"), "Cursor")
  } else if (platform === "darwin") {
    root = p.join(home, "Library", "Application Support", "Cursor")
  } else {
    root = p.join(home, ".config", "Cursor")
  }

  return {
    chatDb: p.join(root, "User", "globalStorage", "state.vscdb"),
    workspaceStorage: p.join(root, "User", "workspaceStorage"),
    cachedData: p.join(root, "CachedData"),
    cache: p.join(root, "Cache"),
    blobStorage: p.join(root, "blob_storage"),
  }
}
