import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import {
  getDownloadURL,
  getMetadata,
  list,
  ref as storageRef,
  uploadBytes,
  type ListResult,
} from "firebase/storage";

import { requireUser } from "@/integrations/firebase/auth";
import { firebaseStorage, firestore } from "@/integrations/firebase/client";

const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

function assertSafeId(value: string, label: string): void {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(value)) {
    throw new Error(`${label} is not a valid Firebase identifier.`);
  }
}

async function mediaBlob(dataUrl: string): Promise<Blob> {
  if (!dataUrl.startsWith("data:image/") && !dataUrl.startsWith("data:video/")) {
    throw new Error("Generated scene media must be an image or video data URL.");
  }
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("The generated scene image could not be read.");
  const blob = await response.blob();
  if (!ALLOWED_MEDIA_TYPES.has(blob.type)) {
    throw new Error(`Unsupported generated media type: ${blob.type || "unknown"}.`);
  }
  if (blob.size > MAX_MEDIA_BYTES) {
    throw new Error("Generated scene media must be smaller than 50 MB.");
  }
  return blob;
}

/** Upload generated scene art and return its durable HTTPS download URL. */
export async function saveSceneImage(
  saveId: string,
  sceneId: string,
  dataUrl: string,
): Promise<string> {
  const user = await requireUser();
  assertSafeId(saveId, "Adventure ID");
  assertSafeId(sceneId, "Scene ID");
  const blob = await mediaBlob(dataUrl);
  const object = storageRef(
    firebaseStorage,
    `users/${user.uid}/adventures/${saveId}/scenes/${sceneId}`,
  );
  await uploadBytes(object, blob, {
    contentType: blob.type,
    cacheControl: "private,max-age=31536000,immutable",
    customMetadata: { adventureId: saveId, sceneId },
  });
  const rawDownloadUrl = await getDownloadURL(object);
  const isVideo = blob.type.startsWith("video/");
  const videoExtension =
    blob.type === "video/webm" ? "webm" : blob.type === "video/quicktime" ? "mov" : "mp4";
  // The fragment is ignored by Storage but lets the existing media renderer
  // distinguish extensionless Firebase download URLs from still images.
  const downloadUrl = isVideo ? `${rawDownloadUrl}#scene.${videoExtension}` : rawDownloadUrl;

  const adventureRef = doc(firestore, "adventures", saveId);
  const sceneRef = doc(adventureRef, "scenes", sceneId);
  const batch = writeBatch(firestore);
  batch.update(sceneRef, { imageUrl: downloadUrl, updatedAt: serverTimestamp() });
  batch.update(
    adventureRef,
    isVideo
      ? { updatedAt: serverTimestamp() }
      : { coverImageUrl: downloadUrl, updatedAt: serverTimestamp() },
  );
  await batch.commit();
  return downloadUrl;
}

export async function loadSceneImages(saveId: string): Promise<Record<string, string>> {
  const user = await requireUser();
  assertSafeId(saveId, "Adventure ID");
  const folder = storageRef(firebaseStorage, `users/${user.uid}/adventures/${saveId}/scenes`);
  const items: ListResult["items"] = [];
  let pageToken: string | undefined;
  do {
    const page = await list(folder, { maxResults: 1000, pageToken });
    items.push(...page.items);
    pageToken = page.nextPageToken;
  } while (pageToken);

  const entries = await Promise.all(
    items.map(async (item) => {
      const [url, metadata] = await Promise.all([getDownloadURL(item), getMetadata(item)]);
      if (!metadata.contentType?.startsWith("video/")) return [item.name, url] as const;
      const extension =
        metadata.contentType === "video/webm"
          ? "webm"
          : metadata.contentType === "video/quicktime"
            ? "mov"
            : "mp4";
      return [item.name, `${url}#scene.${extension}`] as const;
    }),
  );
  return Object.fromEntries(entries);
}
