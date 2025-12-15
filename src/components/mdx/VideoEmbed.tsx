import { cn } from "@/lib/cn";

type VideoKind = "youtube" | "file";

export function VideoEmbed({
  src,
  title,
  kind,
  className,
}: {
  src: string;
  title?: string;
  kind?: VideoKind;
  className?: string;
}) {
  const resolvedKind = kind ?? inferKind(src);
  if (resolvedKind === "youtube") {
    const embedSrc = toYouTubeEmbedUrl(src);
    if (!embedSrc) {
      return null;
    }

    return (
      <div
        className={cn(
          "not-prose my-6 overflow-hidden rounded-xl border border-zinc-200 bg-black shadow-sm dark:border-zinc-800",
          className,
        )}
      >
        <div className="relative aspect-video">
          <iframe
            className="absolute inset-0 h-full w-full"
            src={embedSrc}
            title={title ?? "Video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  return (
    <video
      className={cn(
        "not-prose my-6 w-full overflow-hidden rounded-xl border border-zinc-200 bg-black shadow-sm dark:border-zinc-800",
        className,
      )}
      controls
      playsInline
      src={withBasePath(src)}
    />
  );
}

function withBasePath(src: string): string {
  if (!src.startsWith("/")) return src;

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (!basePath) return src;

  const normalizedBasePath = basePath.endsWith("/")
    ? basePath.slice(0, -1)
    : basePath;

  if (src === normalizedBasePath || src.startsWith(`${normalizedBasePath}/`)) {
    return src;
  }

  return `${normalizedBasePath}${src}`;
}

function inferKind(src: string): VideoKind {
  if (src.includes("youtube.com") || src.includes("youtu.be")) return "youtube";
  return "file";
}

function toYouTubeEmbedUrl(src: string): string | null {
  try {
    const url = new URL(src);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.replace(/^\//, "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (url.hostname.endsWith("youtube.com")) {
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }

  return null;
}
