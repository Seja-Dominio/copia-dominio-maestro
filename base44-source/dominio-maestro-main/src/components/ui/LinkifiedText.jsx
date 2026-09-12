/**
 * Renders text with auto-detected URLs as clickable links.
 * Preserves line breaks.
 */
export default function LinkifiedText({ text, className = "" }) {
  if (!text) return null;

  const urlRegex = /(https?:\/\/[^\s<]+)/g;

  const lines = text.split("\n");

  return (
    <div className={className}>
      {lines.map((line, li) => (
        <span key={li}>
          {li > 0 && <br />}
          {line.split(urlRegex).map((part, pi) =>
            urlRegex.test(part) ? (
              <a
                key={pi}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary/80 break-all"
                onClick={e => e.stopPropagation()}
              >
                {part}
              </a>
            ) : (
              <span key={pi}>{part}</span>
            )
          )}
        </span>
      ))}
    </div>
  );
}