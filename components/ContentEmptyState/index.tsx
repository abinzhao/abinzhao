import Link from "next/link";

type ContentEmptyStateProps = {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
};

export function ContentEmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: ContentEmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="status-line" aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
      {actionHref && actionLabel ? (
        <Link className="text-link" href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
