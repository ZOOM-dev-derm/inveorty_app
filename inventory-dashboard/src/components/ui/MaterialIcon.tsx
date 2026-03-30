interface MaterialIconProps {
  name: string;
  className?: string;
}

export function MaterialIcon({ name, className = "" }: MaterialIconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontSize: "inherit" }}
    >
      {name}
    </span>
  );
}
