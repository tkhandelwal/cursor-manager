export const DASHBOARD_SECTIONS = [
  { id: "session-chats", label: "Chats" },
  { id: "session-load", label: "Load" },
  { id: "session-policy", label: "Policy" },
  { id: "session-agents", label: "Agents" },
  { id: "session-tweaks", label: "Tweaks" },
  { id: "session-ignore", label: "Ignore" },
  { id: "session-launch", label: "Launch" },
  { id: "session-health", label: "Health" },
  { id: "session-checklist", label: "Checklist" },
  { id: "session-activity", label: "Activity" },
] as const

export type DashboardSectionId = (typeof DASHBOARD_SECTIONS)[number]["id"]

export function dashboardSectionHref(id: DashboardSectionId): string {
  return `#${id}`
}
