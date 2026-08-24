import type { MetadataRoute } from "next"

import { buildManifest } from "@/lib/manifest"

// Next serves this at /manifest.webmanifest and injects the <link rel="manifest">
// automatically. The content lives in lib/ so it can be unit-tested.
export default function manifest(): MetadataRoute.Manifest {
  return buildManifest()
}
