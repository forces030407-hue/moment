import { Router, type IRouter } from "express";
import { getUploadUrl, getDownloadUrl, deleteObject, listObjects } from "../lib/storage";

const router: IRouter = Router();

router.post("/storage/upload-url", async (req, res) => {
  const { key, contentType } = req.body as { key?: string; contentType?: string };
  if (!key || !contentType) {
    res.status(400).json({ error: "key and contentType are required" });
    return;
  }
  try {
    const url = await getUploadUrl(key, contentType);
    res.json({ url, key });
  } catch (err) {
    req.log.error(err, "Failed to generate upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.get("/storage/download-url", async (req, res) => {
  const { key } = req.query as { key?: string };
  if (!key) {
    res.status(400).json({ error: "key is required" });
    return;
  }
  try {
    const url = await getDownloadUrl(key);
    res.json({ url, key });
  } catch (err) {
    req.log.error(err, "Failed to generate download URL");
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

router.delete("/storage/object", async (req, res) => {
  const { key } = req.body as { key?: string };
  if (!key) {
    res.status(400).json({ error: "key is required" });
    return;
  }
  try {
    await deleteObject(key);
    res.json({ success: true, key });
  } catch (err) {
    req.log.error(err, "Failed to delete object");
    res.status(500).json({ error: "Failed to delete object" });
  }
});

router.get("/storage/list", async (req, res) => {
  const { prefix } = req.query as { prefix?: string };
  try {
    const objects = await listObjects(prefix);
    res.json({ objects });
  } catch (err) {
    req.log.error(err, "Failed to list objects");
    res.status(500).json({ error: "Failed to list objects" });
  }
});

export default router;
