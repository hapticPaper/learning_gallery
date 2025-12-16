export function withBasePath(src: string): string {
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
