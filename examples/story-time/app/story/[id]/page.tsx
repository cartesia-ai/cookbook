import { StoryPlayer } from "@/components/story-player";

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StoryPlayer id={id} />;
}
