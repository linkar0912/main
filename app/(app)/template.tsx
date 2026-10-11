import { PageTransition } from "@/src/components/ui/page-transition";

// Re-mounted by Next on every navigation between child routes, so page
// content can leave and arrive while the shell stays put.
export default function Template({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PageTransition>{children}</PageTransition>;
}
