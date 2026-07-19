/**
 * Shared types for file uploads.
 *
 * Avoids depending on @types/multer namespace augmentation
 * which broke in @types/multer v2 + @types/express v5.
 */
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}
