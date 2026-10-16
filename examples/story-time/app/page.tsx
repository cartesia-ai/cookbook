import { PageHeader } from "@/components/blocks/app-shell";
import { SetupBanner } from "@/components/setup-banner";
import { StoryForm } from "@/components/story-form";
import { StoryLibrary } from "@/components/story-library";

export default function Home() {
  return (
    <>
      <SetupBanner />
      <PageHeader
        title="Make a bedtime story"
        description="Pick a hero and a theme. Sonic 3.6 reads it with a voice for each character, and your child says what happens next."
      />
      <StoryForm />
      <StoryLibrary />
    </>
  );
}
