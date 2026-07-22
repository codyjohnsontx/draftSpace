import { JoinRoomScreen } from "@/components/collaboration/join-room-screen";

export default async function JoinCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinRoomScreen initialCode={code} />;
}
