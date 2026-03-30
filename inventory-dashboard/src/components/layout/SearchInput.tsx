import { MaterialIcon } from "@/components/ui/MaterialIcon";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = "חפש..." }: SearchInputProps) {
  return (
    <div className="relative w-full max-w-sm">
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground"><MaterialIcon name="search" /></span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 pr-10 pl-4 rounded-lg border border-input bg-background text-sm font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
      />
    </div>
  );
}
