import { useState } from "react";

/**
 * Shows a letter tile until the site's own /favicon.ico (no third-party icon
 * service) loads, and keeps the tile when the site has none.
 */
export function Favicon({ url, name }: { url: string; name: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  let origin: string | null = null;
  try {
    origin = new URL(url).origin;
  } catch {
    origin = null;
  }

  return (
    <span className="favicon-slot" aria-hidden="true">
      {status !== "loaded" && (
        <span className="favicon favicon-letter">{(name.trim()[0] ?? "?").toUpperCase()}</span>
      )}
      {origin !== null && status !== "failed" && (
        <img
          className={status === "loaded" ? "favicon" : "favicon pending"}
          src={`${origin}/favicon.ico`}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => { setStatus("loaded"); }}
          onError={() => { setStatus("failed"); }}
        />
      )}
    </span>
  );
}
