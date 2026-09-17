const BUCKET = "job-attachments";

export function getAttachmentPath(attachment) {
  if (attachment?.path) return String(attachment.path);
  const url = String(attachment?.url || attachment || "");
  const markers = [
    `/storage/v1/object/sign/${BUCKET}/`,
    `/storage/v1/object/public/${BUCKET}/`,
    `/storage/v1/object/authenticated/${BUCKET}/`,
  ];
  const marker = markers.find((candidate) => url.includes(candidate));
  if (!marker) return "";
  const rawPath = url.slice(url.indexOf(marker) + marker.length).split("?")[0];
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}
