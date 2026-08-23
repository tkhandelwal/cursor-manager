export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall back to the legacy path below when the async API is blocked */
  }
  try {
    const area = document.createElement("textarea")
    area.value = text
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.focus()
    area.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
