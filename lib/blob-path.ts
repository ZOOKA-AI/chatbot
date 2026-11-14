const FILES_PREFIX = "/api/files/";

export function isWorkspaceBlobPath(pathname: string, organizationId: string) {
  const segments = pathname.split("/");
  return (
    segments.length >= 2 &&
    segments[0] === organizationId &&
    segments.every(
      (segment) =>
        segment !== "" &&
        segment !== "." &&
        segment !== ".." &&
        !/[\\/%]/.test(segment)
    )
  );
}

export function blobPathToUrl(pathname: string) {
  return FILES_PREFIX + pathname.split("/").map(encodeURIComponent).join("/");
}

export function blobUrlToPath(url: string) {
  if (!url.startsWith(FILES_PREFIX)) {
    return null;
  }
  try {
    const segments = url
      .slice(FILES_PREFIX.length)
      .split("/")
      .map(decodeURIComponent);
    if (segments.some((segment) => segment.includes("/"))) {
      throw new Error("Invalid blob path");
    }
    return segments.join("/");
  } catch {
    throw new Error("Invalid blob path");
  }
}
