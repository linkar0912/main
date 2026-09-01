import { AutomationStory } from "./automation-story";
import { BeforeAfterSection } from "./before-after-section";
import { ChannelShowcase } from "./channel-showcase";
import { FaqSection } from "./faq-section";
import { FinalCta } from "./final-cta";
import { HeroSection } from "./hero-section";
import { InsightsShowcase } from "./insights-showcase";
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
        {/* Build, run, then see: insights close the product story before the
            page moves on to reference and setup. */}
        <InsightsShowcase />
        {/* Supported channels reads as reference, not persuasion, so it sits
            after the mechanism sections and directly above Setup - whose first
            step is "connect your professional account". */}
        <ChannelShowcase />
        <SetupSteps />
        <FaqSection />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
