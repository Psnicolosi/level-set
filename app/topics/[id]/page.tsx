import TopicTimeline from "@/components/topic/TopicTimeline";

// S6 · TOPIC TIMELINE — Stage 1, Screen 3 (canvas 1d).
export default async function Page({ params }: PageProps<"/topics/[id]">) {
  const { id } = await params;
  return <TopicTimeline topicId={decodeURIComponent(id)} />;
}
