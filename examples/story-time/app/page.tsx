import { PageHeader } from "@/components/blocks/app-shell";
import { SetupBanner } from "@/components/setup-banner";
import { StoryForm } from "@/components/story-form";
import { StoryLibrary } from "@/components/story-library";

export default function Home() {
  return (
    <>
      <SetupBanner />
      <PageHeader
        title="Make a story"
        description="Pick a theme and a tone. Sonic 3.6 reads it with a voice for each character, and you choose what happens next."
      />
      <StoryForm />
      <StoryLibrary />
    </>
  );
}
