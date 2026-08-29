import type { ReactNode } from "react";

export default function DashboardRouteTemplate({ children }: { children: ReactNode }) {
  return (
    <div className="jc-route-content" data-route-transition="content-only">
      {children}
    </div>
  );
}
