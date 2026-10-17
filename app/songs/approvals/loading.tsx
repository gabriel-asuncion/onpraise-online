import PageSkeleton from "../../../components/PageSkeleton";

export default function SongApprovalsLoading() {
  return <PageSkeleton message="FETCHING PENDING APPROVALS..." variant="song-review" />;
}
