import { clerkMiddleware } from "@clerk/nextjs/server";

// Solo inicializa Clerk para que auth() funcione en server components.
// La protección de rutas se maneja en los layouts con auth().
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
