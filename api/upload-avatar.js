
import Busboy from "busboy";


import { put } from "@vercel/blob";


import sharp from "sharp";



const MAX_DIMENSION = 256; // Output avatar: max 256 × 256 px (aspect ratio preserved)
const WEBP_QUALITY = 80; // WebP quality 0–100. 80 = visually close to lossless, ~4× smaller than JPEG
const WEBP_EFFORT = 6; // Compression effort 0–6. 6 = smallest file, ~10% slower to encode. Fine for server-side.
const ALPHA_QUALITY = 80; // Quality for the WebP alpha (transparency) channel
const MAX_INPUT_MB = 10;
const MAX_INPUT_BYTES = MAX_INPUT_MB * 1024 * 1024;


const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg", // some browsers send this variant
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);


export const config = {
  api: {
    bodyParser: false,
    sizeLimit: "10mb",
  },
};


function parseBusboy(req) {
  return new Promise((resolve, reject) => {

    const bb = Busboy({
      headers: req.headers,
      limits: {
        fileSize: MAX_INPUT_BYTES,
        files: 1,
        fields: 0,
      },
    });


    let fileBuffer = null;
    let filename = "avatar";
    let mimetype = "application/octet-stream";
    let fileTooLarge = false;

   
    bb.on("file", (fieldname, stream, info) => {
      filename = info.filename || "avatar";
      mimetype = info.mimeType || "application/octet-stream";


      const chunks = [];

      stream.on("data", (chunk) => {
        chunks.push(chunk);
      });


      stream.on("limit", () => {
        fileTooLarge = true;
        stream.resume();
      });

      stream.on("end", () => {
        if (!fileTooLarge) {
          fileBuffer = Buffer.concat(chunks);
        }
      });

      stream.on("error", reject); 
    });


    bb.on("close", () => {
      if (fileTooLarge) {
        reject(new RangeError(`FILE_TOO_LARGE`));
        return;
      }
      if (!fileBuffer) {
        reject(new TypeError("NO_FILE_FOUND"));
        return;
      }
      resolve({ fileBuffer, filename, mimetype });
    });

    bb.on("error", reject); 

    req.pipe(bb);
  });
}


export default async function handler(req, res) {
  // ── Method guard ─────────────────────────────────────────────
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    let fileBuffer, filename, mimetype;

    try {
      ({ fileBuffer, filename, mimetype } = await parseBusboy(req));
    } catch (parseErr) {
      if (
        parseErr instanceof RangeError &&
        parseErr.message.startsWith("FILE_TOO_LARGE")
      ) {
        return res.status(413).json({
          error: `File too large. Maximum allowed size is 10 MB.`,
        });
      }
      if (
        parseErr instanceof TypeError &&
        parseErr.message === "NO_FILE_FOUND"
      ) {
        return res.status(400).json({
          error:
            'No file received. Send the image as a form field named "file".',
        });
      }
      throw parseErr;
    }

    if (!ALLOWED_TYPES.has(mimetype)) {
      return res.status(415).json({
        error: `Unsupported file type "${mimetype}". Allowed: JPEG, PNG, GIF, WebP, BMP, TIFF.`,
      });
    }

  
    const processedBuffer = await sharp(fileBuffer)
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: WEBP_QUALITY,
        effort: WEBP_EFFORT,
        alphaQuality: ALPHA_QUALITY,
      })
      .toBuffer();

    
    const rawBase = (filename || "avatar").replace(/\.[^.]+$/, ""); // strip extension
    const safeName =
      rawBase
        .replace(/\s+/g, "_") // spaces → underscores
        .replace(/[^a-zA-Z0-9_-]/g, "") // remove everything else unsafe
        .slice(0, 60) || // cap length
      "avatar"; // fallback

    // Collision-resistant suffix: millisecond timestamp + 9-digit random integer
    const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
    const blobPath = `avatars/${safeName}_${uniqueSuffix}.webp`;

 
    const blob = await put(blobPath, processedBuffer, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
    });

   
    const inputKB = (fileBuffer.byteLength / 1024).toFixed(1);
    const outputKB = (processedBuffer.byteLength / 1024).toFixed(1);
    console.log(
      `[upload-avatar] ${filename} | ${inputKB} KB → ${outputKB} KB (WebP) | ${blob.url}`,
    );

    return res.status(200).json({
      url: blob.url,
      sizeKB: Number(outputKB),
      message: "Avatar uploaded and compressed successfully.",
    });
  } catch (err) {
    // Catch-all: sharp decode failure (corrupt file), Blob network error, etc.
    console.error("[upload-avatar] Unexpected error:", err);

    // Expose the error message in development to help with debugging,
    // but hide it in production so internal details are not leaked.
    const detail =
      process.env.NODE_ENV === "development" ? err.message : undefined;

    return res.status(500).json({
      error: "Server error while processing the upload.",
      details: detail,
    });
  }
}