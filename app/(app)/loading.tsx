import { ScreenSkeleton } from "@/src/components/skeleton";

// The signed-in group's loading state, for screens without their own
// loading.tsx. It renders inside the persistent (app) layout, so the sidebar
// stays put and only the content area shows a placeholder.
//
// It lives here rather than in app/loading.tsx on purpose: a loading file at
// the app root wraps every route, so the public pages (home, pricing, the
// legal pages, the features, solutions and templates guides) sent a
// full-screen splash first and their real content in a hidden streamed
// segment after it.
export default function Loading() {
  return <ScreenSkeleton />;
}
