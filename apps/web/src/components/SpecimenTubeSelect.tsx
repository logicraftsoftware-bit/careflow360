import { useId, useState } from "react";

type Option = { id: string; label: string; search: string; active: boolean };

export function SpecimenTubeSelect({ defaultValue, options, loading, error }: {
  defaultValue: string; options: Option[]; loading: boolean; error: boolean;
}) {
  const inputId = useId();
  const [selected, setSelected] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const label = options.find((option) => option.id === selected)?.label || (selected ? "Unavailable specimen tube" : "");
  const available = options.filter((option) => option.active || option.id === selected);
  const filtered = available.filter((option) => option.search.toLowerCase().includes(query.trim().toLowerCase()));
  const choose = (id: string) => { setSelected(id); setQuery(""); setOpen(false); setHighlight(0); };
  const expanded = open && !loading && !error;
  return <div className="specimen-select-field">
    <label htmlFor={inputId}>Specimen tube</label>
    <input type="hidden" name="specimenTubeId" value={selected}/>
    <div className="specimen-select-control">
      <input id={inputId} role="combobox" autoComplete="off" aria-expanded={expanded} aria-controls={`${inputId}-list`} aria-autocomplete="list"
        aria-activedescendant={expanded && filtered[highlight] ? `${inputId}-${highlight}` : undefined}
        disabled={loading || error} placeholder={loading ? "Loading specimen tubes..." : "Search specimen tubes (optional)"}
        value={open ? query : label}
        onFocus={() => { setOpen(true); setQuery(""); setHighlight(0); }}
        onClick={() => setOpen(true)}
        onBlur={() => { setOpen(false); setQuery(""); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setHighlight(0); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            const next = !open ? 0 : Math.max(0, Math.min(filtered.length - 1, highlight + (event.key === "ArrowDown" ? 1 : -1)));
            setHighlight(next);
            document.getElementById(`${inputId}-${next}`)?.scrollIntoView({ block: "nearest" });
          } else if (event.key === "Enter" && expanded) {
            event.preventDefault(); if (filtered[highlight]) choose(filtered[highlight].id);
          } else if (event.key === "Escape") { event.preventDefault(); setOpen(false); setQuery(""); }
        }}/>
      {selected && <button type="button" className="specimen-select-clear" aria-label="Clear specimen tube" disabled={loading || error} onClick={() => choose("")}>Clear</button>}
      {expanded && <ul id={`${inputId}-list`} className="specimen-select-options" role="listbox" aria-label="Specimen tubes">
        {filtered.map((option, index) => <li key={option.id} id={`${inputId}-${index}`} role="option" aria-selected={selected === option.id}
          className={index === highlight ? "highlighted" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option.id)}>{option.label}</li>)}
        {!filtered.length && <li role="presentation">No matching specimen tubes.</li>}
      </ul>}
    </div>
    {error ? <small role="alert">Unable to load specimen tubes. Please reload and try again.</small> : <small>Search by name, code, sample type, or cap color.</small>}
  </div>;
}
