import { useState, type FormEvent } from 'react';

type ResourceSearchEntryProps = {
  initialValue?: string;
  value?: string;
  onQueryChange?: (query: string) => void;
  onSearch: (query: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
};

export function ResourceSearchEntry({ initialValue = '', value, onQueryChange, onSearch, label, placeholder = 'Search books, notes, subjects…', className = '' }: ResourceSearchEntryProps) {
  const [localQuery, setLocalQuery] = useState(initialValue);
  const query = value ?? localQuery;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(query.trim());
  };

  return (
    <form className={`resource-search-entry ${className}`} role="search" onSubmit={submit}>
      <label className="visually-hidden" htmlFor="resource-search">{label}</label>
      <span className="search-mark" aria-hidden="true">⌕</span>
      <input id="resource-search" type="search" value={query} onChange={(event) => {
        const nextQuery = event.target.value;
        setLocalQuery(nextQuery);
        onQueryChange?.(nextQuery);
      }} placeholder={placeholder} />
      <button type="submit">Search <span aria-hidden="true">↗</span></button>
    </form>
  );
}
