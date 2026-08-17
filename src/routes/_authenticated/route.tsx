import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { waitForAuth } from "@/integrations/firebase/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const user = await waitForAuth();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: () => <Outlet />,
});
