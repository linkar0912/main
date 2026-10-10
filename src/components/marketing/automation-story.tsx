import { storyChapters, type StoryChapter } from "./marketing-content";
import { FrameBar, MobileScene, SceneBody, sceneSummaries } from "./automation-story-scenes";
import { AutomationStoryShell } from "./automation-story-shell";

type AutomationStoryProps = {
  chapters?: readonly StoryChapter[];
};

/**
 * "How it works": four chapters of copy beside a phone that changes screen as
 * the reader scrolls. The phone screens are static markup rendered here on the
 * server; only the scroll-tracking shell is a client component.
 */
export function AutomationStory({ chapters = storyChapters }: AutomationStoryProps) {
  return (
    <AutomationStoryShell
      chapters={chapters}
      sceneSummaries={chapters.map((chapter) => sceneSummaries[chapter.scene].join("; "))}
      desktopScenes={chapters.map((chapter) => <SceneBody key={chapter.id} scene={chapter.scene} />)}
      mobileScenes={chapters.map((chapter) => <MobileScene key={chapter.id} scene={chapter.scene} />)}
      frameBar={<FrameBar />}
    />
  );
}
