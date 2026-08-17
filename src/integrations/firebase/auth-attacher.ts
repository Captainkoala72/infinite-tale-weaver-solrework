import { createMiddleware } from "@tanstack/react-start";

import { firebaseAuth } from "./client";

/** Attach the current Firebase ID token to every TanStack server-function call. */
export const attachFirebaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    await firebaseAuth.authStateReady();
    const token = await firebaseAuth.currentUser?.getIdToken();
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
