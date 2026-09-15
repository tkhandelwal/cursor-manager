import { buttonVariants } from "@/components/ui/button"
import { DASHBOARD_SECTIONS, dashboardSectionHref } from "@/lib/dashboard"

export function DashboardNav() {
  return (
    <nav
      aria-label="Dashboard sections"
      className="sticky top-0 z-20 border-b border-border bg-background py-2"
    >
      <ul className="flex flex-wrap gap-2">
        {DASHBOARD_SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={dashboardSectionHref(section.id)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
