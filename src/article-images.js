import { sameOriginWrite } from './auth.js';

export const maxArticleImageBytes = 1536 * 1024;
const imageTypes = {
  'image/png': [137, 80, 78, 71, 13, 10, 26, 10],
  'image/jpeg': [255, 216, 255],
  'image/webp': [82, 73, 70, 70],
};

export async function articleImagePage(request, env, url, editor, id) {
  if (id && request.method === 'GET') {
    const path = '/chronicle/images/' + id;
    const image = await env.DB.prepare(`SELECT mime, bytes FROM article_images WHERE id = ? AND
      (? OR EXISTS (SELECT 1 FROM articles WHERE published_at IS NOT NULL AND body_format = 'rich'
      AND instr(body, ?) > 0))`).bind(id, Number(editor), '<img src="' + path + '" alt="').first();
    if (!image) return new Response('Image unavailable.', { status: 404, headers: { 'Cache-Control':'no-store' } });
    return new Response(Uint8Array.from(image.bytes), { headers: {
      'Content-Type': image.mime, 'X-Content-Type-Options':'nosniff', 'Cache-Control':'private, no-store',
    } });
  }
  if (id || request.method !== 'POST') return new Response('Method not allowed.', { status: 405 });
  if (!editor || !sameOriginWrite(request, url)) return new Response('Image upload is restricted to article editors.', { status: 403 });
  const mime = request.headers.get('Content-Type');
  const signature = Object.hasOwn(imageTypes, mime) ? imageTypes[mime] : null;
  if (!signature) return new Response('Paste a PNG, JPEG, or WebP image.', { status: 415 });
  if (Number(request.headers.get('Content-Length')) > maxArticleImageBytes) {
    return new Response('Image is too large. The limit is 1.5 MB.', { status: 413 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > maxArticleImageBytes) return new Response('Image is too large. The limit is 1.5 MB.', { status: 413 });
  if (!signature.every((byte, index) => byte === bytes[index]) ||
      (mime === 'image/webp' && String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP')) {
    return new Response('The image format does not match its contents.', { status: 415 });
  }
  const key = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO article_images (id, mime, bytes) VALUES (?, ?, ?)').bind(key, mime, bytes).run();
  return Response.json({ path:'/chronicle/images/' + key }, { status: 201, headers: { 'Cache-Control':'no-store' } });
}
