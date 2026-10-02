import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

/**
 * Routes that must render for a signed-in user who does not yet have a profile.
 *
 * The (app) layout sends such a user to /onboarding, so protecting it would loop:
 * Clerk would bounce them to /login, back to /onboarding, forever. Clerk's
 * middleware still runs on these, which is what forces a session.
 */
const isPublicRoute = createRouteMatcher([
  '/login(.*)',
  '/signup(.*)',
  '/onboarding(.*)',
  '/access-revoked(.*)',
  '/',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Clerk proxy
    '/__clerk/:path*',
  ],
}
