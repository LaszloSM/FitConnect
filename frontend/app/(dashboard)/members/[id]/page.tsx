export const dynamic = "force-dynamic";
import MemberDetailClient from "./MemberDetailClient";

type Props = { params: Promise<{ id: string }> };

export default async function MemberDetailPage({ params }: Props) {
  const { id } = await params;
  return <MemberDetailClient memberId={id} />;
}
