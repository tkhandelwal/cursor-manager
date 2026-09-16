export const DASHBOARD_SECTIONS = [
  { id: "session-delivery", label: "Delivery" },
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

export const PRODUCT_DELIVERY_STEPS = [
  { number: 1, label: "Directory plugin", detail: "Listed and installable", status: "complete" },
  { number: 2, label: "Profiled SSDLC", detail: "Core, AI, commercial, and regulated paths", status: "complete" },
  { number: 3, label: "Conductor policy", detail: "Human gates and branch controls", status: "complete" },
  { number: 4, label: "Pilot runs", detail: "Conventional and AI-commercial dry runs", status: "complete" },
  { number: 5, label: "Conductor command", detail: "Start or resume from git records", status: "complete" },
  { number: 6, label: "Evidence automation", detail: "Dedicated CI evidence gate", status: "complete" },
  { number: 7, label: "Product UX", detail: "Session Guard and delivery view", status: "complete" },
  { number: 8, label: "Commercialization", detail: "Paid tier remains optional", status: "deferred" },
] as const

export const COMPLETED_DELIVERY_STEPS = PRODUCT_DELIVERY_STEPS.filter(
  (step) => step.status === "complete",
).length

export function dashboardSectionHref(id: DashboardSectionId): string {
  return `#${id}`
}
