import { PageHeader } from "@/components/blocks/app-shell";
import { MeetingList } from "@/components/meeting-list";
import { Recorder } from "@/components/recorder";
import { SetupBanner } from "@/components/setup-banner";

export default function Page() {
  return (
    <>
      <PageHeader
        title="Meeting notes"
        description="Record or upload a meeting to get a summary, decisions and action items."
      />
      <SetupBanner />
      <Recorder />
      <MeetingList />
    </>
  );
}
