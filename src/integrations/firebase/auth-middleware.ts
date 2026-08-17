import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const authHeader = request?.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Unauthorized: a Firebase bearer token is required");
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) throw new Error("Unauthorized: no Firebase ID token was provided");

    const { getFirebaseAdminServices } = await import("./admin.server");
    const { adminAuth, adminDb, adminStorage } = getFirebaseAdminServices();

    let claims;
    try {
      claims = await adminAuth.verifyIdToken(token, true);
    } catch {
      throw new Error("Unauthorized: the Firebase ID token is invalid or expired");
    }

    return next({
      context: {
        userId: claims.uid,
        claims,
        adminAuth,
        adminDb,
        adminStorage,
      },
    });
  },
);
