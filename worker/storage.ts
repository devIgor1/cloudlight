import { AwsClient } from "aws4fetch";
import { XMLParser } from "fast-xml-parser";
import SparkMD5 from "spark-md5";
import type { Part, TransferFile } from "../shared/contracts";
import { LIMITS } from "../shared/contracts";
import type { Env } from "./types";
import { all, assert, hash, local, spend } from "./core";
const xml = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  processEntities: false,
});
let cachedClient:
  { id: string; secret: string; region: string; client: AwsClient } | undefined;
const list = <T>(item: T | T[] | undefined): T[] =>
  item === undefined ? [] : Array.isArray(item) ? item : [item];
export const cleanEtag = (etag: string) =>
  etag.replaceAll('"', "").toLowerCase();
export function multipartEtag(parts: Part[]) {
  const raw = Uint8Array.from(
    parts.flatMap((p) =>
      [...cleanEtag(p.etag).matchAll(/../g)].map((m) => parseInt(m[0], 16)),
    ),
  );
  return `${SparkMD5.ArrayBuffer.hash(raw.buffer)}-${parts.length}`;
}
export class Storage {
  constructor(private env: Env) {}
  private url(key = "", query: Record<string, string> = {}) {
    const url = new URL(
      `${this.env.B2_ENDPOINT.replace(/\/$/, "")}/${encodeURIComponent(this.env.B2_BUCKET)}/${key.split("/").map(encodeURIComponent).join("/")}`,
    );
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url;
  }
  private client() {
    // AwsClient caches the derived daily signing key. Reusing it avoids four
    // HMAC derivations for every S3 operation on the Workers Free CPU budget.
    if (
      !cachedClient ||
      cachedClient.id !== this.env.B2_KEY_ID ||
      cachedClient.secret !== this.env.B2_APPLICATION_KEY ||
      cachedClient.region !== this.env.B2_REGION
    )
      cachedClient = {
        id: this.env.B2_KEY_ID,
        secret: this.env.B2_APPLICATION_KEY,
        region: this.env.B2_REGION,
        client: new AwsClient({
          accessKeyId: this.env.B2_KEY_ID,
          secretAccessKey: this.env.B2_APPLICATION_KEY,
          service: "s3",
          region: this.env.B2_REGION,
          retries: 0,
        }),
      };
    return cachedClient.client;
  }
  private async request(
    method: string,
    key: string,
    query: Record<string, string> = {},
    body?: string,
    headers: Record<string, string> = {},
  ) {
    await spend(this.env, "storage_operations", LIMITS.operations);
    const signed = await this.client().sign(this.url(key, query), {
      method,
      body,
      headers,
    });
    const response = await fetch(signed, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok && response.status !== 404 && response.status !== 416) {
      const code = (await response.text()).match(
        /<Code>([A-Za-z0-9]+)<\/Code>/,
      )?.[1];
      // Keep diagnostics useful without propagating the provider's XML, keys,
      // signed URLs or request identifiers to application logs or responses.
      throw new Error(
        `STORAGE_UNAVAILABLE:${response.status}:${code || "unknown"}`,
      );
    }
    return response;
  }
  async start(file: TransferFile) {
    if (local(this.env))
      return (
        await this.env.LOCAL_BUCKET!.createMultipartUpload(file.object_key, {
          httpMetadata: { contentType: "application/octet-stream" },
        })
      ).uploadId;
    // Recover a provider success whose response or subsequent D1 write was lost.
    const pending = await this.request("GET", "", {
      uploads: "",
      prefix: file.object_key,
      "max-uploads": "10",
    });
    const rows = list<{ Key: string; UploadId: string }>(
      xml.parse(await pending.text()).ListMultipartUploadsResult?.Upload,
    );
    const existing = rows.find((r) => r.Key === file.object_key);
    if (existing) return existing.UploadId;
    const response = await this.request(
      "POST",
      file.object_key,
      { uploads: "" },
      undefined,
      {
        "content-type": "application/octet-stream",
        "x-amz-server-side-encryption": "AES256",
      },
    );
    assert(response.ok, 503, "Não foi possível iniciar o upload.");
    const result = xml.parse(
      await response.text(),
    ).InitiateMultipartUploadResult;
    assert(result?.UploadId, 503, "Não foi possível iniciar o upload.");
    return String(result.UploadId);
  }
  async authorize(
    file: TransferFile,
    number: number,
    size: number,
    md5: string,
    expires: number,
  ) {
    if (local(this.env)) {
      const signature = await hash(
        `${file.id}:${number}:${size}:${md5}:${expires}`,
        this.env.AUTH_SECRET,
      );
      return {
        url: `/api/local/parts/${file.id}/${number}?expires=${expires}&signature=${signature}`,
        headers: { "Content-MD5": md5 },
        expires,
      };
    }
    await spend(this.env, "storage_operations", LIMITS.operations);
    const url = this.url(file.object_key, {
      uploadId: file.upload_id!,
      partNumber: String(number),
      "X-Amz-Expires": "300",
    });
    const signed = await this.client().sign(url, {
      method: "PUT",
      headers: { "content-length": String(size), "content-md5": md5 },
      aws: { signQuery: true, allHeaders: true },
    });
    return { url: signed.url, headers: { "Content-MD5": md5 }, expires };
  }
  async parts(file: TransferFile): Promise<Part[]> {
    if (local(this.env))
      return (
        await all<Part>(
          this.env,
          "SELECT number,size,etag,md5 FROM parts WHERE file_id=? AND etag IS NOT NULL ORDER BY number",
          file.id,
        )
      ).map((p) => ({
        ...p,
        etag: [...atob(p.md5!)]
          .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
          .join(""),
      }));
    const r = await this.request("GET", file.object_key, {
      uploadId: file.upload_id!,
      "max-parts": "1000",
    });
    assert(r.ok, 409, "O upload não está disponível para retomada.");
    const data = xml.parse(await r.text()).ListPartsResult;
    assert(
      data && data.IsTruncated !== "true",
      409,
      "Quantidade inesperada de partes.",
    );
    return list<{ PartNumber: string; Size: string; ETag: string }>(
      data.Part,
    ).map((p) => ({
      number: Number(p.PartNumber),
      size: Number(p.Size),
      etag: cleanEtag(p.ETag),
    }));
  }
  async head(file: TransferFile) {
    if (local(this.env)) {
      const r = await this.env.LOCAL_BUCKET!.head(file.object_key);
      return r ? { size: r.size, etag: cleanEtag(r.etag) } : null;
    }
    const r = await this.request("HEAD", file.object_key);
    if (r.status === 404) return null;
    assert(r.ok, 503, "Não foi possível verificar o arquivo.");
    return {
      size: Number(r.headers.get("content-length")),
      etag: cleanEtag(r.headers.get("etag") || ""),
    };
  }
  async complete(file: TransferFile, parts: Part[]) {
    if (local(this.env)) {
      const stored = await all<Part>(
        this.env,
        "SELECT number,etag FROM parts WHERE file_id=? AND etag IS NOT NULL ORDER BY number",
        file.id,
      );
      await this.env
        .LOCAL_BUCKET!.resumeMultipartUpload(file.object_key, file.upload_id!)
        .complete(stored.map((p) => ({ partNumber: p.number, etag: p.etag })));
      return;
    }
    const content = `<CompleteMultipartUpload>${parts.map((p) => `<Part><PartNumber>${p.number}</PartNumber><ETag>${cleanEtag(p.etag)}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
    const r = await this.request(
      "POST",
      file.object_key,
      { uploadId: file.upload_id! },
      content,
      { "content-type": "application/xml" },
    );
    const result = xml.parse(await r.text());
    assert(
      r.ok && result.CompleteMultipartUploadResult && !result.Error,
      503,
      "A finalização do arquivo falhou. Tente novamente.",
    );
  }
  async download(file: TransferFile, range: string | null) {
    if (!local(this.env))
      return this.request(
        "GET",
        file.object_key,
        {},
        undefined,
        range ? { range } : {},
      );
    let offset = 0,
      length = file.size;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      assert(m && (m[1] || m[2]), 416, "Intervalo inválido.");
      if (!m[1]) {
        length = Math.min(Number(m[2]), file.size);
        offset = file.size - length;
      } else {
        offset = Number(m[1]);
        length =
          Math.min(m[2] ? Number(m[2]) + 1 : file.size, file.size) - offset;
      }
      assert(offset < file.size && length > 0, 416, "Intervalo inválido.");
    }
    const object = await this.env.LOCAL_BUCKET!.get(file.object_key, {
      range: { offset, length },
    });
    assert(object && "body" in object, 404, "Arquivo não encontrado.");
    return new Response(object.body, {
      status: range ? 206 : 200,
      headers: {
        "content-length": String(length),
        "accept-ranges": "bytes",
        ...(range
          ? {
              "content-range": `bytes ${offset}-${offset + length - 1}/${file.size}`,
            }
          : {}),
      },
    });
  }
  async remove(file: TransferFile): Promise<boolean> {
    if (local(this.env)) {
      if (file.upload_id)
        await this.env
          .LOCAL_BUCKET!.resumeMultipartUpload(file.object_key, file.upload_id)
          .abort();
      await this.env.LOCAL_BUCKET!.delete(file.object_key);
      return !(await this.env.LOCAL_BUCKET!.head(file.object_key));
    }
    // Delete actual versions, not a delete marker. Keep the reservation until both lists are empty.
    const u = await this.request("GET", "", {
      uploads: "",
      prefix: file.object_key,
      "max-uploads": "5",
    });
    assert(u.ok, 503, "A limpeza será tentada novamente.");
    const uploads = xml.parse(await u.text()).ListMultipartUploadsResult;
    for (const row of list<{ Key: string; UploadId: string }>(uploads?.Upload)
      .filter((r) => r.Key === file.object_key)
      .slice(0, 3)) {
      const r = await this.request("DELETE", file.object_key, {
        uploadId: row.UploadId,
      });
      await r.body?.cancel();
    }
    const v = await this.request("GET", "", {
      versions: "",
      prefix: file.object_key,
      "max-keys": "5",
    });
    assert(v.ok, 503, "A limpeza será tentada novamente.");
    const versions = xml.parse(await v.text()).ListVersionsResult;
    const rows = [
      ...list<{ Key: string; VersionId: string }>(versions?.Version),
      ...list<{ Key: string; VersionId: string }>(versions?.DeleteMarker),
    ].filter((r) => r.Key === file.object_key);
    for (const row of rows.slice(0, 3)) {
      const r = await this.request("DELETE", file.object_key, {
        versionId: row.VersionId,
      });
      await r.body?.cancel();
    }
    // A later pass verifies absence after successful deletions; failures never release bytes.
    return (
      !!uploads &&
      !!versions &&
      list(uploads.Upload).length === 0 &&
      rows.length === 0 &&
      uploads.IsTruncated !== "true" &&
      versions.IsTruncated !== "true"
    );
  }
}
