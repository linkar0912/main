// The splash's rules (.root-loading, .brand-mark) live in the full
// stylesheet, like the page's: public.css only keeps what the public routes
// use, and this fallback can paint before the page's own CSS arrives.
import "../globals.css";
import { RootSkeleton } from "@/src/components/skeleton";

// Onboarding is a full-screen page outside the app shell, and it renders on
// every request (it reads the plan cookie and the connect-flow status). The
// app shell's redirect and the Home invite both navigate here, so it keeps
// the wordmark splash while the page renders instead of leaving the previous
// screen frozen.
export default function Loading() {
  return <RootSkeleton />;
}
