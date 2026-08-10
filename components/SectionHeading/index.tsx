type SectionHeadingProps = {
  index: string;
  title: string;
  description?: string;
};

export function SectionHeading({
  index,
  title,
  description,
}: SectionHeadingProps) {
  return (
    <header className="section-heading">
      <span aria-hidden="true">{index}</span>
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
    </header>
  );
}
