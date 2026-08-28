import { AutomationStory } from "./automation-story";
import { BeforeAfterSection } from "./before-after-section";
import { FaqSection } from "./faq-section";
import { FinalCta } from "./final-cta";
import { HeroSection } from "./hero-section";
import { ManifestoSection } from "./manifesto-section";
import { MarketingFooter } from "./marketing-footer";
import { MarketingHeader } from "./marketing-header";
import { ProofRail } from "./proof-rail";
import { SetupSteps } from "./setup-steps";
import { SurfaceRunway } from "./surface-runway";
import { WorkflowGallery } from "./workflow-gallery";
import styles from "./marketing-page.module.css";

/** Server-rendered assembly for Linkar's public homepage. */
export function MarketingPage() {
  return (
    <div className={`${styles.root} marketing-page-root`}>
      <MarketingHeader />
      <main id="main-content" className={styles.page}>
        <HeroSection />
        <ProofRail />
        <ManifestoSection />
        <AutomationStory />
        <SurfaceRunway />
        <BeforeAfterSection />
        <WorkflowGallery />
        <SetupSteps />
        <FaqSection />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
